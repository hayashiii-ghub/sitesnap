/// <reference lib="dom" />
import { createRequire } from "node:module"
import { closeChromium, FREEZE_ANIMATIONS_CSS, launchChromium } from "./capture.ts"
import { DEFAULTS } from "./config.ts"
import { assertPublicUrl } from "./url-guard.ts"
import { resolvedViewport, shotContextOptions, type ShotOptions, type Viewport } from "./shot.ts"

export interface CheckOptions
  extends Pick<ShotOptions, "vp" | "device" | "settleMs" | "allowPrivate" | "browser"> {}

export interface OverflowCheck {
  pass: boolean
  // documentElement.scrollWidth - clientWidth (px)
  amount: number
  offenders: { element: string; width: number; right: number }[]
}

export interface ConsoleErrorsCheck {
  pass: boolean
  messages: string[]
}

export interface FailedRequestsCheck {
  pass: boolean
  requests: { url: string; status: number | null; error: string | null }[]
}

export interface A11yViolation {
  id: string
  impact: string | null
  description: string
  help_url: string
  nodes: number
  targets: string[]
}

export interface A11yCheck {
  pass: boolean
  violations: A11yViolation[]
}

export interface CheckResult {
  url: string
  viewport: Viewport
  pass: boolean
  checks: {
    overflow: OverflowCheck
    console_errors: ConsoleErrorsCheck
    failed_requests: FailedRequestsCheck
    a11y: A11yCheck
  }
  title: string
  http_status?: number
  duration_ms: number
}

const require = createRequire(import.meta.url)

export async function checkUrl(url: string, opts: CheckOptions = {}): Promise<CheckResult> {
  const startedAt = Date.now()
  assertPublicUrl(url, { allowPrivate: opts.allowPrivate || false })
  const settle = opts.settleMs ?? null

  const browser = opts.browser ?? (await launchChromium())
  let ctx: Awaited<ReturnType<typeof browser.newContext>> | undefined
  try {
    ctx = await browser.newContext({
      ...shotContextOptions(opts),
      locale: DEFAULTS.locale,
      timezoneId: DEFAULTS.timezone,
      ...(settle === null ? { reducedMotion: "reduce" as const } : {}),
    })
    const page = await ctx.newPage()

    const consoleMessages: string[] = []
    const failedRequests: { url: string; status: number | null; error: string | null }[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleMessages.push(msg.text())
    })
    page.on("pageerror", (err) => {
      consoleMessages.push(err.message)
    })
    page.on("requestfailed", (req) => {
      failedRequests.push({ url: req.url(), status: null, error: req.failure()?.errorText || "failed" })
    })
    page.on("response", (res) => {
      if (res.status() >= 400) {
        failedRequests.push({ url: res.url(), status: res.status(), error: null })
      }
    })

    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: DEFAULTS.navigationTimeout,
    })
    const title = await page.title()

    if (settle === null) {
      await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS })
    } else if (settle > 0) {
      await page.waitForTimeout(settle)
    }
    await page
      .evaluate(() => (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
      .catch(() => {})

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      const amount = Math.max(0, doc.scrollWidth - doc.clientWidth)
      const vw = doc.clientWidth
      const offenders: { element: string; width: number; right: number }[] = []
      if (amount > 0) {
        for (const node of document.querySelectorAll("body *")) {
          const rect = node.getBoundingClientRect()
          if (rect.right > vw + 1 && rect.width > 0) {
            const el = node as HTMLElement
            const id = el.id ? `#${el.id}` : ""
            const cls = el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : ""
            offenders.push({
              element: `${el.tagName.toLowerCase()}${id}${cls}`,
              width: Math.round(rect.width),
              right: Math.round(rect.right),
            })
            if (offenders.length >= 10) break
          }
        }
      }
      return { amount, offenders }
    })

    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") })
    const axeResult = (await page.evaluate(async () => {
      const axe = (window as Window & { axe?: { run: (ctx: unknown, opts: unknown) => Promise<unknown> } }).axe!
      return await axe.run(document, { resultTypes: ["violations"] })
    })) as {
      violations: {
        id: string
        impact?: string
        description: string
        helpUrl: string
        nodes: { target: unknown[] }[]
      }[]
    }
    const violations: A11yViolation[] = axeResult.violations.map((v) => ({
      id: v.id,
      impact: v.impact || null,
      description: v.description,
      help_url: v.helpUrl,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 5).map((n) => n.target.map(String).join(" ")),
    }))

    const checks = {
      overflow: { pass: overflow.amount === 0, ...overflow },
      console_errors: { pass: consoleMessages.length === 0, messages: consoleMessages },
      failed_requests: { pass: failedRequests.length === 0, requests: failedRequests },
      a11y: { pass: violations.length === 0, violations },
    }

    return {
      url,
      viewport: resolvedViewport(opts),
      pass: Object.values(checks).every((c) => c.pass),
      checks,
      title,
      http_status: response?.status(),
      duration_ms: Date.now() - startedAt,
    }
  } finally {
    await ctx?.close().catch(() => {})
    if (!opts.browser) await closeChromium(browser)
  }
}
