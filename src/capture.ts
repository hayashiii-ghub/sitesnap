/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { chromium, devices, type Browser } from "playwright"
import { mkdir, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { DEFAULTS } from "./config.ts"
import { assertPublicUrl } from "./url-guard.ts"
import { SiteSnapError } from "./errors.ts"

export type CaptureMode = "desktop" | "mobile"

export interface HostRateLimiter {
  wait(host: string): Promise<void>
}

export interface CaptureOptions {
  outDir?: string
  concurrency?: number
  forceVisible?: boolean
  waitMs?: number
  preScroll?: "full-page" | "none"
  allowPrivate?: boolean
  dryRun?: boolean
  force?: boolean
  rateLimiter?: HostRateLimiter
  onLog?: (message: string) => void
}

export interface CaptureResult {
  url: string
  mode: CaptureMode
  file?: string
  slug: string
  skipped?: boolean
  title?: string
  httpStatus?: number
  durationMs?: number
  error?: string
}

export interface CaptureSummary {
  domain: string
  siteDir: string | null
  results: CaptureResult[]
}

export interface CaptureTarget {
  domain: string
  siteDir: string | null
  otherHosts: string[]
}

export function slugify(url: string): string {
  const u = new URL(url)
  let p = u.pathname.replace(/^\/+|\/+$/g, "")
  if (!p) return "index"
  const cleaned = p
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120)
  return cleaned || "index"
}

export function domainOf(url: string): string {
  return new URL(url).hostname
}

export function formatCrossHostWarning(domain: string, otherHosts: string[]): string | null {
  if (otherHosts.length === 0) return null
  const preview = otherHosts.slice(0, 3).join(", ")
  const suffix = otherHosts.length > 3 ? ` (+${otherHosts.length - 3})` : ""
  return (
    `警告: URLが複数のホストにまたがっています。すべて ${domain}/ に保存します。` +
    `他のホスト: ${preview}${suffix}`
  )
}

export function resolveCaptureTarget(
  urls: string[],
  opts: Pick<CaptureOptions, "outDir" | "allowPrivate" | "dryRun"> = {}
): CaptureTarget {
  if (urls.length === 0) {
    throw new SiteSnapError(
      "INVALID_URL",
      "URLが指定されていません",
      "少なくとも1つの URL を指定してください。",
      {}
    )
  }

  const allowPrivate = opts.allowPrivate || false
  for (const url of urls) {
    assertPublicUrl(url, { allowPrivate })
  }

  const domain = domainOf(urls[0]!)
  const otherHosts = [...new Set(urls.map(domainOf).filter((h) => h !== domain))]
  const siteDir = opts.dryRun ? null : path.join(opts.outDir || DEFAULTS.sitesDir, domain)
  return { domain, siteDir, otherHosts }
}

// newContext は viewport を { viewport: {width, height} } とネストして受け取る。
// トップレベル spread だと width/height が捨てられ Playwright デフォルト寸法になる
export function contextOptionsFor(mode: CaptureMode) {
  const v = DEFAULTS.viewports[mode]
  if (typeof v === "string") return devices[v]
  const { width, height, deviceScaleFactor, isMobile, hasTouch } = v
  return { viewport: { width, height }, deviceScaleFactor, isMobile, hasTouch }
}

function createCaptureLogger(opts: CaptureOptions): (message: string) => void {
  return opts.onLog ?? ((message: string) => console.error(message))
}

async function prepareCaptureDirs(siteDir: string): Promise<void> {
  await mkdir(path.join(siteDir, "desktop"), { recursive: true })
  await mkdir(path.join(siteDir, "mobile"), { recursive: true })
}

// テスト専用シーム: bun test の preload が共有 browser をセットする。
// Bun では同一プロセス内で chromium.launch を繰り返すと CDP パイプが
// 無応答・切断になることがあるため、テストでは 1 プロセス 1 browser に抑える。
// 本番 (Node CLI) では未設定のまま = 常に新規 launch。
declare global {
  var __sitesnapSharedBrowser: Browser | undefined
}

export async function launchChromium(): Promise<Browser> {
  if (globalThis.__sitesnapSharedBrowser) return globalThis.__sitesnapSharedBrowser
  try {
    return await chromium.launch()
  } catch (err) {
    throw new SiteSnapError(
      "BROWSER_LAUNCH_FAILED",
      `Chromium の起動に失敗しました: ${(err as Error).message}`,
      "Playwright の Chromium を再インストールしてください: bunx playwright install chromium",
      {}
    )
  }
}

// launchChromium で得た browser を、共有 browser でない場合のみ close する
export async function closeChromium(browser: Browser): Promise<void> {
  if (browser === globalThis.__sitesnapSharedBrowser) return
  await browser.close()
}

