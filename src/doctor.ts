import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import type { CaptureResult } from "./capture.ts"

export type DoctorViewport = "desktop" | "mobile"
export type DoctorCaptureStatus = "success" | "failed" | "skipped"

export interface DoctorCapture {
  url: string
  viewport: DoctorViewport
  status: DoctorCaptureStatus
  reason?: string
  screenshotPath?: string
  httpStatus?: number
  durationMs?: number
}

export interface DoctorReport {
  runDir: string
  domain: string
  totalCaptures: number
  failedCaptures: number
  blankCaptures: number
  timeoutCaptures: number
  httpErrorCaptures: number
  failed: DoctorCapture[]
  suggestedRetry: string | null
}

interface RunResultFile {
  domain?: string
  captures?: DoctorCapture[]
  results?: DoctorCapture[]
}

export interface RunArtifactOptions {
  domain: string
  siteDir: string
  source: string | null
  command: string
  results: CaptureResult[]
  options: Record<string, unknown>
}

function inferReason(capture: DoctorCapture): string | undefined {
  if (capture.reason) return capture.reason
  if (capture.httpStatus && capture.httpStatus >= 400) return `http_${capture.httpStatus}`
  return capture.status === "failed" ? "capture_failed" : undefined
}

async function isLikelyBlank(runDir: string, capture: DoctorCapture): Promise<boolean> {
  if (capture.reason === "blank_screenshot") return true
  if (!capture.screenshotPath) return false
  const screenshotPath = path.resolve(runDir, capture.screenshotPath)
  if (!existsSync(screenshotPath)) return false
  try {
    const s = await stat(screenshotPath)
    return s.size > 0 && s.size < 1024
  } catch {
    return false
  }
}

function isTimeout(capture: DoctorCapture): boolean {
  const reason = capture.reason || ""
  return reason === "timeout" || reason.toLowerCase().includes("timeout")
}

function isHttpError(capture: DoctorCapture): boolean {
  return Boolean(capture.httpStatus && capture.httpStatus >= 400)
}

function buildSuggestedRetry(domain: string, report: Pick<DoctorReport, "blankCaptures" | "timeoutCaptures">): string | null {
  if (report.blankCaptures > 0) {
    return `sitesnap retry ${domain} --wait-ms 2500 --pre-scroll full-page --force-visible`
  }
  if (report.timeoutCaptures > 0) {
    return `sitesnap retry ${domain} --wait-ms 3000 --concurrency 1`
  }
  return null
}

export async function analyzeRunDirectory(runDir: string): Promise<DoctorReport> {
  const resultPath = path.join(runDir, "result.json")
  if (!existsSync(resultPath)) {
    throw new Error(`result.json が見つかりません: ${resultPath}`)
  }

  const parsed = JSON.parse(await readFile(resultPath, "utf8")) as RunResultFile
  const captures = parsed.captures || parsed.results || []
  const domain = parsed.domain || (captures[0] ? new URL(captures[0].url).hostname : path.basename(runDir))
  const normalized = captures.map((capture) => ({ ...capture, reason: inferReason(capture) }))
  const failed = normalized.filter((capture) => capture.status === "failed" || capture.reason)

  let blankCaptures = 0
  for (const capture of failed) {
    if (await isLikelyBlank(runDir, capture)) blankCaptures += 1
  }

  const timeoutCaptures = failed.filter(isTimeout).length
  const httpErrorCaptures = failed.filter(isHttpError).length
  const partial = { blankCaptures, timeoutCaptures }

  return {
    runDir,
    domain,
    totalCaptures: normalized.length,
    failedCaptures: failed.length,
    blankCaptures,
    timeoutCaptures,
    httpErrorCaptures,
    failed,
    suggestedRetry: buildSuggestedRetry(domain, partial),
  }
}

