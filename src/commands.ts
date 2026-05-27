import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { captureUrls } from "./capture.ts"
import type { CliContext } from "./cli-args.ts"
import { analyzeRunDirectory, writeDoctorFiles, writeRunArtifacts } from "./doctor.ts"
import { buildIndex, buildSiteMeta, type SiteMeta } from "./meta.ts"
import { formatSuccess } from "./output.ts"
import { expandSitemap } from "./sitemap.ts"

export type CommandHandler = (ctx: CliContext) => Promise<void>

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
  humanFn?: (data: Record<string, unknown>) => void
): void {
  if (ctx.json) {
    console.log(formatSuccess(data, "json"))
  } else if (humanFn) {
    humanFn(data)
  }
}

async function cmdSite(ctx: CliContext): Promise<void> {
  const sitemapUrl = ctx.args[0]
  if (!sitemapUrl) {
    console.error("使い方: sitesnap site <sitemap-url>")
    process.exit(1)
  }
  console.error(`sitemapを展開中: ${sitemapUrl}`)
  let urls = await expandSitemap(sitemapUrl, { allowPrivate: ctx.captureOptions.allowPrivate })
  console.error(`${urls.length} 件のURLを検出`)
  if (ctx.exclude) {
    const before = urls.length
    urls = urls.filter((u) => !ctx.exclude!.test(u))
    console.error(`--exclude 適用後: ${urls.length} 件のURL (${before - urls.length} 件除外)`)
  }
  if (ctx.limit && urls.length > ctx.limit) {
    urls = urls.slice(0, ctx.limit)
    console.error(`--limit 適用後: ${urls.length} 件のURL`)
  }
  if (urls.length === 0) {
    out(ctx, { urls: 0 }, () => console.log("URLが見つかりませんでした。"))
    return
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
  out(
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
      console.log(
        `\n完了: ${r.captured_pages}/${r.pages} ページ → ${path.relative(process.cwd(), siteDir!)}/meta.json${errCount ? ` (${errCount} 件のエラー)` : ""}`
      )
    }
  )
  if (ctx.strict && errors.length > 0) process.exit(1)
}

async function cmdPage(ctx: CliContext): Promise<void> {
  const url = ctx.args[0]
  if (!url) {
    console.error("使い方: sitesnap page <url>")
    process.exit(1)
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
  out(
    ctx,
    {
      domain,
      url,
      desktop: !!page?.desktop,
      mobile: !!page?.mobile,
      errors: failed.map((r) => r.error),
      out_dir: ctx.outDir,
      run_dir: runDir,
    },
    (r) => {
      const desktop = r.desktop as boolean
      const mobile = r.mobile as boolean
      console.log(
        `\n完了: ${r.url} → ${path.relative(process.cwd(), siteDir!)}/${desktop && mobile ? "(デスクトップ+モバイル)" : desktop ? "(デスクトップのみ)" : mobile ? "(モバイルのみ)" : "(失敗)"}`
      )
    }
  )
  if (ctx.strict && failed.length > 0) process.exit(1)
}

async function cmdList(ctx: CliContext): Promise<void> {
  const sites = await buildIndex(ctx.outDir)
  if (ctx.json) {
    console.log(JSON.stringify({ success: true, sites }, null, 2))
  } else {
    if (sites.length === 0) {
      console.log(`まだキャプチャ済みサイトはありません (確認先: ${ctx.outDir})。`)
      return
    }
    console.log(`キャプチャ済みサイト一覧 (${ctx.outDir}):\n`)
    for (const s of sites) {
      const date = s.captured_at?.slice(0, 10) || "?"
      console.log(`  ${s.domain.padEnd(30)} ${s.captured_pages}/${s.pages} ページ   ${date}`)
    }
  }
}

async function cmdOpen(ctx: CliContext): Promise<void> {
  const domain = ctx.args[0]
  if (!domain) {
    console.error("使い方: sitesnap open <domain>")
    process.exit(1)
  }
  const dir = path.resolve(ctx.outDir, domain)
  if (!existsSync(dir)) {
    console.error(`${domain} のキャプチャがありません: ${dir}`)
    process.exit(1)
  }
  const opener =
    process.platform === "darwin"
      ? { cmd: "open", args: [dir] }
      : process.platform === "win32"
        ? { cmd: "explorer", args: [dir] }
        : { cmd: "xdg-open", args: [dir] }
  spawn(opener.cmd, opener.args, { stdio: "ignore", detached: true }).unref()
  out(ctx, { domain, opened: dir }, (r) => console.log(`開きました: ${r.opened}`))
}

async function cmdRetry(ctx: CliContext): Promise<void> {
  const domain = ctx.args[0]
  if (!domain) {
    console.error("使い方: sitesnap retry <domain>")
    process.exit(1)
  }
  const meta = await readMeta(ctx, domain)
  if (!meta) {
    console.error(`meta.json が見つかりません: ${path.join(ctx.outDir, domain)}`)
    process.exit(1)
  }
  const failedUrls = meta.pages
    .filter((p) => !p.desktop || !p.mobile || p.desktop_error || p.mobile_error)
    .map((p) => p.url)
  if (failedUrls.length === 0) {
    out(ctx, { domain, retried: 0 }, () => console.log("再取得対象のページはありません。"))
    return
  }
  console.error(`${failedUrls.length} 件のページを再取得中...`)
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
  out(
    ctx,
    { domain, retried: failedUrls.length, still_failing: stillFailing, run_dir: runDir },
    (r) =>
      console.log(
        `再取得完了: ${(r.retried as number) - (r.still_failing as number)}/${r.retried} 件が新たにキャプチャされました。`
      )
  )
  if (ctx.strict && stillFailing > 0) process.exit(1)
}

async function cmdDoctor(ctx: CliContext): Promise<void> {
  const runDir = ctx.args[0]
  if (!runDir) {
    console.error("使い方: sitesnap doctor <run-dir>")
    process.exit(1)
  }
  const resolvedRunDir = path.resolve(runDir)
  if (!existsSync(resolvedRunDir)) {
    console.error(`run-dir が見つかりません: ${resolvedRunDir}`)
    process.exit(1)
  }

  const report = await analyzeRunDirectory(resolvedRunDir)
  const written = ctx.agentTask ? await writeDoctorFiles(resolvedRunDir, report) : []
  out(
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
      console.log(`${report.failedCaptures}件の失敗キャプチャを検出しました。`)
      if (report.blankCaptures > 0) console.log(`${report.blankCaptures}件のスクリーンショットが白紙っぽいです。`)
      if (report.timeoutCaptures > 0) console.log(`${report.timeoutCaptures}件がtimeoutしています。`)
      if (report.httpErrorCaptures > 0) console.log(`${report.httpErrorCaptures}件がHTTPエラーです。`)
      if (report.suggestedRetry) {
        console.log("\nSuggested retry:")
        console.log(report.suggestedRetry)
      }
      if (written.length > 0) {
        console.log("\nGenerated:")
        for (const file of written) console.log(`- ${path.relative(process.cwd(), file)}`)
      }
    }
  )
}

export function buildCommands(): Record<string, CommandHandler> {
  return {
    site: cmdSite,
    page: cmdPage,
    list: cmdList,
    open: cmdOpen,
    retry: cmdRetry,
    doctor: cmdDoctor,
  }
}
