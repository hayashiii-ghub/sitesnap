import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { expandSitemap } from "./sitemap.ts"
import { captureUrls } from "./capture.ts"
import { buildSiteMeta, buildIndex, type SiteMeta } from "./meta.ts"
import { DEFAULTS, VERSION } from "./config.ts"
import { formatSuccess, formatError, type OutputFormat } from "./output.ts"

const HELP = `
sitesnap — ウェブサイトのスクリーンショットを一括キャプチャするCLI

使い方:
  sitesnap site <sitemap-url>     sitemapから全ページをキャプチャ
  sitesnap page <url>              1ページだけキャプチャ
  sitesnap list                    キャプチャ済みサイト一覧
  sitesnap open <domain>           Finderでサイトのフォルダを開く
  sitesnap retry <domain>          失敗したページのみ再取得
  sitesnap help                    このヘルプを表示
  sitesnap --version               バージョン番号を表示

グローバルフラグ:
  --json                                JSON形式でstdout出力（進捗はstderr）
  --force-visible                       スクロール連動アニメで隠れた要素を強制表示
                                        (AOS, wow.js 等対策。スクショが真っ白な時に使用)
  --out <dir>                           出力先ディレクトリ（デフォルト: ./sites/）
                                        SITESNAP_OUT 環境変数でも指定可
  --limit <N>                           最初の N 件のURLのみキャプチャ（--exclude適用後）
  --exclude <regex>                     この正規表現にマッチするURLをスキップ
  --concurrency <N>                     並列ワーカー数を上書き（デフォルト 3）
  --min-interval <ms>                   同一ホストへの最小間隔(ms、デフォルト 0 で無効)
  --strict                              1ページでも失敗したら非ゼロ終了（CI向け）
  --allow-private                       localhost/プライベートIPへのアクセスを許可

使用例:
  sitesnap site https://example.com/sitemap.xml --limit 10
  sitesnap site https://example.com/sitemap.xml --exclude '\\?utm_'
  sitesnap site https://example.com/sitemap.xml --concurrency 5 --min-interval 250
  sitesnap site https://example.com/sitemap.xml --strict
  sitesnap site http://localhost:8080/sitemap.xml --allow-private
`

const argv = process.argv.slice(2)
const sub = argv[0]

if (argv.includes("--version") || argv.includes("-v")) {
  console.log(VERSION)
  process.exit(0)
}

const json = argv.includes("--json")
const fmt: OutputFormat = json ? "json" : "text"
const forceVisible = argv.includes("--force-visible")
const strict = argv.includes("--strict")
const allowPrivate = argv.includes("--allow-private")

let outDir = process.env.SITESNAP_OUT || DEFAULTS.sitesDir
let limit: number | null = null
let exclude: RegExp | null = null
let concurrency: number | null = null
let minInterval: number | null = null

const flagSet = new Set(["--json", "--force-visible", "--strict", "--allow-private"])
const valueFlags = new Set(["--out", "--limit", "--exclude", "--concurrency", "--min-interval"])
const args: string[] = []
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]!
  if (flagSet.has(a)) continue
  if (valueFlags.has(a)) {
    const v = argv[++i]
    if (v === undefined) {
      console.error(`${a} に値が指定されていません`)
      process.exit(1)
    }
    if (a === "--out") outDir = v
    else if (a === "--limit") limit = Number(v)
    else if (a === "--exclude") {
      try {
        exclude = new RegExp(v)
      } catch (e) {
        console.error(`--exclude の正規表現が不正です: ${(e as Error).message}`)
        process.exit(1)
      }
    } else if (a === "--concurrency") concurrency = Number(v)
    else if (a === "--min-interval") minInterval = Number(v)
    continue
  }
  args.push(a)
}
outDir = path.resolve(outDir)

async function readMeta(domain: string): Promise<SiteMeta | null> {
  const p = path.join(outDir, domain, "meta.json")
  if (!existsSync(p)) return null
  return JSON.parse(await readFile(p, "utf8"))
}

function out(data: Record<string, unknown>, humanFn?: (data: Record<string, unknown>) => void): void {
  if (json) {
    console.log(formatSuccess(data, "json"))
  } else if (humanFn) {
    humanFn(data)
  }
}

async function cmdSite(): Promise<void> {
  const sitemapUrl = args[0]
  if (!sitemapUrl) {
    console.error("使い方: sitesnap site <sitemap-url>")
    process.exit(1)
  }
  console.error(`sitemapを展開中: ${sitemapUrl}`)
  let urls = await expandSitemap(sitemapUrl, { allowPrivate })
  console.error(`${urls.length} 件のURLを検出`)
  if (exclude) {
    const before = urls.length
    urls = urls.filter((u) => !exclude!.test(u))
    console.error(`--exclude 適用後: ${urls.length} 件のURL (${before - urls.length} 件除外)`)
  }
  if (limit && urls.length > limit) {
    urls = urls.slice(0, limit)
    console.error(`--limit 適用後: ${urls.length} 件のURL`)
  }
  if (urls.length === 0) {
    out({ urls: 0 }, () => console.log("URLが見つかりませんでした。"))
    return
  }
  const rateLimiter = minInterval
    ? (await import("./rate-limit.ts")).createHostRateLimiter(minInterval)
    : undefined
  const { domain, siteDir, results } = await captureUrls(urls, {
    forceVisible,
    outDir,
    allowPrivate,
    concurrency: concurrency ?? undefined,
    rateLimiter,
  })
  const meta = await buildSiteMeta({ domain, siteDir: siteDir!, urls, source: sitemapUrl, results })
  await buildIndex(outDir)
  const captured = meta.pages.filter((p) => p.desktop || p.mobile).length
  const errors = results
    .filter((r) => r.error)
    .map((r) => ({ url: r.url, mode: r.mode, error: r.error! }))
  out(
    {
      domain,
      source: sitemapUrl,
      pages: meta.pages.length,
      captured_pages: captured,
      errors,
      out_dir: outDir,
    },
    (r) => {
      const errCount = (r.errors as unknown[]).length
      console.log(
        `\n完了: ${r.captured_pages}/${r.pages} ページ → ${path.relative(process.cwd(), siteDir!)}/meta.json${errCount ? ` (${errCount} 件のエラー)` : ""}`
      )
    }
  )
  if (strict && errors.length > 0) process.exit(1)
}

