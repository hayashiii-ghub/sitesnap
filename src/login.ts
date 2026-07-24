import { type Browser } from "playwright"
import { randomUUID } from "node:crypto"
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { createInterface } from "node:readline"
import { DEFAULTS } from "./config.ts"
import { SiteSnapError } from "./errors.ts"
import { installNetworkPolicy } from "./network-policy.ts"
import { assertPublicUrlResolved, type HostLookup } from "./url-guard.ts"

export interface LoginOptions {
  // 保存先。未指定は ./sitesnap-state.json
  outFile?: string | null
  allowPrivate?: boolean
  lookup?: HostLookup
  // 起動済み browser の再利用 (主にテスト用)。指定時は close しない
  browser?: Browser
  // 「ログイン完了」の合図を待つ。既定はターミナルの Enter (テストでは差し替える)
  waitForDone?: () => Promise<void>
  onLog?: (message: string) => void
}

export interface LoginResult {
  url: string
  file: string
  cookies: number
  origins: number
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin })
    rl.once("line", () => {
      rl.close()
      resolve()
    })
  })
}

async function launchHeadedChromium(): Promise<Browser> {
  const { chromium } = await import("playwright")
  try {
    return await chromium.launch({ headless: false })
  } catch (err) {
    throw new SiteSnapError(
      "BROWSER_LAUNCH_FAILED",
      `Chromium の起動に失敗しました: ${(err as Error).message}`,
      "Playwright の Chromium を再インストールしてください: bunx playwright install chromium",
      {}
    )
  }
}

// ブラウザを開いて人間にログインしてもらい、storage state (cookies + localStorage)
// を JSON に保存する。保存した状態は --storage-state <file> で全撮影コマンドから使える
export async function runLogin(url: string, opts: LoginOptions = {}): Promise<LoginResult> {
  await assertPublicUrlResolved(url, { allowPrivate: opts.allowPrivate || false, lookup: opts.lookup })
  const log = opts.onLog ?? ((message: string) => console.error(message))
  const file = path.resolve(opts.outFile || "./sitesnap-state.json")

  const browser = opts.browser ?? (await launchHeadedChromium())
  let ctx: Awaited<ReturnType<Browser["newContext"]>> | undefined
  try {
    ctx = await browser.newContext({ serviceWorkers: "block" })
    const getPolicyError = await installNetworkPolicy(ctx, url, {
      allowPrivate: opts.allowPrivate,
      lookup: opts.lookup,
    })
    const page = await ctx.newPage()
    // ログインページは networkidle に到達しないことが多いので domcontentloaded で開く
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULTS.navigationTimeout })
    } catch (error) {
      throw getPolicyError() ?? error
    }

    log("ブラウザでログインを完了してください。")
    log("完了したら、ブラウザを閉じずにこのターミナルで Enter を押すと状態を保存します。")

    // ブラウザを先に閉じられると storageState が取れないので、閉鎖を検知して案内する
    let closed = false
    ctx.once("close", () => {
      closed = true
    })
    await (opts.waitForDone ?? waitForEnter)()
    if (closed) {
      throw new SiteSnapError(
        "INTERACTION_FAILED",
        "ブラウザが閉じられたため、ログイン状態を保存できませんでした",
        "sitesnap login をやり直し、Enter を押すまでブラウザを開いたままにしてください。",
        { url }
      )
    }
    const policyError = getPolicyError()
    if (policyError) throw policyError

    await mkdir(path.dirname(file), { recursive: true })
    const state = await ctx.storageState()
    const temporary = `${file}.tmp-${randomUUID()}`
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
      await rename(temporary, file)
      await chmod(file, 0o600)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
    return { url, file, cookies: state.cookies.length, origins: state.origins.length }
  } finally {
    await ctx?.close().catch(() => {})
    if (!opts.browser) await browser.close().catch(() => {})
  }
}
