import { test, expect } from "bun:test"
import { writeFile, rm } from "node:fs/promises"
import path from "node:path"
import {
  authContextOptions,
  authFetchHeaders,
  parseHeaderFlag,
  parseHttpCredentials,
  redactAuthOptions,
  resolveStorageStatePath,
} from "../src/auth.ts"
import { parseCliArgs } from "../src/cli-args.ts"
import { SiteSnapError } from "../src/errors.ts"
import { makeTmpDir, cleanupTmpDir } from "./helpers"

const VALID_STATE = JSON.stringify({ cookies: [], origins: [] })

test("parseHeaderFlag: 'Name: value' を分解し、値側の ':' は保持する", () => {
  expect(parseHeaderFlag("Authorization: Bearer a:b:c")).toEqual(["Authorization", "Bearer a:b:c"])
  expect(parseHeaderFlag("X-Token:abc")).toEqual(["X-Token", "abc"])
})

test("parseHeaderFlag: ':' なし・名前/値が空なら INVALID_OPTION", () => {
  for (const bad of ["novalue", ": v", "Name: ", "Name:"]) {
    expect(() => parseHeaderFlag(bad)).toThrow(SiteSnapError)
  }
})

test("parseHttpCredentials: user:pass を分解し、パスワード側の ':' は保持する", () => {
  expect(parseHttpCredentials("user:pa:ss")).toEqual({ username: "user", password: "pa:ss" })
})

test("parseHttpCredentials: 不正な形式は INVALID_OPTION", () => {
  for (const bad of ["nopass", ":pass", "user:"]) {
    expect(() => parseHttpCredentials(bad)).toThrow(SiteSnapError)
  }
})

test("resolveStorageStatePath: 存在しないファイルは STORAGE_STATE_NOT_FOUND", () => {
  try {
    resolveStorageStatePath("/nonexistent/state.json")
    expect.unreachable()
  } catch (e) {
    expect((e as SiteSnapError).code).toBe("STORAGE_STATE_NOT_FOUND")
  }
})

test("resolveStorageStatePath: JSON でない / 形式違いは STORAGE_STATE_INVALID", async () => {
  const dir = await makeTmpDir()
  try {
    const notJson = path.join(dir, "bad.json")
    await writeFile(notJson, "not json")
    const wrongShape = path.join(dir, "wrong.json")
    await writeFile(wrongShape, JSON.stringify({ foo: 1 }))
    for (const f of [notJson, wrongShape]) {
      try {
        resolveStorageStatePath(f)
        expect.unreachable()
      } catch (e) {
        expect((e as SiteSnapError).code).toBe("STORAGE_STATE_INVALID")
      }
    }
  } finally {
    await cleanupTmpDir(dir)
  }
})

test("resolveStorageStatePath: 正しい storage state は絶対パスを返す", async () => {
  const dir = await makeTmpDir()
  try {
    const f = path.join(dir, "state.json")
    await writeFile(f, VALID_STATE)
    expect(resolveStorageStatePath(f)).toBe(f)
  } finally {
    await cleanupTmpDir(dir)
  }
})

test("authContextOptions: 指定されたものだけを newContext オプションに変換する", () => {
  expect(authContextOptions({})).toEqual({})
  expect(
    authContextOptions({
      storageState: "/tmp/s.json",
      headers: { "X-A": "1" },
      httpCredentials: { username: "u", password: "p" },
    })
  ).toEqual({
    storageState: "/tmp/s.json",
    extraHTTPHeaders: { "X-A": "1" },
    httpCredentials: { username: "u", password: "p" },
  })
})

test("authFetchHeaders: httpCredentials を Basic ヘッダに反映し、明示 Authorization は上書きしない", () => {
  const basic = authFetchHeaders({ httpCredentials: { username: "u", password: "p" } }, { "user-agent": "ua" })
  expect(basic["authorization"]).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`)
  expect(basic["user-agent"]).toBe("ua")

  const explicit = authFetchHeaders(
    { headers: { Authorization: "Bearer t" }, httpCredentials: { username: "u", password: "p" } },
    {}
  )
  expect(explicit["Authorization"]).toBe("Bearer t")
  expect(explicit["authorization"]).toBeUndefined()
})

test("redactAuthOptions: ヘッダ値と Basic 認証を伏せ、storage state パスは残す", () => {
  const redacted = redactAuthOptions({
    storageState: "/tmp/s.json",
    headers: { Authorization: "Bearer secret", "X-A": "1" },
    httpCredentials: { username: "u", password: "p" },
  })
  expect(redacted.storageState).toBe("/tmp/s.json")
  expect(redacted.headers).toEqual({ Authorization: "<redacted>", "X-A": "<redacted>" })
  expect(redacted.httpCredentials).toEqual({ username: "<redacted>", password: "<redacted>" })
})

test("parseCliArgs: 認証フラグが captureOptions に入る (--header は繰り返し可)", async () => {
  const dir = await makeTmpDir()
  try {
    const state = path.join(dir, "state.json")
    await writeFile(state, VALID_STATE)
    const ctx = parseCliArgs(
      [
        "shot",
        "https://example.com/",
        "--storage-state",
        state,
        "--header",
        "X-A: 1",
        "--header",
        "X-B: 2",
        "--http-credentials",
        "user:pass",
      ],
      {}
    )
    expect(ctx.captureOptions.storageState).toBe(state)
    expect(ctx.captureOptions.headers).toEqual({ "X-A": "1", "X-B": "2" })
    expect(ctx.captureOptions.httpCredentials).toEqual({ username: "user", password: "pass" })
  } finally {
    await cleanupTmpDir(dir)
  }
})

test("parseCliArgs: SITESNAP_HTTP_CREDENTIALS 環境変数がフォールバックになりフラグが優先される", () => {
  const fromEnv = parseCliArgs(["check", "https://example.com/"], { SITESNAP_HTTP_CREDENTIALS: "eu:ep" })
  expect(fromEnv.captureOptions.httpCredentials).toEqual({ username: "eu", password: "ep" })

  const flagWins = parseCliArgs(
    ["check", "https://example.com/", "--http-credentials", "fu:fp"],
    { SITESNAP_HTTP_CREDENTIALS: "eu:ep" }
  )
  expect(flagWins.captureOptions.httpCredentials).toEqual({ username: "fu", password: "fp" })
})

test("parseCliArgs: login は -o を受け付け、site では従来どおり弾く", () => {
  const ctx = parseCliArgs(["login", "https://example.com/", "-o", "auth.json"], {})
  expect(ctx.sub).toBe("login")
  expect(ctx.outFile).toBe(path.resolve("auth.json"))

  expect(() => parseCliArgs(["site", "https://example.com/sitemap.xml", "-o", "x.png"], {})).toThrow(
    SiteSnapError
  )
})
