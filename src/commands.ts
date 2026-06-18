import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { captureUrls } from "./capture.ts"
import { checkUrl } from "./check.ts"
import type { CliContext } from "./cli-args.ts"
import { analyzeRunDirectory, writeDoctorFiles, writeRunArtifacts } from "./doctor.ts"
import { buildIndex, buildSiteMeta, type SiteMeta } from "./meta.ts"
import { inspectUrl } from "./inspect.ts"
import { formatSuccess } from "./output.ts"
import { captureShot } from "./shot.ts"
import { expandSitemap } from "./sitemap.ts"

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type CommandHandler = (ctx: CliContext) => Promise<CommandResult>

function artifactOptions(ctx: CliContext): Record<string, unknown> {
  return { ...ctx.captureOptions }
}

async function readMeta(ctx: CliContext, domain: string): Promise<SiteMeta | null> {
  const p = path.join(ctx.outDir, domain, "meta.json")
  if (!existsSync(p)) return null
  return JSON.parse(await readFile(p, "utf8"))
}

function out(
  ctx: CliContext,
  data: Record<string, unknown>,
  humanFn?: (data: Record<string, unknown>) => string
): CommandResult {
  if (ctx.json) {
    return ok(formatSuccess(data, "json"))
  }
  return ok(humanFn ? humanFn(data) : "")
}

function ok(stdout = "", stderr = ""): CommandResult {
  return { exitCode: 0, stdout, stderr }
}

function fail(stderr: string): CommandResult {
  return { exitCode: 1, stdout: "", stderr }
}

function withExitCode(result: CommandResult, exitCode: number): CommandResult {
  return { ...result, exitCode }
}

async function cmdSite(ctx: CliContext): Promise<CommandResult> {
  const sitemapUrl = ctx.args[0]
  if (!sitemapUrl) {
    return fail("使い方: sitesnap site <sitemap-url>")
  }
  const logs = [`sitemapを展開中: ${sitemapUrl}`]
  let urls = await expandSitemap(sitemapUrl, { allowPrivate: ctx.captureOptions.allowPrivate })
  logs.push(`${urls.length} 件のURLを検出`)
  if (ctx.exclude) {
    const before = urls.length
    urls = urls.filter((u) => !ctx.exclude!.test(u))
    logs.push(`--exclude 適用後: ${urls.length} 件のURL (${before - urls.length} 件除外)`)
  }
  if (ctx.limit && urls.length > ctx.limit) {
    urls = urls.slice(0, ctx.limit)
    logs.push(`--limit 適用後: ${urls.length} 件のURL`)
  }
  if (urls.length === 0) {
    const result = out(ctx, { urls: 0 }, () => "URLが見つかりませんでした。")
    return { ...result, stderr: logs.join("\n") }
  }
  const rateLimiter = ctx.minInterval
    ? (await import("./rate-limit.ts")).createHostRateLimiter(ctx.minInterval)
    : undefined
  const { domain, siteDir, results } = await captureUrls(urls, {
    ...ctx.captureOptions,
    rateLimiter,
  })
  const runDir = await writeRunArtifacts({
    domain,
    siteDir: siteDir!,
    source: sitemapUrl,
    command: `sitesnap site ${sitemapUrl}`,
    results,
    options: artifactOptions(ctx),
  })
  const meta = await buildSiteMeta({ domain, siteDir: siteDir!, urls, source: sitemapUrl, results })
  await buildIndex(ctx.outDir)
  const captured = meta.pages.filter((p) => p.desktop || p.mobile).length
  const errors = results
    .filter((r) => r.error)
    .map((r) => ({ url: r.url, mode: r.mode, error: r.error! }))
  const result = out(
    ctx,
    {
      domain,
      source: sitemapUrl,
      pages: meta.pages.length,
      captured_pages: captured,
      errors,
      out_dir: ctx.outDir,
      run_dir: runDir,
    },
    (r) => {
      const errCount = (r.errors as unknown[]).length
      return `\n完了: ${r.captured_pages}/${r.pages} ページ → ${path.relative(process.cwd(), siteDir!)}/meta.json${errCount ? ` (${errCount} 件のエラー)` : ""}`
    }
  )
  return withExitCode({ ...result, stderr: logs.join("\n") }, ctx.strict && errors.length > 0 ? 1 : 0)
}

