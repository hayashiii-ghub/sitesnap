import { test, expect } from "bun:test"
import { formatSuccess, formatError } from "../src/output"
import { SiteSnapError } from "../src/errors"

test("formatSuccess: JSON 形式で成功結果を返す", () => {
  const data = { command: "page", url: "https://example.com", saved_files: ["a.png"] }
  const json = formatSuccess(data, "json")
  expect(JSON.parse(json)).toEqual({ success: true, ...data })
})

test("formatSuccess: text 形式で人間可読な結果を返す", () => {
  const data = { command: "page", url: "https://example.com", saved_files: ["a.png", "b.png"] }
  const text = formatSuccess(data, "text")
  expect(text).toContain("https://example.com")
  expect(text).toContain("a.png")
  expect(text).toContain("b.png")
})

test("formatError: SiteSnapError を JSON 構造で返す", () => {
  const err = new SiteSnapError("INVALID_URL", "msg", "hint", { url: "ftp://x" })
  const json = formatError(err, "json")
  expect(JSON.parse(json)).toEqual({
    success: false,
    error: { code: "INVALID_URL", message: "msg", hint: "hint", url: "ftp://x" },
  })
})

test("formatError: 通常 Error を UNKNOWN_ERROR として返す", () => {
  const err = new Error("oops")
  const json = formatError(err, "json")
  const parsed = JSON.parse(json)
  expect(parsed.success).toBe(false)
  expect(parsed.error.code).toBe("UNKNOWN_ERROR")
  expect(parsed.error.message).toBe("oops")
})
