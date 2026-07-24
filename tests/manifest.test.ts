import { expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CaptureResult } from "../src/capture.ts"
import { buildArchiveIndex, readArchiveManifest, writeArchiveManifest } from "../src/manifest.ts"
import { SiteSnapError } from "../src/errors.ts"
import { cleanupTmpDir, makeTmpDir } from "./helpers.ts"

function result(overrides: Partial<CaptureResult> = {}): CaptureResult {
  return {
    url: "https://example.com/",
    mode: "desktop",
    slug: "index--1234567890abcdef",
    title: "Example",
    httpStatus: 200,
    durationMs: 10,
    capturedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  }
}

test("manifest merges sources and retries into cumulative archive status", async () => {
  const out = await makeTmpDir()
  const siteDir = path.join(out, "example.com")
  await mkdir(siteDir, { recursive: true })
  try {
    const first = await writeArchiveManifest({
      domain: "example.com",
      siteDir,
      source: { kind: "sitemap", value: "https://example.com/sitemap.xml" },
      results: [
        result({ file: path.join(siteDir, "screenshots/desktop/index.png") }),
        result({ mode: "mobile", device: "iPhone 15", file: undefined, error: "timeout" }),
      ],
    })
    expect(first.status).toBe("partial")
    const repaired = await writeArchiveManifest({
      domain: "example.com",
      siteDir,
      results: [result({ mode: "mobile", device: "iPhone 15", file: path.join(siteDir, "screenshots/mobile/index.png") })],
    })
    expect(repaired.status).toBe("complete")
    expect(repaired.sources).toEqual([{ kind: "sitemap", value: "https://example.com/sitemap.xml" }])
    expect(repaired.pages[0]?.captures.desktop?.status).toBe("success")
    expect(repaired.pages[0]?.captures.mobile?.status).toBe("success")
  } finally {
    await cleanupTmpDir(out)
  }
})

test("HTTP error captures remain archived but are marked failed", async () => {
  const out = await makeTmpDir()
  const siteDir = path.join(out, "example.com")
  await mkdir(siteDir, { recursive: true })
  try {
    const manifest = await writeArchiveManifest({ domain: "example.com", siteDir, results: [result({ httpStatus: 404, file: path.join(siteDir, "screenshots/desktop/index.png") })] })
    expect(manifest.status).toBe("failed")
    expect(manifest.pages[0]?.captures.desktop?.error).toBe("HTTP 404")
  } finally {
    await cleanupTmpDir(out)
  }
})

test("unsupported or unsafe manifests fail closed without modification", async () => {
  const out = await makeTmpDir()
  const siteDir = path.join(out, "example.com")
  await mkdir(siteDir, { recursive: true })
  const file = path.join(siteDir, "manifest.json")
  try {
    const future = '{"schema_version":99,"important":"keep"}\n'
    await writeFile(file, future)
    await expect(writeArchiveManifest({ domain: "example.com", siteDir, results: [result()] })).rejects.toMatchObject({ code: "MANIFEST_SCHEMA_UNSUPPORTED" })
    expect(await readFile(file, "utf8")).toBe(future)

    const traversal = {
      schema_version: 1,
      domain: "example.com",
      sources: [],
      updated_at: "2026-01-01T00:00:00Z",
      status: "complete",
      pages: [{
        url: "https://example.com/",
        slug: "index",
        title: "",
        captures: { desktop: { status: "success", path: "../escape.png", captured_at: "now", http_status: 200, duration_ms: 1, error: null } },
      }],
    }
    await writeFile(file, JSON.stringify(traversal))
    await expect(readArchiveManifest(siteDir)).rejects.toBeInstanceOf(SiteSnapError)
  } finally {
    await cleanupTmpDir(out)
  }
})

test("archive index is deterministic and reflects each manifest", async () => {
  const out = await makeTmpDir()
  try {
    for (const domain of ["b.example", "a.example"]) {
      const siteDir = path.join(out, domain)
      await mkdir(siteDir, { recursive: true })
      await writeArchiveManifest({ domain, siteDir, results: [result({ url: `https://${domain}/`, file: path.join(siteDir, "screenshots/desktop/index.png") })] })
    }
    const index = await buildArchiveIndex(out)
    expect(index.archives.map((archive) => archive.domain)).toEqual(["a.example", "b.example"])
    expect(JSON.parse(await readFile(path.join(out, "index.json"), "utf8")).schema_version).toBe(1)
  } finally {
    await cleanupTmpDir(out)
  }
})