async function cmdPage(ctx: CliContext): Promise<CommandResult> {
  const url = ctx.args[0]
  if (!url) {
    return fail("使い方: sitesnap page <url>")
  }
  const { domain, siteDir, results } = await captureUrls([url], {
    ...ctx.captureOptions,
  })
  const runDir = await writeRunArtifacts({
    domain,
    siteDir: siteDir!,
    source: null,
    command: `sitesnap page ${url}`,
    results,
    options: artifactOptions(ctx),
  })
  const existing = (await readMeta(ctx, domain))?.pages.map((p) => p.url) || []
  const allUrls = [...new Set([...existing, url])]
  const meta = await buildSiteMeta({ domain, siteDir: siteDir!, urls: allUrls, source: null, results })
  await buildIndex(ctx.outDir)
  const page = meta.pages.find((p) => p.url === url)
  const failed = results.filter((r) => r.error)
  const result = out(
    ctx,
    {
      domain,
      url,
      desktop: !!page?.desktop,
      mobile: !!page?.mobile,
      desktop_path: page?.desktop ? path.join(siteDir!, page.desktop) : null,
      mobile_path: page?.mobile ? path.join(siteDir!, page.mobile) : null,
      errors: failed.map((r) => r.error),
      out_dir: ctx.outDir,
      run_dir: runDir,
    },
    (r) => {
      const desktop = r.desktop as boolean
      const mobile = r.mobile as boolean
      return `\n完了: ${r.url} → ${path.relative(process.cwd(), siteDir!)}/${desktop && mobile ? "(デスクトップ+モバイル)" : desktop ? "(デスクトップのみ)" : mobile ? "(モバイルのみ)" : "(失敗)"}`
    }
  )
  return withExitCode(result, ctx.strict && failed.length > 0 ? 1 : 0)
}

async function cmdShot(ctx: CliContext): Promise<CommandResult> {
  const url = ctx.args[0]
  if (!url) {
    return fail("使い方: sitesnap shot <url>")
  }
  const shot = await captureShot(url, {
    ...ctx.shotOptions,
    outDir: ctx.outDir,
    allowPrivate: ctx.captureOptions.allowPrivate,
    allowFile: ctx.captureOptions.allowFile,
    forceVisible: ctx.captureOptions.forceVisible,
  })
  return out(
    ctx,
    { ...shot },
    (r) => `撮影完了: ${r.file} (${(r.viewport as { width: number }).width}x${(r.viewport as { height: number }).height}${r.full ? ", full" : ""}${r.selector ? `, selector: ${r.selector}` : ""})`
  )
}

async function cmdInspect(ctx: CliContext): Promise<CommandResult> {
  const url = ctx.args[0]
  if (!url) {
    return fail("使い方: sitesnap inspect <url> --selector <css>")
  }
  const report = await inspectUrl(url, {
    vp: ctx.shotOptions.vp,
    device: ctx.shotOptions.device,
    settleMs: ctx.shotOptions.settleMs,
    selector: ctx.shotOptions.selector,
    props: ctx.shotOptions.props ?? undefined,
    limit: ctx.limit,
    allowPrivate: ctx.captureOptions.allowPrivate,
  })
  return out(
    ctx,
    { ...report },
    (r) => {
      const count = r.count as number
      if (count === 0) return `一致する要素はありません: ${r.selector}`
      const lines = [`${count} 件マッチ: ${r.selector}`]
      for (const el of (r.elements as { box: { x: number; y: number; width: number; height: number } }[])) {
        lines.push(`  ${el.box.width}x${el.box.height} @ (${el.box.x}, ${el.box.y})`)
      }
      return lines.join("\n")
    }
  )
}

async function cmdCheck(ctx: CliContext): Promise<CommandResult> {
  const url = ctx.args[0]
  if (!url) {
    return fail("使い方: sitesnap check <url>")
  }
  const report = await checkUrl(url, {
    vp: ctx.shotOptions.vp,
    device: ctx.shotOptions.device,
    settleMs: ctx.shotOptions.settleMs,
    allowPrivate: ctx.captureOptions.allowPrivate,
  })
  const result = out(
    ctx,
    { ...report },
    (r) => {
      const checks = r.checks as typeof report.checks
      const mark = (pass: boolean) => (pass ? "ok " : "NG ")
      const lines = [
        `${report.pass ? "PASS" : "FAIL"}: ${r.url}`,
        `  ${mark(checks.overflow.pass)}横はみ出し${checks.overflow.pass ? "" : ` (${checks.overflow.amount}px, ${checks.overflow.offenders.length} 要素)`}`,
        `  ${mark(checks.console_errors.pass)}consoleエラー${checks.console_errors.pass ? "" : ` (${checks.console_errors.messages.length} 件)`}`,
        `  ${mark(checks.failed_requests.pass)}失敗リクエスト${checks.failed_requests.pass ? "" : ` (${checks.failed_requests.requests.length} 件)`}`,
        `  ${mark(checks.a11y.pass)}アクセシビリティ${checks.a11y.pass ? "" : ` (${checks.a11y.violations.length} violations)`}`,
      ]
      return lines.join("\n")
    }
  )
  return withExitCode(result, ctx.strict && !report.pass ? 1 : 0)
}

async function cmdList(ctx: CliContext): Promise<CommandResult> {
  const sites = await buildIndex(ctx.outDir)
  if (ctx.json) {
    return ok(JSON.stringify({ success: true, sites }, null, 2))
  }
  if (sites.length === 0) {
    return ok(`まだキャプチャ済みサイトはありません (確認先: ${ctx.outDir})。`)
  }
  const lines = [`キャプチャ済みサイト一覧 (${ctx.outDir}):`, ""]
  for (const s of sites) {
    const date = s.captured_at?.slice(0, 10) || "?"
    lines.push(`  ${s.domain.padEnd(30)} ${s.captured_pages}/${s.pages} ページ   ${date}`)
  }
  return ok(lines.join("\n"))
}