async function cmdPage(): Promise<void> {
  const url = args[0]
  if (!url) {
    console.error("使い方: sitesnap page <url>")
    process.exit(1)
  }
  const { domain, siteDir, results } = await captureUrls([url], {
    forceVisible,
    outDir,
    allowPrivate,
    concurrency: concurrency ?? undefined,
  })
  const existing = (await readMeta(domain))?.pages.map((p) => p.url) || []
  const allUrls = [...new Set([...existing, url])]
  const meta = await buildSiteMeta({ domain, siteDir: siteDir!, urls: allUrls, source: null, results })
  await buildIndex(outDir)
  const page = meta.pages.find((p) => p.url === url)
  const failed = results.filter((r) => r.error)
  out(
    {
      domain,
      url,
      desktop: !!page?.desktop,
      mobile: !!page?.mobile,
      errors: failed.map((r) => r.error),
      out_dir: outDir,
    },
    (r) => {
      const desktop = r.desktop as boolean
      const mobile = r.mobile as boolean
      console.log(
        `\n完了: ${r.url} → ${path.relative(process.cwd(), siteDir!)}/${desktop && mobile ? "(デスクトップ+モバイル)" : desktop ? "(デスクトップのみ)" : mobile ? "(モバイルのみ)" : "(失敗)"}`
      )
    }
  )
  if (strict && failed.length > 0) process.exit(1)
}

async function cmdList(): Promise<void> {
  const sites = await buildIndex(outDir)
  if (json) {
    console.log(JSON.stringify({ success: true, sites }, null, 2))
  } else {
    if (sites.length === 0) {
      console.log(`まだキャプチャ済みサイトはありません (確認先: ${outDir})。`)
      return
    }
    console.log(`キャプチャ済みサイト一覧 (${outDir}):\n`)
    for (const s of sites) {
      const date = s.captured_at?.slice(0, 10) || "?"
      console.log(`  ${s.domain.padEnd(30)} ${s.captured_pages}/${s.pages} ページ   ${date}`)
    }
  }
}

async function cmdOpen(): Promise<void> {
  const domain = args[0]
  if (!domain) {
    console.error("使い方: sitesnap open <domain>")
    process.exit(1)
  }
  const dir = path.resolve(outDir, domain)
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
  out({ domain, opened: dir }, (r) => console.log(`開きました: ${r.opened}`))
}

async function cmdRetry(): Promise<void> {
  const domain = args[0]
  if (!domain) {
    console.error("使い方: sitesnap retry <domain>")
    process.exit(1)
  }
  const meta = await readMeta(domain)
  if (!meta) {
    console.error(`meta.json が見つかりません: ${path.join(outDir, domain)}`)
    process.exit(1)
  }
  const failedUrls = meta.pages
    .filter((p) => !p.desktop || !p.mobile || p.desktop_error || p.mobile_error)
    .map((p) => p.url)
  if (failedUrls.length === 0) {
    out({ domain, retried: 0 }, () => console.log("再取得対象のページはありません。"))
    return
  }
  console.error(`${failedUrls.length} 件のページを再取得中...`)
  const { siteDir, results } = await captureUrls(failedUrls, {
    force: true,
    forceVisible,
    outDir,
    allowPrivate,
    concurrency: concurrency ?? undefined,
  })
  const allUrls = meta.pages.map((p) => p.url)
  const newMeta = await buildSiteMeta({
    domain,
    siteDir: siteDir!,
    urls: allUrls,
    source: meta.source,
    results,
  })
  await buildIndex(outDir)
  const stillFailing = newMeta.pages.filter(
    (p) => failedUrls.includes(p.url) && (!p.desktop || !p.mobile)
  ).length
  out(
    { domain, retried: failedUrls.length, still_failing: stillFailing },
    (r) =>
      console.log(
        `再取得完了: ${(r.retried as number) - (r.still_failing as number)}/${r.retried} 件が新たにキャプチャされました。`
      )
  )
  if (strict && stillFailing > 0) process.exit(1)
}

const commands: Record<string, () => Promise<void>> = {
  site: cmdSite,
  page: cmdPage,
  list: cmdList,
  open: cmdOpen,
  retry: cmdRetry,
}

if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
  console.log(HELP)
  process.exit(0)
}

const fn = commands[sub]
if (!fn) {
  console.error(`不明なコマンド: ${sub}`)
  console.error(HELP)
  process.exit(1)
}

try {
  await fn()
} catch (e) {
  // SiteSnapError 含む全エラーを構造化出力
  if (json) {
    console.log(formatError(e, "json"))
  } else {
    console.error(formatError(e, "text"))
  }
  process.exit(1)
}
