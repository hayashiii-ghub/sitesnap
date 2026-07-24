import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { CliContext } from "../src/cli-args.ts"

export async function makeTmpDir(prefix = "sitesnap-test-"): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

export async function cleanupTmpDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

export function makeCtx(overrides: Partial<CliContext> & { captureOptions?: CliContext["captureOptions"] } = {}): CliContext {
  const outDir = overrides.outDir ?? "/tmp/sitesnap-test"
  const base: CliContext = {
    sub: "list",
    args: [],
    json: true,
    outDir,
    outFile: null,
    sitemap: null,
    input: null,
    limit: null,
    exclude: null,
    captureOptions: { outDir },
  }
  return { ...base, ...overrides, captureOptions: { ...base.captureOptions, ...overrides.captureOptions } }
}

export const FIXTURE_URLSET = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`
