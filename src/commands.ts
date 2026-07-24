import { mkdir } from "node:fs/promises"
import path from "node:path"
import { authFetchHeaders, redactAuthOptions } from "./auth.ts"
import {
  archiveFileStem,
  archiveSiteDir,
  buildCaptureTasks,
  captureTasks,
  groupUrlsByHost,
  type CaptureOptions,
  type CaptureResult,
  type CaptureTask,
} from "./capture.ts"
import type { CliContext } from "./cli-args.ts"
import { SiteSnapError } from "./errors.ts"
import { loadCaptureUrls, parseCaptureSource, type CaptureSource, type RunSource } from "./input.ts"
import { runLogin } from "./login.ts"
import { buildArchiveIndex, readArchiveManifest, writeArchiveManifest } from "./manifest.ts"
import { captureFailureMessage, combineStatuses, SCHEMA_VERSION, statusFromResults, type CollectionStatus } from "./protocol.ts"
import { writeRunArtifact } from "./run-artifact.ts"

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type CommandHandler = (ctx: CliContext) => Promise<CommandResult>

interface ArchiveRunResult {
  domain: string
  status: CollectionStatus
  run_status: CollectionStatus
  requested: number
  succeeded: number
  failed: number
  manifest: string | null
  run_artifact: string | null
  error?: string
}

function json(data: Record<string, unknown>, exitCode = 0, stderr = ""): CommandResult {
  return { exitCode, stdout: JSON.stringify(data), stderr }
}

function missingArg(usage: string): never {
  throw new SiteSnapError("INVALID_OPTION", "引数が不足しています", `使い方: sitesnap ${usage}`)
}

function runOptions(ctx: CliContext): Record<string, unknown> {
  const safe = redactAuthOptions(ctx.captureOptions)
  return {
    out_dir: ctx.outDir,
    concurrency: safe.concurrency ?? null,
    force_visible: safe.forceVisible ?? false,
    wait_ms: safe.waitMs ?? 0,
    pre_scroll: safe.preScroll ?? "full-page",
    allow_private: safe.allowPrivate ?? false,
    storage_state: safe.storageState ?? null,
    headers: safe.headers ?? null,
    http_credentials: safe.httpCredentials ?? null,
  }
}

function originForAuthentication(urls: string[], options: CaptureOptions): string | undefined {
  const hasScopedAuthentication = Boolean(options.httpCredentials || (options.headers && Object.keys(options.headers).length > 0))
  if (!hasScopedAuthentication) return undefined
  const origins = [...new Set(urls.map((url) => new URL(url).origin))]
  if (origins.length !== 1) {
    throw new SiteSnapError(
      "INVALID_OPTION",
      "認証付きcaptureでは全URLを同じoriginにしてください",
      "originごとに入力を分けて実行してください。認証情報は別originへ転送されません。"
    )
  }
  return origins[0]
}

function failedResults(tasks: CaptureTask[], error: unknown): CaptureResult[] {
  const message = error instanceof Error ? error.message : String(error)
  const capturedAt = new Date().toISOString()
  return tasks.map((task) => ({
    url: task.url,
    mode: task.mode,
    ...(task.device ? { device: task.device } : {}),
    slug: archiveFileStem(task.url),
    capturedAt,
    error: message,
  }))
}

