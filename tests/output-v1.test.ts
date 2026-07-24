import { expect, test } from "bun:test"
import { SiteSnapError } from "../src/errors.ts"
import { formatError, formatSuccess } from "../src/output.ts"

test("success and error output are always machine-readable JSON", () => {
  expect(JSON.parse(formatSuccess({ command: "list" }))).toEqual({ success: true, command: "list" })
  expect(JSON.parse(formatError(new SiteSnapError("INVALID_URL", "bad", "fix", { url: "ftp://x" })))).toEqual({
    success: false,
    error: { code: "INVALID_URL", message: "bad", hint: "fix", url: "ftp://x" },
  })
  expect(JSON.parse(formatError(new Error("oops"))).error.code).toBe("UNKNOWN_ERROR")
})
