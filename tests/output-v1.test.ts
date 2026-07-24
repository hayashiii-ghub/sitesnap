import { expect, test } from "bun:test"
import { SiteSnapError } from "../src/errors.ts"
import { formatError } from "../src/output.ts"

test("errors are always machine-readable JSON", () => {
  expect(JSON.parse(formatError(new SiteSnapError("INVALID_URL", "bad", "fix", { url: "ftp://x" })))).toEqual({
    success: false,
    error: { code: "INVALID_URL", message: "bad", hint: "fix", url: "ftp://x" },
  })
  expect(JSON.parse(formatError(new Error("oops"))).error.code).toBe("UNKNOWN_ERROR")
})
