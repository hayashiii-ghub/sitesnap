/// <reference lib="dom" />
import { devices, type Browser } from "playwright"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import {
  autoScroll,
  closeChromium,
  FORCE_VISIBLE_CSS,
  FREEZE_ANIMATIONS_CSS,
  launchChromium,
  slugify,
} from "./capture.ts"
import { DEFAULTS } from "./config.ts"
import { SiteSnapError } from "./errors.ts"
import { assertPublicUrl } from "./url-guard.ts"

export interface Viewport {
  width: number
  height: number
}

export interface ShotOptions {
  vp?: Viewport | null
  device?: string | null
  selector?: string | null
  settleMs?: number | null
  full?: boolean
  // 状態違いの撮り分け用。ファイル名のサフィックスになり上書きを防ぐ
  label?: string | null
  // 撮影前に順番にクリックする CSS セレクタ (タブ切替・details 展開など)
  clicks?: string[] | null
  // 撮影前に実行する任意 JS (click で表現しにくい状態セットアップの逃げ道)
  evalJs?: string | null
  outDir?: string
  allowPrivate?: boolean
  // file:// (ローカル HTML モック) の直撮りを許可する
  allowFile?: boolean
  forceVisible?: boolean
  // 起動済み browser の再利用 (主にテスト用)。指定時は close しない。
  // Bun では同一プロセス内で launch を繰り返すと CDP パイプが無応答になることがある
  browser?: Browser
}

export interface ShotResult {
  url: string
  file: string
  viewport: Viewport
  device: string | null
  selector: string | null
  full: boolean
  label: string | null
  settle_ms: number | null
  title: string
  http_status?: number
  duration_ms: number
}

export function parseViewport(value: string): Viewport {
  const m = value.match(/^(\d+)x(\d+)$/)
  const width = m ? Number(m[1]) : 0
  const height = m ? Number(m[2]) : 0
  if (!m || width <= 0 || height <= 0) {
    throw new SiteSnapError(
      "INVALID_OPTION",
      `--vp の形式が不正です: ${value}`,
      "--vp <width>x<height> の形式で指定してください (例: --vp 1440x900)。",
      {}
    )
  }
  return { width, height }
}

function deviceDescriptorFor(name: string) {
  const d = devices[name]
  if (!d) {
    throw new SiteSnapError(
      "UNKNOWN_DEVICE",
      `不明なデバイス名です: ${name}`,
      `Playwright のデバイス名を指定してください (例: "iPhone 13", "iPad Pro 11", "Pixel 7")。`,
      {}
    )
  }
  return d
}

function selectorSlug(selector: string): string {
  const cleaned = selector
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+$/g, "")
    .slice(0, 40)
  return cleaned || "el"
}

function labelSlug(label: string): string {
  const cleaned = label
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return cleaned || "state"
}

export function resolvedViewport(opts: Pick<ShotOptions, "vp" | "device">): Viewport {
  if (opts.device) {
    const d = deviceDescriptorFor(opts.device)
    return { width: d.viewport.width, height: d.viewport.height }
  }
  if (opts.vp) return opts.vp
  const d = DEFAULTS.viewports.desktop
  return { width: d.width, height: d.height }
}

// site/page のアーカイブ用フォルダ (hostname のみ) と違い、shots は開発ループ用なので
// localhost のポート違いを別フォルダに分ける
export function shotDirFor(url: string, outDir: string): string {
  const u = new URL(url)
  // file:// は hostname が空になるので専用フォルダにまとめる
  if (u.protocol === "file:") return path.join(outDir, "_file", "shots")
  const host = u.port ? `${u.hostname}_${u.port}` : u.hostname
  return path.join(outDir, host, "shots")
}

