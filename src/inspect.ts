/// <reference lib="dom" />
import { authContextOptions } from "./auth.ts"
import { closeChromium, FREEZE_ANIMATIONS_CSS, gotoAndSettle, launchChromium } from "./capture.ts"
import { DEFAULTS } from "./config.ts"
import { SiteSnapError } from "./errors.ts"
import { assertPublicUrl } from "./url-guard.ts"
import { resolvedViewport, shotContextOptions, type ShotOptions, type Viewport } from "./shot.ts"

// AI の数値検証でよく使うプロパティ。--props で任意に追加できる
const DEFAULT_PROPS = [
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "color",
  "background-color",
  "font-size",
  "font-family",
  "font-weight",
  "line-height",
  "opacity",
  "visibility",
  "z-index",
  "overflow",
  "transform",
] as const

export interface InspectOptions
  extends Pick<
    ShotOptions,
    "vp" | "device" | "settleMs" | "allowPrivate" | "browser" | "storageState" | "headers" | "httpCredentials"
  > {
  selector?: string | null
  props?: string[]
  limit?: number | null
}

export interface ElementInfo {
  box: { x: number; y: number; width: number; height: number }
  style: Record<string, string>
  text: string
  overflow: { x: number; y: number }
}

export interface InspectResult {
  url: string
  selector: string
  viewport: Viewport
  count: number
  elements: ElementInfo[]
  title: string
  http_status?: number
  duration_ms: number
}

export async function inspectUrl(url: string, opts: InspectOptions = {}): Promise<InspectResult> {
  const startedAt = Date.now()
  assertPublicUrl(url, { allowPrivate: opts.allowPrivate || false })
  const selector = opts.selector || ""
  if (!selector) {
    throw new SiteSnapError(
      "INVALID_OPTION",
      "--selector が指定されていません",
      "sitesnap inspect <url> --selector <css> の形式で指定してください。",
      { url }
    )
  }

  const settle = opts.settleMs ?? null
  const props = [...DEFAULT_PROPS, ...(opts.props || [])]
  const limit = opts.limit ?? 10

  const browser = opts.browser ?? (await launchChromium())
  let ctx: Awaited<ReturnType<typeof browser.newContext>> | undefined
  try {
    ctx = await browser.newContext({
      ...shotContextOptions(opts),
      ...authContextOptions(opts),
      locale: DEFAULTS.locale,
      timezoneId: DEFAULTS.timezone,
      ...(settle === null ? { reducedMotion: "reduce" as const } : {}),
    })
    const page = await ctx.newPage()
    const response = await gotoAndSettle(page, url)
    const title = await page.title()

    if (settle === null) {
      await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS })
    } else if (settle > 0) {
      await page.waitForTimeout(settle)
    }
    await page
      .evaluate(() => (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
      .catch(() => {})

    const { count, elements } = await page.evaluate(
      ({ selector, props, limit }) => {
        const nodes = [...document.querySelectorAll(selector)]
        const elements = nodes.slice(0, limit).map((node) => {
          const rect = node.getBoundingClientRect()
          const computed = getComputedStyle(node)
          const style: Record<string, string> = {}
          for (const p of props) style[p] = computed.getPropertyValue(p)
          const el = node as HTMLElement
          return {
            box: {
              x: Math.round(rect.x * 100) / 100,
              y: Math.round(rect.y * 100) / 100,
              width: Math.round(rect.width * 100) / 100,
              height: Math.round(rect.height * 100) / 100,
            },
            style,
            text: (el.innerText || node.textContent || "").trim().slice(0, 200),
            overflow: {
              x: Math.max(0, node.scrollWidth - node.clientWidth),
              y: Math.max(0, node.scrollHeight - node.clientHeight),
            },
          }
        })
        return { count: nodes.length, elements }
      },
      { selector, props, limit }
    )

    return {
      url,
      selector,
      viewport: resolvedViewport(opts),
      count,
      elements,
      title,
      http_status: response?.status(),
      duration_ms: Date.now() - startedAt,
    }
  } finally {
    await ctx?.close().catch(() => {})
    if (!opts.browser) await closeChromium(browser)
  }
}
