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
  allowPrivate?: boolean
  dryRun?: boolean
  force?: boolean
  rateLimiter?: HostRateLimiter
}

export interface CaptureResult {
  url: string
  mode: CaptureMode
  file?: string
  slug: string
  skipped?: boolean
  title?: string
  error?: string
}

export interface CaptureSummary {
  domain: string
  siteDir: string | null
  results: CaptureResult[]
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

function viewportFor(mode: CaptureMode) {
  const v = DEFAULTS.viewports[mode]
  if (typeof v === "string") return devices[v]
  return v
}

async function autoScroll(page: import("playwright").Page): Promise<void> {
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

const FREEZE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    animation-duration: 0.001s !important;
    animation-delay: 0s !important;
    transition-duration: 0.001s !important;
    transition-delay: 0s !important;
  }
`

const FORCE_VISIBLE_CSS = `
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
  const slug = slugify(url)
  const file = path.join(siteDir, mode, `${slug}.png`)

  if (!opts.force && existsSync(file)) {
    const s = await stat(file)
    if (s.size > 1024) return { url, mode, file, slug, skipped: true }
  }

  const ctx = await browser.newContext({
    ...viewportFor(mode),
    locale: DEFAULTS.locale,
    timezoneId: DEFAULTS.timezone,
    reducedMotion: "reduce",
  })
  const page = await ctx.newPage()
  let title = ""
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: DEFAULTS.navigationTimeout })
    title = await page.title()

    await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS })
    if (opts.forceVisible) {
      await page.addStyleTag({ content: FORCE_VISIBLE_CSS })
    }

    await autoScroll(page)

    await page.evaluate(() => (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {})
    await page
      .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 10000 })
      .catch(() => {})

    await page.screenshot({ path: file, fullPage: true })
  } finally {
    await ctx.close()
  }
  return { url, mode, file, slug, title }
}

export async function captureUrls(urls: string[], opts: CaptureOptions = {}): Promise<CaptureSummary> {
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
  const otherHosts = new Set(urls.map(domainOf).filter((h) => h !== domain))
  if (otherHosts.size > 0) {
    console.error(
      `警告: URLが複数のホストにまたがっています。すべて ${domain}/ に保存します。` +
        `他のホスト: ${[...otherHosts].slice(0, 3).join(", ")}${otherHosts.size > 3 ? ` (+${otherHosts.size - 3})` : ""}`
    )
  }

  if (opts.dryRun) {
    return { domain, siteDir: null, results: [] }
  }

  const baseDir = opts.outDir || DEFAULTS.sitesDir
  const siteDir = path.join(baseDir, domain)
  await mkdir(path.join(siteDir, "desktop"), { recursive: true })
  await mkdir(path.join(siteDir, "mobile"), { recursive: true })

  const concurrency = opts.concurrency || DEFAULTS.concurrency
  const rateLimiter = opts.rateLimiter

  let browser: Browser
  try {
    browser = await chromium.launch()
  } catch (err) {
    throw new SiteSnapError(
      "BROWSER_LAUNCH_FAILED",
      `Chromium の起動に失敗しました: ${(err as Error).message}`,
      "Playwright の Chromium を再インストールしてください: bunx playwright install chromium",
      {}
    )
  }
  const results: CaptureResult[] = []

  try {
    for (const mode of ["desktop", "mobile"] as const) {
      let i = 0
      const worker = async () => {
        while (i < urls.length) {
          const my = i++
          const url = urls[my]!
          try {
            if (rateLimiter) await rateLimiter.wait(domainOf(url))
            const r = await captureOne(browser, url, mode, siteDir, opts)
            results.push(r)
            console.error(`[${mode}] ${my + 1}/${urls.length} ${r.skipped ? "skip" : "ok  "} ${url}`)
          } catch (e) {
            const message = (e as Error).message
            console.error(`[${mode}] ${my + 1}/${urls.length} ERR  ${url} :: ${message}`)
            results.push({ url, mode, error: message, slug: slugify(url) })
          }
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker))
    }
  } finally {
    await browser.close()
  }

  if (!opts.forceVisible && results.length > 0) {
    console.error(
      `\nヒント: スクリーンショットが真っ白だった場合は --force-visible を付けて再実行してください (AOS, wow.js 等のスクロール表示ライブラリ対策)。`
    )
  }

  return { domain, siteDir, results }
}
