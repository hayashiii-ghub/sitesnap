import { randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CaptureResult } from "./capture.ts"
import type { RunSource } from "./input.ts"
import { captureFailureMessage, SCHEMA_VERSION, statusFromResults, type CollectionStatus } from "./protocol.ts"

export async function writeRunArtifact(options: {
  domain: string
  siteDir: string
  source: RunSource
  archiveStatus: CollectionStatus
  results: CaptureResult[]
  runOptions: Record<string, unknown>
}): Promise<string> {
  const runsDir = path.join(options.siteDir, "runs")
  await mkdir(runsDir, { recursive: true })
  const file = path.join(runsDir, "latest.json")
  const payload = {
    schema_version: SCHEMA_VERSION,
    domain: options.domain,
    source: options.source,
    run_status: statusFromResults(options.results),
    archive_status: options.archiveStatus,
    options: options.runOptions,
    captures: options.results.map((result) => ({
      url: result.url,
      viewport: result.mode,
      device: result.device ?? null,
      status: captureFailureMessage(result) ? "failed" : "success",
      screenshot: result.file ? path.relative(options.siteDir, result.file) : null,
      captured_at: result.capturedAt ?? null,
      http_status: result.httpStatus ?? null,
      duration_ms: result.durationMs ?? null,
      error: captureFailureMessage(result),
    })),
  }
  const temporary = `${file}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`)
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
  return file
}
