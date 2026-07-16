import { test, expect } from "bun:test"
import { existsSync } from "node:fs"
import { gotoAndSettle, launchChromium } from "../src/capture.ts"
import { DEFAULTS } from "../src/config.ts"
import { captureShot } from "../src/shot.ts"
import { makeTmpDir, cleanupTmpDir } from "./helpers"

// ページ内 fetch が永遠に応答しない = in-flight リクエストが残り続けるので
// networkidle (500ms 無通信) には絶対に到達しない。広告・アナリティクスが
// 常時通信するメディアサイトの再現
const NEVER_IDLE_HTML = `<!doctype html><html><head><title>never-idle</title></head>
<body><main>content</main><script>fetch("/hang").catch(() => {})</script></body></html>`

function serveNeverIdle() {
  return Bun.serve({
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/hang") return new Promise<Response>(() => {})
      return new Response(NEVER_IDLE_HTML, { headers: { "content-type": "text/html" } })
    },
  })
}

test(
  "gotoAndSettle: networkidle に到達しないページでも load 完了 + idle 上限で返る",
  async () => {
    const server = serveNeverIdle()
    const browser = await launchChromium()
    const ctx = await browser.newContext()
    try {
      const page = await ctx.newPage()
      const t0 = Date.now()
      const response = await gotoAndSettle(page, `http://127.0.0.1:${server.port}/`, {
        idleTimeoutMs: 300,
      })
      // waitUntil: "networkidle" なら navigationTimeout (45s) まで待って例外になるケース
      expect(response?.status()).toBe(200)
      expect(await page.title()).toBe("never-idle")
      expect(Date.now() - t0).toBeLessThan(10000)
    } finally {
      await ctx.close().catch(() => {})
      server.stop(true)
    }
  },
  30000
)

test(
  "captureShot: 常時通信ページでもタイムアウトせず撮影できる",
  async () => {
    const server = serveNeverIdle()
    const dir = await makeTmpDir()
    // テスト短縮のため idle 上限だけ一時的に縮める
    const original = DEFAULTS.networkIdleTimeout
    ;(DEFAULTS as { networkIdleTimeout: number }).networkIdleTimeout = 300
    try {
      const r = await captureShot(`http://127.0.0.1:${server.port}/`, {
        outDir: dir,
        allowPrivate: true,
      })
      expect(r.http_status).toBe(200)
      expect(r.title).toBe("never-idle")
      expect(existsSync(r.file)).toBeTrue()
    } finally {
      ;(DEFAULTS as { networkIdleTimeout: number }).networkIdleTimeout = original
      server.stop(true)
      await cleanupTmpDir(dir)
    }
  },
  30000
)