export async function autoScroll(page: import("playwright").Page): Promise<void> {
  await page.evaluate(
    async ({ step, interval }) => {
      await new Promise<void>((resolve) => {
        let total = 0
        const timer = setInterval(() => {
          window.scrollBy(0, step)
          total += step
          if (total >= document.body.scrollHeight) {
            clearInterval(timer)
            window.scrollTo(0, 0)
            resolve()
          }
        }, interval)
      })
    },
    { step: DEFAULTS.scrollStep, interval: DEFAULTS.scrollInterval }
  )
  await page.waitForTimeout(DEFAULTS.postScrollWait)
}

export const FREEZE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation-duration: 0.001s !important;
    animation-delay: 0s !important;
    transition-duration: 0.001s !important;
    transition-delay: 0s !important;
  }
`

export const FORCE_VISIBLE_CSS = `
  [data-aos], [data-sr], .reveal, .scroll-reveal,
  .wow, .animated, [class*="fadeIn"], [class*="slideIn"],
  [class*="fade-in"], [class*="slide-in"] {
    opacity: 1 !important;
    transform: none !important;
    visibility: visible !important;
  }
`

async function captureOne(
  browser: Browser,
  url: string,
  mode: CaptureMode,
  siteDir: string,
  opts: CaptureOptions = {}
): Promise<CaptureResult> {
  const startedAt = Date.now()
  const slug = slugify(url)
  const file = path.join(siteDir, mode, `${slug}.png`)

  if (!opts.force && existsSync(file)) {
    const s = await stat(file)
    if (s.size > 1024) return { url, mode, file, slug, skipped: true }
  }

  const ctx = await browser.newContext({
    ...contextOptionsFor(mode),
    locale: DEFAULTS.locale,
    timezoneId: DEFAULTS.timezone,
    reducedMotion: "reduce",
  })
  const page = await ctx.newPage()
  let title = ""
  let httpStatus: number | undefined
  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: DEFAULTS.navigationTimeout })
    httpStatus = response?.status()
    title = await page.title()

    await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS })
    if (opts.forceVisible) {
      await page.addStyleTag({ content: FORCE_VISIBLE_CSS })
    }

    if (opts.waitMs && opts.waitMs > 0) {
      await page.waitForTimeout(opts.waitMs)
    }

    if (opts.preScroll !== "none") {
      await autoScroll(page)
    }

    await page.evaluate(() => (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {})
    await page
      .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 10000 })
      .catch(() => {})

    await page.screenshot({ path: file, fullPage: true })
  } finally {
    await ctx.close()
  }
  return { url, mode, file, slug, title, httpStatus, durationMs: Date.now() - startedAt }
}

async function runCaptureMode(
  browser: Browser,
  urls: string[],
  mode: CaptureMode,
  siteDir: string,
  opts: CaptureOptions,
  log: (message: string) => void
): Promise<CaptureResult[]> {
  const concurrency = opts.concurrency || DEFAULTS.concurrency
  const rateLimiter = opts.rateLimiter
  const results: CaptureResult[] = []

  let i = 0
  const worker = async () => {
    while (i < urls.length) {
      const my = i++
      const url = urls[my]!
      try {
        if (rateLimiter) await rateLimiter.wait(domainOf(url))
        const r = await captureOne(browser, url, mode, siteDir, opts)
        results.push(r)
        log(`[${mode}] ${my + 1}/${urls.length} ${r.skipped ? "skip" : "ok  "} ${url}`)
      } catch (e) {
        const message = (e as Error).message
        log(`[${mode}] ${my + 1}/${urls.length} ERR  ${url} :: ${message}`)
        results.push({ url, mode, error: message, slug: slugify(url) })
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

async function runCaptureWorkers(
  browser: Browser,
  urls: string[],
  siteDir: string,
  opts: CaptureOptions,
  log: (message: string) => void
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = []
  for (const mode of ["desktop", "mobile"] as const) {
    results.push(...(await runCaptureMode(browser, urls, mode, siteDir, opts, log)))
  }
  return results
}

export async function captureUrls(urls: string[], opts: CaptureOptions = {}): Promise<CaptureSummary> {
  const target = resolveCaptureTarget(urls, opts)
  const log = createCaptureLogger(opts)

  const warning = formatCrossHostWarning(target.domain, target.otherHosts)
  if (warning) log(warning)

  if (opts.dryRun) {
    return { domain: target.domain, siteDir: null, results: [] }
  }

  const siteDir = target.siteDir!
  await prepareCaptureDirs(siteDir)

  const browser = await launchChromium()
  let results: CaptureResult[] = []

  try {
    results = await runCaptureWorkers(browser, urls, siteDir, opts, log)
  } finally {
    await closeChromium(browser)
  }

  if (!opts.forceVisible && results.length > 0) {
    log(
      `\nヒント: スクリーンショットが真っ白だった場合は --force-visible を付けて再実行してください (AOS, wow.js 等のスクロール表示ライブラリ対策)。`
    )
  }

  return { domain: target.domain, siteDir, results }
}