export function buildDiagnosisMarkdown(report: DoctorReport): string {
  const lines = [
    "# sitesnap Diagnosis",
    "",
    `Run directory: ${report.runDir}`,
    `Domain: ${report.domain}`,
    `Total captures: ${report.totalCaptures}`,
    `Failed captures: ${report.failedCaptures}`,
    "",
    "## Findings",
    "",
    `- Blank-looking captures: ${report.blankCaptures}`,
    `- Timeout captures: ${report.timeoutCaptures}`,
    `- HTTP error captures: ${report.httpErrorCaptures}`,
  ]

  if (report.suggestedRetry) {
    lines.push("", "## Suggested Retry", "", "```bash", report.suggestedRetry, "```")
  }

  if (report.failed.length > 0) {
    lines.push("", "## Failed Captures", "")
    for (const capture of report.failed) {
      lines.push(`- ${capture.url} ${capture.viewport}: ${capture.reason || "capture_failed"}`)
    }
  }

  return `${lines.join("\n")}\n`
}

export function buildAgentTaskMarkdown(report: DoctorReport): string {
  const failedLines = report.failed.length
    ? report.failed.map((capture) => `- ${capture.url} ${capture.viewport}: ${capture.reason || "capture_failed"}`)
    : ["- None"]

  return `# sitesnap Agent Investigation Task

Goal:
Produce a stable sitesnap.config.json patch.

Artifacts:
- result.json: ./result.json
- options.json: ./options.json
- screenshot paths: see screenshotPath values in ./result.json

Summary:
- Domain: ${report.domain}
- Total captures: ${report.totalCaptures}
- Failed captures: ${report.failedCaptures}
- Blank-looking captures: ${report.blankCaptures}
- Timeout captures: ${report.timeoutCaptures}
- HTTP error captures: ${report.httpErrorCaptures}

Failed captures:
${failedLines.join("\n")}

Allowed config keys:
- waitMs
- timeoutMs
- concurrency
- preScroll
- forceVisible
- dismissSelectors

Suggested retry:
${report.suggestedRetry || "No simple retry command was detected."}

Output:
Return only a sitesnap.config.json patch and short notes.
`
}

export function buildSuggestedConfig(report: DoctorReport): Record<string, unknown> {
  const siteConfig: Record<string, unknown> = {}
  if (report.blankCaptures > 0) {
    siteConfig.waitMs = 2500
    siteConfig.preScroll = "full-page"
    siteConfig.forceVisible = true
  }
  if (report.timeoutCaptures > 0) {
    siteConfig.timeoutMs = 45000
    siteConfig.concurrency = 1
  }

  return {
    sites: {
      [report.domain]: siteConfig,
    },
  }
}

export async function writeDoctorFiles(runDir: string, report: DoctorReport): Promise<string[]> {
  const files = [
    ["diagnosis.md", buildDiagnosisMarkdown(report)],
    ["agent-task.md", buildAgentTaskMarkdown(report)],
    ["suggested-sitesnap.config.json", `${JSON.stringify(buildSuggestedConfig(report), null, 2)}\n`],
  ] as const

  const written: string[] = []
  for (const [name, content] of files) {
    const file = path.join(runDir, name)
    await writeFile(file, content)
    written.push(file)
  }
  return written
}

export async function writeRunArtifacts({
  domain,
  siteDir,
  source,
  command,
  results,
  options,
}: RunArtifactOptions): Promise<string> {
  const runDir = path.join(siteDir, "runs", "latest")
  await mkdir(runDir, { recursive: true })

  const captures: DoctorCapture[] = results.map((result) => ({
    url: result.url,
    viewport: result.mode,
    status: result.error ? "failed" : result.skipped ? "skipped" : "success",
    reason: result.error ? (result.error.toLowerCase().includes("timeout") ? "timeout" : "capture_failed") : undefined,
    screenshotPath: result.file ? path.relative(runDir, result.file) : undefined,
    httpStatus: result.httpStatus,
    durationMs: result.durationMs,
  }))

  // result.json / options.json は analyzeRunDirectory では使わないフィールド
  // (source / command / options) も含めて書き出す。これらは doctor --agent-task の
  // handoff 先 agent 向けの意図的な breadcrumb (buildAgentTaskMarkdown が参照)。
  await writeFile(
    path.join(runDir, "result.json"),
    `${JSON.stringify({ domain, source, command, captures }, null, 2)}\n`
  )
  await writeFile(path.join(runDir, "options.json"), `${JSON.stringify(options, null, 2)}\n`)
  return runDir
}
