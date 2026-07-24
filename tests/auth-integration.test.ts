import { expect, test } from "bun:test"
import { readFile, stat } from "node:fs/promises"
import type { Browser } from "playwright"
import path from "node:path"
import { captureUrls } from "../src/capture.ts"
import { runLogin } from "../src/login.ts"
import { cleanupTmpDir, makeTmpDir } from "./helpers.ts"

test("custom auth header reaches only the capture origin, not cross-origin subresources", async () => {
  let leaked: string | null = null
  const sink = Bun.serve({
    port: 0,
    fetch(request) {
      leaked = request.headers.get("authorization")
      return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } })
    },
  })
  const target = Bun.serve({
    port: 0,
    fetch(request) {
      if (request.headers.get("authorization") !== "Bearer target-secret") return new Response("unauthorized", { status: 401 })
      return new Response(`<html><head><title>authed</title></head><body><img src="http://127.0.0.1:${sink.port}/pixel.png"></body></html>`, { headers: { "content-type": "text/html" } })
    },
  })
  const out = await makeTmpDir()
  try {
    const url = `http://127.0.0.1:${target.port}/`
    const capture = await captureUrls([url], {
      outDir: out,
      allowPrivate: true,
      headers: { Authorization: "Bearer target-secret" },
      preScroll: "none",
    })
    expect(capture.results.every((result) => result.httpStatus === 200 && !result.error)).toBeTrue()
    expect(leaked).toBeNull()
  } finally {
    target.stop(true)
    sink.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("custom auth header is not forwarded by a cross-origin redirect", async () => {
  const seen: Array<string | null> = []
  const destination = Bun.serve({
    port: 0,
    fetch(request) {
      seen.push(request.headers.get("authorization"))
      return new Response("<html><head><title>redirected</title></head><body>ok</body></html>", {
        headers: { "content-type": "text/html" },
      })
    },
  })
  const source = Bun.serve({
    port: 0,
    fetch() {
      return new Response(null, {
        status: 302,
        headers: { location: `http://127.0.0.1:${destination.port}/landing` },
      })
    },
  })
  const out = await makeTmpDir()
  try {
    const capture = await captureUrls([`http://127.0.0.1:${source.port}/`], {
      outDir: out,
      allowPrivate: true,
      headers: { Authorization: "Bearer redirect-secret" },
      preScroll: "none",
    })
    expect(capture.results.every((result) => result.httpStatus === 200 && !result.error)).toBeTrue()
    expect(seen).toEqual([null, null])
  } finally {
    source.stop(true)
    destination.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("HTTP Basic credentials are scoped and accepted by the target", async () => {
  const expected = `Basic ${Buffer.from("user:pass").toString("base64")}`
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      if (request.headers.get("authorization") !== expected) {
        return new Response("auth", { status: 401, headers: { "www-authenticate": 'Basic realm="sitesnap"' } })
      }
      return new Response("<html><head><title>basic</title></head><body>ok</body></html>", { headers: { "content-type": "text/html" } })
    },
  })
  const out = await makeTmpDir()
  try {
    const capture = await captureUrls([`http://127.0.0.1:${server.port}/`], {
      outDir: out,
      allowPrivate: true,
      httpCredentials: { username: "user", password: "pass" },
      preScroll: "none",
    })
    expect(capture.results.every((result) => result.httpStatus === 200)).toBeTrue()
  } finally {
    server.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("login writes reusable Playwright storage state", async () => {
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response("<html><body>login</body></html>", {
        headers: { "content-type": "text/html", "set-cookie": "session=secret; Path=/" },
      })
    },
  })
  const out = await makeTmpDir()
  try {
    const file = path.join(out, "state.json")
    const result = await runLogin(`http://127.0.0.1:${server.port}/`, {
      outFile: file,
      allowPrivate: true,
      browser: globalThis.__sitesnapSharedBrowser,
      waitForDone: async () => {},
      onLog: () => {},
    })
    expect(result.cookies).toBe(1)
    expect(JSON.parse(await readFile(file, "utf8")).cookies[0].name).toBe("session")
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  } finally {
    server.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("login applies the capture network policy before following navigation", async () => {
  let requestHandler: ((route: unknown) => Promise<void>) | undefined
  const context = {
    route: async (_pattern: string, handler: (route: unknown) => Promise<void>) => { requestHandler = handler },
    routeWebSocket: async () => {},
    newPage: async () => ({
      goto: async () => {
        let aborted = false
        await requestHandler?.({
          request: () => ({ url: () => "http://127.0.0.1/private" }),
          abort: async () => { aborted = true },
          continue: async () => {},
        })
        if (aborted) throw new Error("navigation aborted")
        return null
      },
    }),
    once: () => {},
    storageState: async () => ({ cookies: [], origins: [] }),
    close: async () => {},
  }
  const browser = {
    newContext: async () => context,
    close: async () => {},
  } as unknown as Browser

  await expect(runLogin("https://public.example/login", {
    browser,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    waitForDone: async () => {},
    onLog: () => {},
  })).rejects.toMatchObject({ code: "PRIVATE_URL_BLOCKED" })
})
