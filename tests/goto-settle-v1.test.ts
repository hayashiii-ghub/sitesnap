import { expect, test } from "bun:test"
import { captureUrls, gotoAndSettle, launchChromium } from "../src/capture.ts"
import { DEFAULTS } from "../src/config.ts"
import { cleanupTmpDir, makeTmpDir } from "./helpers.ts"

const NEVER_IDLE = `<html><head><title>never-idle</title></head><body>ok<script>fetch('/hang').catch(()=>{})</script></body></html>`

function server() {
  return Bun.serve({
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/hang") return new Promise<Response>(() => {})
      return new Response(NEVER_IDLE, { headers: { "content-type": "text/html" } })
    },
  })
}

test("networkidle is bounded and never-idle pages still capture", async () => {
  const web = server()
  const browser = await launchChromium()
  const context = await browser.newContext()
  const out = await makeTmpDir()
  const original = DEFAULTS.networkIdleTimeout
  ;(DEFAULTS as { networkIdleTimeout: number }).networkIdleTimeout = 200
  try {
    const page = await context.newPage()
    const response = await gotoAndSettle(page, `http://127.0.0.1:${web.port}/`, { idleTimeoutMs: 200 })
    expect(response?.status()).toBe(200)
    const captured = await captureUrls([`http://127.0.0.1:${web.port}/`], { outDir: out, allowPrivate: true, preScroll: "none" })
    expect(captured.results.every((result) => !result.error)).toBeTrue()
  } finally {
    ;(DEFAULTS as { networkIdleTimeout: number }).networkIdleTimeout = original
    await context.close()
    web.stop(true)
    await cleanupTmpDir(out)
  }
}, 30000)
