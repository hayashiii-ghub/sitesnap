import { test, expect } from "bun:test"
import { readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { checkUrl } from "../src/check.ts"
import { runLogin } from "../src/login.ts"
import { captureShot } from "../src/shot.ts"
import { makeTmpDir, cleanupTmpDir } from "./helpers"

const OK_HTML = (title: string) =>
  `<!doctype html><html><head><title>${title}</title></head><body><main>ok</main></body></html>`

// 認証パターン別のエンドポイントを持つテストサーバ。
// 未知パスは 204 を返し、check の failed_requests を汚さない
function serveAuth() {
  return Bun.serve({
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/cookie") {
        const cookie = req.headers.get("cookie") || ""
        if (!cookie.includes("session=s3cret")) return new Response("unauthorized", { status: 401 })
        return new Response(OK_HTML("cookie-ok"), { headers: { "content-type": "text/html" } })
      }
      if (url.pathname === "/bearer") {
        if (req.headers.get("authorization") !== "Bearer tok123")
          return new Response("unauthorized", { status: 401 })
        return new Response(OK_HTML("bearer-ok"), { headers: { "content-type": "text/html" } })
      }
      if (url.pathname === "/basic") {
        const expected = `Basic ${Buffer.from("user:pass").toString("base64")}`
        if (req.headers.get("authorization") !== expected) {
          return new Response("unauthorized", {
            status: 401,
            headers: { "www-authenticate": 'Basic realm="test"' },
          })
        }
        return new Response(OK_HTML("basic-ok"), { headers: { "content-type": "text/html" } })
      }
      if (url.pathname === "/login") {
        return new Response(OK_HTML("login-page"), {
          headers: {
            "content-type": "text/html",
            "set-cookie": "session=s3cret; Path=/",
          },
        })
      }
      return new Response(null, { status: 204 })
    },
  })
}

function storageStateWithCookie(host: string): string {
  return JSON.stringify({
    cookies: [
      {
        name: "session",
        value: "s3cret",
        domain: host,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  })
}

test(
  "captureShot: --storage-state の cookie で保護ページが撮れる (無しだと 401)",
  async () => {
    const server = serveAuth()
    const dir = await makeTmpDir()
    try {
      const url = `http://127.0.0.1:${server.port}/cookie`
      const without = await captureShot(url, { outDir: dir, allowPrivate: true })
      expect(without.http_status).toBe(401)

      const stateFile = path.join(dir, "state.json")
      await writeFile(stateFile, storageStateWithCookie("127.0.0.1"))
      const withState = await captureShot(url, {
        outDir: dir,
        allowPrivate: true,
        storageState: stateFile,
        label: "authed",
      })
      expect(withState.http_status).toBe(200)
      expect(withState.title).toBe("cookie-ok")
    } finally {
      server.stop()
      await cleanupTmpDir(dir)
    }
  },
  60000
)

test(
  "captureShot: --header の Bearer トークンが全リクエストに付く",
  async () => {
    const server = serveAuth()
    const dir = await makeTmpDir()
    try {
      const url = `http://127.0.0.1:${server.port}/bearer`
      const r = await captureShot(url, {
        outDir: dir,
        allowPrivate: true,
        headers: { Authorization: "Bearer tok123" },
      })
      expect(r.http_status).toBe(200)
      expect(r.title).toBe("bearer-ok")
    } finally {
      server.stop()
      await cleanupTmpDir(dir)
    }
  },
  60000
)

test(
  "checkUrl: --http-credentials で Basic 認証を通過し、check が pass する",
  async () => {
    const server = serveAuth()
    try {
      const url = `http://127.0.0.1:${server.port}/basic`
      const r = await checkUrl(url, {
        allowPrivate: true,
        httpCredentials: { username: "user", password: "pass" },
      })
      expect(r.http_status).toBe(200)
      expect(r.checks.failed_requests.pass).toBeTrue()
      expect(r.title).toBe("basic-ok")
    } finally {
      server.stop()
    }
  },
  60000
)

test(
  "runLogin: ログイン後の storage state を保存し、そのまま撮影に使える",
  async () => {
    const server = serveAuth()
    const dir = await makeTmpDir()
    try {
      const stateFile = path.join(dir, "login-state.json")
      const result = await runLogin(`http://127.0.0.1:${server.port}/login`, {
        outFile: stateFile,
        allowPrivate: true,
        browser: globalThis.__sitesnapSharedBrowser,
        // テストでは Enter の代わりに即時完了 (ページ表示 = Set-Cookie 受領済み)
        waitForDone: async () => {},
        onLog: () => {},
      })
      expect(result.file).toBe(stateFile)
      expect(result.cookies).toBe(1)

      const saved = JSON.parse(await readFile(stateFile, "utf8"))
      expect(saved.cookies[0].name).toBe("session")

      const shot = await captureShot(`http://127.0.0.1:${server.port}/cookie`, {
        outDir: dir,
        allowPrivate: true,
        storageState: stateFile,
      })
      expect(shot.http_status).toBe(200)
      expect(shot.title).toBe("cookie-ok")
    } finally {
      server.stop()
      await cleanupTmpDir(dir)
    }
  },
  60000
)
