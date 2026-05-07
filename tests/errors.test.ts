import { test, expect } from "bun:test"
import { SiteSnapError } from "../src/errors"

test("SiteSnapError は code, message, hint, context を保持する", () => {
  const err = new SiteSnapError(
    "INVALID_URL",
    "URLの形式が不正です",
    "http:// または https:// で始まる URL を指定してください",
    { url: "ftp://example.com" }
  )
  expect(err.code).toBe("INVALID_URL")
  expect(err.message).toBe("URLの形式が不正です")
  expect(err.hint).toBe("http:// または https:// で始まる URL を指定してください")
  expect(err.context).toEqual({ url: "ftp://example.com" })
})

test("SiteSnapError は Error のインスタンス", () => {
  const err = new SiteSnapError("SITEMAP_FETCH_FAILED", "msg", "hint")
  expect(err).toBeInstanceOf(Error)
})

test("SiteSnapError.toJSON() は構造化データを返す", () => {
  const err = new SiteSnapError(
    "PRIVATE_URL_BLOCKED",
    "プライベートURLは許可されていません",
    "--allow-private を付けてください",
    { url: "http://localhost" }
  )
  expect(err.toJSON()).toEqual({
    code: "PRIVATE_URL_BLOCKED",
    message: "プライベートURLは許可されていません",
    hint: "--allow-private を付けてください",
    url: "http://localhost",
  })
})

test("context が空の場合 toJSON に余計なキーは含まれない", () => {
  const err = new SiteSnapError("BROWSER_LAUNCH_FAILED", "msg", "hint")
  expect(err.toJSON()).toEqual({
    code: "BROWSER_LAUNCH_FAILED",
    message: "msg",
    hint: "hint",
  })
})
