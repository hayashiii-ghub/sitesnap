import { expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
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
import { cleanupTmpDir, makeTmpDir } from "./helpers.ts"

test("header parser preserves colons but never echoes an invalid secret", () => {
  expect(parseHeaderFlag("Authorization: Bearer a:b")).toEqual(["Authorization", "Bearer a:b"])
  const secret = "super-secret-value"
  try {
    parseHeaderFlag(secret)
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(SiteSnapError)
    expect((error as Error).message).not.toContain(secret)
  }
})

test("HTTP credentials preserve colons in password and reject malformed values", () => {
  expect(parseHttpCredentials("user:pa:ss")).toEqual({ username: "user", password: "pa:ss" })
  for (const invalid of ["none", ":pass", "user:"]) expect(() => parseHttpCredentials(invalid)).toThrow(SiteSnapError)
})

test("storage state validation returns absolute path and rejects bad files", async () => {
  const dir = await makeTmpDir()
  try {
    const valid = path.join(dir, "state.json")
    await writeFile(valid, JSON.stringify({ cookies: [], origins: [] }))
    expect(resolveStorageStatePath(valid)).toBe(valid)
    const invalid = path.join(dir, "invalid.json")
    await writeFile(invalid, "{}")
    expect(() => resolveStorageStatePath(invalid)).toThrow(SiteSnapError)
  } finally {
    await cleanupTmpDir(dir)
  }
})

test("auth context scopes Basic credentials to the requested origin", () => {
  expect(authContextOptions({ httpCredentials: { username: "u", password: "p" } }, "https://example.com")).toEqual({
    httpCredentials: { username: "u", password: "p", origin: "https://example.com" },
  })
})

test("fetch auth uses explicit Authorization and redaction removes values", () => {
  const options = { headers: { Authorization: "Bearer secret" }, httpCredentials: { username: "u", password: "p" } }
  expect(authFetchHeaders(options, {}).Authorization).toBe("Bearer secret")
  expect(redactAuthOptions(options)).toEqual({
    headers: { Authorization: "<redacted>" },
    httpCredentials: { username: "<redacted>", password: "<redacted>" },
  })
})

test("capture/retry accept auth flags; list ignores credential environment", () => {
  const capture = parseCliArgs(["capture", "https://example.com", "--header", "X-A: 1", "--http-credentials", "u:p"], {})
  expect(capture.captureOptions.headers).toEqual({ "X-A": "1" })
  expect(capture.captureOptions.httpCredentials).toEqual({ username: "u", password: "p" })
  const retry = parseCliArgs(["retry", "example.com"], { SITESNAP_HTTP_CREDENTIALS: "e:p" })
  expect(retry.captureOptions.httpCredentials).toEqual({ username: "e", password: "p" })
  expect(parseCliArgs(["list"], { SITESNAP_HTTP_CREDENTIALS: "bad" }).captureOptions.httpCredentials).toBeUndefined()
})
