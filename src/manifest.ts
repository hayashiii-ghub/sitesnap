import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { CaptureResult } from "./capture.ts"
import { SiteSnapError } from "./errors.ts"
import type { CaptureSource } from "./input.ts"
import { captureFailureMessage, SCHEMA_VERSION, type CollectionStatus } from "./protocol.ts"

export interface ManifestCapture {
  status: "success" | "failed"
  path: string | null
  captured_at: string
  http_status: number | null
  duration_ms: number | null
  error: string | null
  device?: string
}

export interface ManifestPage {
  url: string
  slug: string
  title: string
  captures: Partial<Record<"desktop" | "mobile", ManifestCapture>>
}

export interface ArchiveManifest {
  schema_version: typeof SCHEMA_VERSION
  domain: string
  sources: CaptureSource[]
  updated_at: string
  status: CollectionStatus
  pages: ManifestPage[]
}

export interface ArchiveIndexEntry {
  domain: string
  status: CollectionStatus
  pages: number
  updated_at: string
  manifest: string
}

export interface ArchiveIndex {
  schema_version: typeof SCHEMA_VERSION
  updated_at: string
  archives: ArchiveIndexEntry[]
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validSource(value: unknown): value is CaptureSource {
  return isRecord(value) && typeof value.value === "string" && (value.kind === "page" || value.kind === "sitemap" || value.kind === "input")
}

function safeArtifactPath(value: unknown): boolean {
  return value === null || (typeof value === "string" && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes(".."))
}

function validCapture(value: unknown): value is ManifestCapture {
  return isRecord(value)
    && (value.status === "success" || value.status === "failed")
    && safeArtifactPath(value.path)
    && typeof value.captured_at === "string"
    && (value.http_status === null || typeof value.http_status === "number")
    && (value.duration_ms === null || typeof value.duration_ms === "number")
    && (value.error === null || typeof value.error === "string")
    && (value.device === undefined || typeof value.device === "string")
}

function validateManifest(value: unknown, file: string): ArchiveManifest {
  if (!isRecord(value)) throw invalidManifest(file)
  if (value.schema_version !== SCHEMA_VERSION) {
    throw new SiteSnapError("MANIFEST_SCHEMA_UNSUPPORTED", `未対応のmanifest schemaです: ${String(value.schema_version)}`, "新しいsitesnapを使用するか別の--outを指定してください。既存manifestは変更されません。", { output: file })
  }
  if (typeof value.domain !== "string" || !Array.isArray(value.sources) || !value.sources.every(validSource)
    || typeof value.updated_at !== "string" || !["complete", "partial", "failed"].includes(String(value.status))
    || !Array.isArray(value.pages)) throw invalidManifest(file)

  const urls = new Set<string>()
  for (const page of value.pages) {
    if (!isRecord(page) || typeof page.url !== "string" || typeof page.slug !== "string" || typeof page.title !== "string" || !isRecord(page.captures)) throw invalidManifest(file)
    if (urls.has(page.url)) throw invalidManifest(file, `manifestに重複URLがあります: ${page.url}`)
    urls.add(page.url)
    for (const [mode, capture] of Object.entries(page.captures)) {
      if ((mode !== "desktop" && mode !== "mobile") || !validCapture(capture)) throw invalidManifest(file)
    }
  }
  return value as unknown as ArchiveManifest
}

function invalidManifest(file: string, message = `manifestの形式が不正です: ${file}`): SiteSnapError {
  return new SiteSnapError("MANIFEST_INVALID", message, "archiveを修復するか別の--outを指定してください。既存manifestは変更されません。", { output: file })
}

async function readManifestFile(file: string): Promise<ArchiveManifest | null> {
  let raw: string
  try {
    raw = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw invalidManifest(file, `manifestを読み込めません: ${file}`)
  }
  try {
    return validateManifest(JSON.parse(raw), file)
  } catch (error) {
    if (error instanceof SiteSnapError) throw error
    throw invalidManifest(file, `manifest JSONが壊れています: ${file}`)
  }
}

function archiveStatus(pages: ManifestPage[]): CollectionStatus {
  const captures = pages.flatMap((page) => Object.values(page.captures))
  const failed = captures.filter((capture) => capture?.status === "failed").length
  if (failed === 0) return "complete"
  if (failed === captures.length) return "failed"
  return "partial"
}

function toManifestCapture(result: CaptureResult, siteDir: string): ManifestCapture {
  const error = captureFailureMessage(result)
  const artifactPath = result.file ? path.relative(siteDir, result.file) : null
  if (!safeArtifactPath(artifactPath)) {
    throw invalidManifest(path.join(siteDir, "manifest.json"), `capture artifactがarchive外を参照しています: ${result.file}`)
  }
  return {
    status: error ? "failed" : "success",
    path: artifactPath,
    captured_at: result.capturedAt ?? new Date().toISOString(),
    http_status: result.httpStatus ?? null,
    duration_ms: result.durationMs ?? null,
    error,
    ...(result.device ? { device: result.device } : {}),
  }
}

export async function writeArchiveManifest(options: {
  domain: string
  siteDir: string
  source?: CaptureSource
  results: CaptureResult[]
}): Promise<ArchiveManifest> {
  const file = path.join(options.siteDir, "manifest.json")
  const previous = await readManifestFile(file)
  if (previous && previous.domain !== options.domain) {
    throw invalidManifest(file, `manifestのdomainがarchiveと一致しません: ${previous.domain}`)
  }
  const pages = new Map((previous?.pages ?? []).map((page) => [page.url, page]))
  for (const result of options.results) {
    const page = pages.get(result.url) ?? { url: result.url, slug: result.slug, title: "", captures: {} }
    page.slug = result.slug
    if (result.title) page.title = result.title
    page.captures[result.mode] = toManifestCapture(result, options.siteDir)
    pages.set(result.url, page)
  }
  const sources = [...(previous?.sources ?? [])]
  if (options.source && !sources.some((source) => source.kind === options.source!.kind && source.value === options.source!.value)) sources.push(options.source)
  const sortedPages = [...pages.values()].sort((a, b) => a.url.localeCompare(b.url))
  const updatedAt = options.results.map((result) => result.capturedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? new Date().toISOString()
  const manifest: ArchiveManifest = {
    schema_version: SCHEMA_VERSION,
    domain: options.domain,
    sources,
    updated_at: updatedAt,
    status: archiveStatus(sortedPages),
    pages: sortedPages,
  }
  await writeJsonAtomic(file, manifest)
  return manifest
}

export async function readArchiveManifest(siteDir: string): Promise<ArchiveManifest | null> {
  return readManifestFile(path.join(siteDir, "manifest.json"))
}

export async function buildArchiveIndex(outDir: string): Promise<ArchiveIndex> {
  await mkdir(outDir, { recursive: true })
  const archives: ArchiveIndexEntry[] = []
  for (const entry of await readdir(outDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifest = await readArchiveManifest(path.join(outDir, entry.name))
    if (!manifest) continue
    archives.push({ domain: manifest.domain, status: manifest.status, pages: manifest.pages.length, updated_at: manifest.updated_at, manifest: path.join(entry.name, "manifest.json") })
  }
  archives.sort((a, b) => a.domain.localeCompare(b.domain))
  const index: ArchiveIndex = { schema_version: SCHEMA_VERSION, updated_at: new Date().toISOString(), archives }
  await writeJsonAtomic(path.join(outDir, "index.json"), index)
  return index
}
