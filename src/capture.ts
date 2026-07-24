/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, rm } from "node:fs/promises"
import path from "node:path"
import type { Browser, BrowserContext } from "playwright"
import { authContextOptions, type AuthOptions } from "./auth.ts"
import { DEFAULTS } from "./config.ts"
import { defaultMobileDeviceName, deviceContextOptions } from "./devices.ts"
import { SiteSnapError } from "./errors.ts"
import { installNetworkPolicy } from "./network-policy.ts"
import type { HostRateLimiter } from "./rate-limit.ts"
import { assertPublicUrl, assertPublicUrlResolved, type HostLookup } from "./url-guard.ts"

export type CaptureMode = "desktop" | "mobile"

export interface CaptureOptions extends AuthOptions {
  outDir?: string
  concurrency?: number
  forceVisible?: boolean
  waitMs?: number
  preScroll?: "full-page" | "none"
  allowPrivate?: boolean
  rateLimiter?: HostRateLimiter
  onLog?: (message: string) => void
  authOrigin?: string
  lookup?: HostLookup
}

export interface CaptureResult {
  url: string
  mode: CaptureMode
  device?: string
  file?: string
  slug: string
  title?: string
  httpStatus?: number
  durationMs?: number
  capturedAt?: string
  error?: string
}

export interface CaptureSummary {
  domain: string
  siteDir: string
  results: CaptureResult[]
}

export interface CaptureTask {
  url: string
  mode: CaptureMode
  device?: string
}

export function slugify(url: string): string {
  const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, "")
  if (!pathname) return "index"
  return (
    pathname
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 120) || "index"
  )
}

export function archiveFileStem(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16)
  return `${slugify(url)}--${hash}`
}

export function domainOf(url: string): string {
  return new URL(url).hostname
}

export function groupUrlsByHost(urls: string[]): Array<[string, string[]]> {
  const groups = new Map<string, string[]>()
  for (const url of urls) {
    const host = domainOf(url)
    const group = groups.get(host) ?? []
    group.push(url)
    groups.set(host, group)
  }
  return [...groups.entries()]
}

export function archiveDirectoryName(domain: string): string {
  if (!domain || domain === "." || domain === "..") {
    throw new SiteSnapError("INVALID_URL", `安全でないarchive domainです: ${domain}`, "有効なhostを指定してください。")
  }
  return encodeURIComponent(domain)
}

export function archiveSiteDir(outDir: string, domain: string): string {
  const base = path.resolve(outDir)
  const target = path.resolve(base, archiveDirectoryName(domain))
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new SiteSnapError("INVALID_URL", `archive pathが出力先を逸脱します: ${domain}`, "有効なhostを指定してください。")
  }
  return target
}

export function buildCaptureTasks(urls: string[]): CaptureTask[] {
  return urls.flatMap((url) => [
    { url, mode: "desktop" as const },
    { url, mode: "mobile" as const, device: defaultMobileDeviceName() },
  ])
}

export function contextOptionsFor(mode: CaptureMode, deviceName?: string) {
  if (mode === "desktop") {
    const { width, height, deviceScaleFactor, isMobile, hasTouch } = DEFAULTS.viewports.desktop
    return { viewport: { width, height }, deviceScaleFactor, isMobile, hasTouch }
  }
  return deviceContextOptions(deviceName ?? defaultMobileDeviceName())
}

declare global {
  var __sitesnapSharedBrowser: Browser | undefined
}

export async function launchChromium(): Promise<Browser> {
  const { chromium } = await import("playwright")
  if (globalThis.__sitesnapSharedBrowser) return globalThis.__sitesnapSharedBrowser
  try {
    return await chromium.launch()
  } catch (error) {
    throw new SiteSnapError("BROWSER_LAUNCH_FAILED", `Chromiumの起動に失敗しました: ${(error as Error).message}`, "bunx playwright install chromium を実行してください。")
  }
}

export async function closeChromium(browser: Browser): Promise<void> {
  if (browser !== globalThis.__sitesnapSharedBrowser) await browser.close()
}