export function shotFileFor(url: string, opts: Pick<ShotOptions, "vp" | "device" | "selector" | "full" | "label">): string {
  const parts: string[] = [slugify(url)]
  if (opts.device) {
    parts.push(opts.device.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
  } else {
    const v = resolvedViewport(opts)
    parts.push(`${v.width}x${v.height}`)
  }
  if (opts.selector) parts.push(`sel-${selectorSlug(opts.selector)}`)
  if (opts.full) parts.push("full")
  if (opts.label) parts.push(labelSlug(opts.label))
  return `${parts.join("--")}.png`
}

export function shotContextOptions(opts: Pick<ShotOptions, "vp" | "device">) {
  if (opts.device) return deviceDescriptorFor(opts.device)
  const v = opts.vp ?? resolvedViewport(opts)
  return {
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  }
}

export async function captureShot(url: string, opts: ShotOptions = {}): Promise<ShotResult> {
  const startedAt = Date.now()
  assertPublicUrl(url, { allowPrivate: opts.allowPrivate || false, allowFile: opts.allowFile || false })

  const settle = opts.settleMs ?? null
  const dir = shotDirFor(url, opts.outDir || DEFAULTS.sitesDir)
  const file = path.join(dir, shotFileFor(url, opts))
  await mkdir(dir, { recursive: true })

  const browser = opts.browser ?? (await launchChromium())
  let ctx: Awaited<ReturnType<Browser["newContext"]>> | undefined
  try {
    ctx = await browser.newContext({
      ...shotContextOptions(opts),
      locale: DEFAULTS.locale,
      timezoneId: DEFAULTS.timezone,
      // --settle はアニメ完了後の最終状態を撮るためのフラグなので凍結しない
      ...(settle === null ? { reducedMotion: "reduce" as const } : {}),
    })
    const page = await ctx.newPage()
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: DEFAULTS.navigationTimeout,
    })
    const title = await page.title()

    // 撮影前の状態仕込み: eval を先に流して初期状態を仕込んでから click 操作する。
    if (opts.evalJs) {
      try {
        await page.evaluate(opts.evalJs)
      } catch (e) {
        throw new SiteSnapError(
          "INTERACTION_FAILED",
          `--eval の実行に失敗しました: ${(e as Error).message}`,
          "JS の構文やページ内の参照を確認してください。",
          { url }
        )
      }
    }

    // click で CSS ラジオタブ・details 展開などの状態を作る。
    // freeze より前に実行し、ライブなページに対して操作してから最終フレームを撮る。
    for (const sel of opts.clicks ?? []) {
      const target = page.locator(sel).first()
      if ((await target.count()) === 0) {
        throw new SiteSnapError(
          "INTERACTION_FAILED",
          `クリック対象の要素がありません: ${sel}`,
          "セレクタを確認するか、--settle で描画完了を待ってから再実行してください。",
          { url }
        )
      }
      await target.click({ timeout: 10000 })
    }

    if (settle === null) {
      await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS })
    }
    if (opts.forceVisible) {
      await page.addStyleTag({ content: FORCE_VISIBLE_CSS })
    }
    if (settle !== null && settle > 0) {
      await page.waitForTimeout(settle)
    }

    await page
      .evaluate(() => (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready)
      .catch(() => {})
    await page
      .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 10000 })
      .catch(() => {})

    if (opts.full) {
      await autoScroll(page)
      await page.screenshot({ path: file, fullPage: true })
    } else if (opts.selector) {
      const locator = page.locator(opts.selector).first()
      if ((await locator.count()) === 0) {
        throw new SiteSnapError(
          "ELEMENT_NOT_FOUND",
          `セレクタに一致する要素がありません: ${opts.selector}`,
          "セレクタを確認するか、--settle で描画完了を待ってから再実行してください。",
          { url }
        )
      }
      await locator.screenshot({ path: file, timeout: 10000 })
    } else {
      await page.screenshot({ path: file, fullPage: false })
    }

    return {
      url,
      file,
      viewport: resolvedViewport(opts),
      device: opts.device ?? null,
      selector: opts.selector ?? null,
      full: opts.full || false,
      label: opts.label ?? null,
      settle_ms: settle,
      title,
      http_status: response?.status(),
      duration_ms: Date.now() - startedAt,
    }
  } finally {
    await ctx?.close().catch(() => {})
    if (!opts.browser) await closeChromium(browser)
  }
}