async function collectHost(options: {
  ctx: CliContext
  domain: string
  tasks: CaptureTask[]
  runSource: RunSource
  manifestSource?: CaptureSource
  authOrigin?: string
  logs: string[]
}): Promise<ArchiveRunResult> {
  const { ctx, domain, tasks, runSource, manifestSource, authOrigin, logs } = options
  let siteDir: string
  try {
    siteDir = archiveSiteDir(ctx.outDir, domain)
  } catch (error) {
    return {
      domain,
      status: "failed",
      run_status: "failed",
      requested: tasks.length,
      succeeded: 0,
      failed: tasks.length,
      manifest: null,
      run_artifact: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  let results: CaptureResult[]
  try {
    const captured = await captureTasks(domain, tasks, {
      ...ctx.captureOptions,
      outDir: ctx.outDir,
      rateLimiter: ctx.rateLimiter,
      authOrigin,
      onLog: (message) => logs.push(message),
    })
    siteDir = captured.siteDir
    results = captured.results
  } catch (error) {
    logs.push(`[${domain}] ${error instanceof Error ? error.message : String(error)}`)
    results = failedResults(tasks, error)
  }

  const runStatus = statusFromResults(results)
  const failed = results.filter((result) => captureFailureMessage(result)).length
  try {
    await mkdir(siteDir, { recursive: true })
    const manifest = await writeArchiveManifest({ domain, siteDir, source: manifestSource, results })
    const runArtifact = await writeRunArtifact({
      domain,
      siteDir,
      source: runSource,
      archiveStatus: manifest.status,
      results,
      runOptions: runOptions(ctx),
    })
    return {
      domain,
      status: manifest.status,
      run_status: runStatus,
      requested: results.length,
      succeeded: results.length - failed,
      failed,
      manifest: path.join(siteDir, "manifest.json"),
      run_artifact: runArtifact,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logs.push(`[${domain}] archive metadata error: ${message}`)
    return {
      domain,
      status: "failed",
      run_status: runStatus,
      requested: results.length,
      succeeded: results.length - failed,
      failed,
      manifest: null,
      run_artifact: null,
      error: message,
    }
  }
}

function applyFilters(ctx: CliContext, urls: string[]): string[] {
  let filtered = urls
  if (ctx.exclude) {
    filtered = filtered.filter((url) => {
      ctx.exclude!.lastIndex = 0
      return !ctx.exclude!.test(url)
    })
  }
  if (ctx.limit !== null) filtered = filtered.slice(0, ctx.limit)
  return filtered
}

async function refreshIndex(outDir: string, logs: string[]): Promise<string | null> {
  try {
    await buildArchiveIndex(outDir)
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logs.push(`[index] ${message}`)
    return message
  }
}

async function cmdCapture(ctx: CliContext): Promise<CommandResult> {
  const source = parseCaptureSource(ctx.args, ctx.sitemap, ctx.input)
  const logs: string[] = []
  const fetchHeaders = authFetchHeaders(ctx.captureOptions, {})
  const urls = applyFilters(ctx, await loadCaptureUrls(source, {
    allowPrivate: ctx.captureOptions.allowPrivate,
    headers: Object.keys(fetchHeaders).length ? fetchHeaders : undefined,
    lookup: ctx.captureOptions.lookup,
  }))
  const authOrigin = originForAuthentication(urls, ctx.captureOptions)
  const archives: ArchiveRunResult[] = []
  for (const [domain, hostUrls] of groupUrlsByHost(urls)) {
    archives.push(await collectHost({
      ctx,
      domain,
      tasks: buildCaptureTasks(hostUrls),
      runSource: source,
      manifestSource: source,
      authOrigin,
      logs,
    }))
  }
  const indexError = await refreshIndex(ctx.outDir, logs)
  const status = combineStatuses([...archives.map((archive) => archive.status), ...(indexError ? ["failed" as const] : [])])
  const requested = archives.reduce((sum, archive) => sum + archive.requested, 0)
  const failed = archives.reduce((sum, archive) => sum + archive.failed, 0)
  return json({
    success: status === "complete",
    schema_version: SCHEMA_VERSION,
    command: "capture",
    status,
    source,
    summary: { urls: urls.length, captures_requested: requested, captures_succeeded: requested - failed, captures_failed: failed },
    archives,
    out_dir: ctx.outDir,
    ...(indexError ? { index_error: indexError } : {}),
  }, status === "complete" ? 0 : 1, logs.join("\n"))
}

async function cmdRetry(ctx: CliContext): Promise<CommandResult> {
  const domain = ctx.args[0] ?? missingArg("retry <domain>")
  const siteDir = archiveSiteDir(ctx.outDir, domain)
  const existing = await readArchiveManifest(siteDir)
  if (!existing) {
    throw new SiteSnapError("MANIFEST_NOT_FOUND", `manifestが見つかりません: ${domain}`, "sitesnap listでarchiveを確認してください。", { domain })
  }
  if (existing.domain !== domain) {
    throw new SiteSnapError("MANIFEST_INVALID", `manifestのdomainがarchiveと一致しません: ${existing.domain}`, "archiveのmanifestを修復してください。", { domain })
  }
  const tasks: CaptureTask[] = existing.pages.flatMap((page) =>
    Object.entries(page.captures)
      .filter(([, capture]) => capture?.status === "failed")
      .map(([mode, capture]) => ({
        url: page.url,
        mode: mode as CaptureTask["mode"],
        ...(capture?.device ? { device: capture.device } : {}),
      }))
  )
  if (tasks.length === 0) {
    return json({
      success: true,
      schema_version: SCHEMA_VERSION,
      command: "retry",
      status: existing.status,
      summary: { captures_requested: 0, captures_succeeded: 0, captures_failed: 0 },
      archives: [{ domain, status: existing.status, run_status: "complete", requested: 0, succeeded: 0, failed: 0, manifest: path.join(siteDir, "manifest.json"), run_artifact: null }],
      out_dir: ctx.outDir,
    })
  }
  const authOrigin = originForAuthentication(tasks.map((task) => task.url), ctx.captureOptions)
  const logs: string[] = []
  const archive = await collectHost({ ctx, domain, tasks, runSource: { kind: "retry", value: domain }, authOrigin, logs })
  const indexError = await refreshIndex(ctx.outDir, logs)
  const status = combineStatuses([archive.status, ...(indexError ? ["failed" as const] : [])])
  return json({
    success: status === "complete",
    schema_version: SCHEMA_VERSION,
    command: "retry",
    status,
    summary: { captures_requested: archive.requested, captures_succeeded: archive.succeeded, captures_failed: archive.failed },
    archives: [archive],
    out_dir: ctx.outDir,
    ...(indexError ? { index_error: indexError } : {}),
  }, status === "complete" ? 0 : 1, logs.join("\n"))
}

async function cmdList(ctx: CliContext): Promise<CommandResult> {
  const index = await buildArchiveIndex(ctx.outDir)
  return json({ success: true, command: "list", ...index, out_dir: ctx.outDir })
}

async function cmdLogin(ctx: CliContext): Promise<CommandResult> {
  const url = ctx.args[0] ?? missingArg("login <url>")
  const result = await runLogin(url, {
    outFile: ctx.outFile,
    allowPrivate: ctx.captureOptions.allowPrivate,
  })
  return json({
    success: true,
    schema_version: SCHEMA_VERSION,
    command: "login",
    ...result,
    hint: `--storage-state ${result.file} をcapture/retryへ渡してください。このファイルはsecretとして扱ってください。`,
  })
}

export function buildCommands(): Record<string, CommandHandler> {
  return { capture: cmdCapture, retry: cmdRetry, list: cmdList, login: cmdLogin }
}