export async function gotoAndSettle(
  page: import("playwright").Page,
  url: string,
  opts: { timeout?: number; idleTimeoutMs?: number } = {}
) {
  const response = await page.goto(url, { waitUntil: "load", timeout: opts.timeout ?? DEFAULTS.navigationTimeout })
  await page.waitForLoadState("networkidle", { timeout: opts.idleTimeoutMs ?? DEFAULTS.networkIdleTimeout }).catch(() => {})
  return response
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

async function captureOne(browser: Browser, task: CaptureTask, siteDir: string, opts: CaptureOptions): Promise<CaptureResult> {
  const startedAt = Date.now()
  const slug = archiveFileStem(task.url)
  const file = path.join(siteDir, "screenshots", task.mode, `${slug}.png`)
  const authOrigin = opts.authOrigin ?? new URL(task.url).origin
  let context: BrowserContext | undefined
  try {
    context = await browser.newContext({
      ...contextOptionsFor(task.mode, task.device),
      ...authContextOptions({ ...opts, headers: undefined }, authOrigin),
      locale: DEFAULTS.locale,
      timezoneId: DEFAULTS.timezone,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    })
    const getPolicyError = await installNetworkPolicy(context, task.url, opts)
    const page = await context.newPage()
    let response: import("playwright").Response | null
    try {
      response = await gotoAndSettle(page, task.url)
    } catch (error) {
      throw getPolicyError() ?? error
    }
    const httpStatus = response?.status()
    const title = await page.title()
    await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS })
    if (opts.forceVisible) await page.addStyleTag({ content: FORCE_VISIBLE_CSS })
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs)
    if (opts.preScroll !== "none") await autoScroll(page)
    await page.evaluate(() => (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {})
    await page.waitForFunction(() => [...document.images].every((image) => image.complete), null, { timeout: 10000 }).catch(() => {})
    const networkError = getPolicyError()
    if (networkError) throw networkError

    const temporary = `${file}.tmp-${randomUUID()}.png`
    try {
      await page.screenshot({ path: temporary, fullPage: true })
      await rename(temporary, file)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    return {
      url: task.url,
      mode: task.mode,
      ...(task.device ? { device: task.device } : {}),
      file,
      slug,
      title,
      httpStatus,
      durationMs: Date.now() - startedAt,
      capturedAt: new Date().toISOString(),
    }
  } finally {
    await context?.close().catch((error) => opts.onLog?.(`[cleanup] ${task.url}: ${(error as Error).message}`))
  }
}

async function runCaptureTasks(browser: Browser, tasks: CaptureTask[], siteDir: string, opts: CaptureOptions): Promise<CaptureResult[]> {
  const concurrency = opts.concurrency ?? DEFAULTS.concurrency
  const results = new Array<CaptureResult>(tasks.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor++
      const task = tasks[index]!
      try {
        await opts.rateLimiter?.wait(domainOf(task.url))
        results[index] = await captureOne(browser, task, siteDir, opts)
        opts.onLog?.(`[${task.mode}] ${index + 1}/${tasks.length} ok   ${task.url}`)
      } catch (error) {
        const message = (error as Error).message
        results[index] = {
          url: task.url,
          mode: task.mode,
          ...(task.device ? { device: task.device } : {}),
          slug: archiveFileStem(task.url),
          capturedAt: new Date().toISOString(),
          error: message,
        }
        opts.onLog?.(`[${task.mode}] ${index + 1}/${tasks.length} ERR  ${task.url} :: ${message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

export async function captureTasks(domain: string, tasks: CaptureTask[], opts: CaptureOptions = {}): Promise<CaptureSummary> {
  if (tasks.length === 0) throw new SiteSnapError("INVALID_URL", "capture taskがありません", "少なくとも1つのURLを指定してください。")
  for (const task of tasks) {
    assertPublicUrl(task.url, opts)
    if (domainOf(task.url) !== domain) {
      throw new SiteSnapError("INVALID_URL", `capture taskのhostがarchiveと一致しません: ${task.url}`, "URLをhost別に分けてください。", { url: task.url, domain })
    }
  }
  await Promise.all([...new Set(tasks.map((task) => task.url))].map((url) => assertPublicUrlResolved(url, opts)))

  const siteDir = archiveSiteDir(opts.outDir ?? DEFAULTS.sitesDir, domain)
  await mkdir(path.join(siteDir, "screenshots", "desktop"), { recursive: true })
  await mkdir(path.join(siteDir, "screenshots", "mobile"), { recursive: true })
  const browser = await launchChromium()
  try {
    return { domain, siteDir, results: await runCaptureTasks(browser, tasks, siteDir, opts) }
  } finally {
    await closeChromium(browser).catch((error) => opts.onLog?.(`[cleanup] browser: ${(error as Error).message}`))
  }
}

export async function captureUrls(urls: string[], opts: CaptureOptions = {}): Promise<CaptureSummary> {
  if (urls.length === 0) throw new SiteSnapError("INVALID_URL", "URLが指定されていません", "少なくとも1つのURLを指定してください。")
  for (const url of urls) assertPublicUrl(url, opts)
  const groups = groupUrlsByHost(urls)
  if (groups.length !== 1) throw new SiteSnapError("INVALID_URL", "複数hostのURLを1つのarchiveへ保存できません", "URLをhost別に分けてください。")
  const hasAuthentication = Boolean(opts.headers || opts.httpCredentials)
  return captureTasks(groups[0]![0], buildCaptureTasks(urls), {
    ...opts,
    authOrigin: opts.authOrigin ?? (hasAuthentication ? new URL(urls[0]!).origin : undefined),
  })
}