async function cmdOpen(ctx: CliContext): Promise<CommandResult> {
  const domain = ctx.args[0]
  if (!domain) {
    return fail("使い方: sitesnap open <domain>")
  }
  const dir = path.resolve(ctx.outDir, domain)
  if (!existsSync(dir)) {
    return fail(`${domain} のキャプチャがありません: ${dir}`)
  }
  const opener =
    process.platform === "darwin"
      ? { cmd: "open", args: [dir] }
      : process.platform === "win32"
        ? { cmd: "explorer", args: [dir] }
        : { cmd: "xdg-open", args: [dir] }
  spawn(opener.cmd, opener.args, { stdio: "ignore", detached: true }).unref()
  return out(ctx, { domain, opened: dir }, (r) => `開きました: ${r.opened}`)
}

async function cmdRetry(ctx: CliContext): Promise<CommandResult> {
  const domain = ctx.args[0]
  if (!domain) {
    return fail("使い方: sitesnap retry <domain>")
  }
  const meta = await readMeta(ctx, domain)
  if (!meta) {
    return fail(`meta.json が見つかりません: ${path.join(ctx.outDir, domain)}`)
  }
  const failedUrls = meta.pages
    .filter((p) => !p.desktop || !p.mobile || p.desktop_error || p.mobile_error)
    .map((p) => p.url)
  if (failedUrls.length === 0) {
    return out(ctx, { domain, retried: 0 }, () => "再取得対象のページはありません。")
  }
  const logs = [`${failedUrls.length} 件のページを再取得中...`]
  const { siteDir, results } = await captureUrls(failedUrls, {
    force: true,
    ...ctx.captureOptions,
  })
  const runDir = await writeRunArtifacts({
    domain,
    siteDir: siteDir!,
    source: meta.source,
    command: `sitesnap retry ${domain}`,
    results,
    options: { ...artifactOptions(ctx), force: true },
  })
  const allUrls = meta.pages.map((p) => p.url)
  const newMeta = await buildSiteMeta({
    domain,
    siteDir: siteDir!,
    urls: allUrls,
    source: meta.source,
    results,
  })
  await buildIndex(ctx.outDir)
  const stillFailing = newMeta.pages.filter(
    (p) => failedUrls.includes(p.url) && (!p.desktop || !p.mobile)
  ).length
  const result = out(
    ctx,
    { domain, retried: failedUrls.length, still_failing: stillFailing, run_dir: runDir },
    (r) =>
      `再取得完了: ${(r.retried as number) - (r.still_failing as number)}/${r.retried} 件が新たにキャプチャされました。`
  )
  return withExitCode({ ...result, stderr: logs.join("\n") }, ctx.strict && stillFailing > 0 ? 1 : 0)
}

async function cmdDoctor(ctx: CliContext): Promise<CommandResult> {
  const runDir = ctx.args[0]
  if (!runDir) {
    return fail("使い方: sitesnap doctor <run-dir>")
  }
  const resolvedRunDir = path.resolve(runDir)
  if (!existsSync(resolvedRunDir)) {
    return fail(`run-dir が見つかりません: ${resolvedRunDir}`)
  }

  const report = await analyzeRunDirectory(resolvedRunDir)
  const written = ctx.agentTask ? await writeDoctorFiles(resolvedRunDir, report) : []
  return out(
    ctx,
    {
      domain: report.domain,
      total_captures: report.totalCaptures,
      failed_captures: report.failedCaptures,
      blank_captures: report.blankCaptures,
      timeout_captures: report.timeoutCaptures,
      http_error_captures: report.httpErrorCaptures,
      suggested_retry: report.suggestedRetry,
      generated_files: written,
    },
    () => {
      const lines = [`${report.failedCaptures}件の失敗キャプチャを検出しました。`]
      if (report.blankCaptures > 0) lines.push(`${report.blankCaptures}件のスクリーンショットが白紙っぽいです。`)
      if (report.timeoutCaptures > 0) lines.push(`${report.timeoutCaptures}件がtimeoutしています。`)
      if (report.httpErrorCaptures > 0) lines.push(`${report.httpErrorCaptures}件がHTTPエラーです。`)
      if (report.suggestedRetry) {
        lines.push("", "Suggested retry:", report.suggestedRetry)
      }
      if (written.length > 0) {
        lines.push("", "Generated:")
        for (const file of written) lines.push(`- ${path.relative(process.cwd(), file)}`)
      }
      return lines.join("\n")
    }
  )
}

export function buildCommands(): Record<string, CommandHandler> {
  return {
    site: cmdSite,
    page: cmdPage,
    shot: cmdShot,
    inspect: cmdInspect,
    check: cmdCheck,
    list: cmdList,
    open: cmdOpen,
    retry: cmdRetry,
    doctor: cmdDoctor,
  }
}
