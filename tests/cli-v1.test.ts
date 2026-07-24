import { expect, test } from "bun:test"
import path from "node:path"
import { HELP, parseCliArgs } from "../src/cli-args.ts"
import { DEFAULTS, USER_AGENT, VERSION } from "../src/config.ts"
import { SiteSnapError } from "../src/errors.ts"

test("published identity and help describe collection-only v1", () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+/)
  expect(USER_AGENT).toContain(`sitesnap/${VERSION}`)
  expect(DEFAULTS.viewports.mobile).toBe("iPhone 15")
  expect(HELP).toContain("sitesnap capture")
  for (const removed of ["sitesnap shot", "sitesnap check", "sitesnap inspect", "sitesnap doctor", "sitesnap clean"]) {
    expect(HELP).not.toContain(removed)
  }
})

test("capture parser produces deterministic collection options", () => {
  const context = parseCliArgs([
    "capture", "--sitemap", "https://example.com/sitemap.xml", "--out", "archive",
    "--limit", "10", "--exclude", "draft", "--concurrency", "2", "--min-interval", "50",
    "--wait-ms", "100", "--pre-scroll", "none", "--force-visible",
  ], {})
  expect(context.json).toBeTrue()
  expect(context.outDir).toBe(path.resolve("archive"))
  expect(context.sitemap).toBe("https://example.com/sitemap.xml")
  expect(context.limit).toBe(10)
  expect(context.exclude?.test("draft")).toBeTrue()
  expect(context.captureOptions).toMatchObject({ concurrency: 2, waitMs: 100, preScroll: "none", forceVisible: true })
  expect(context.rateLimiter?.wait).toBeFunction()
})

test("parser rejects removed commands, misplaced flags, invalid numbers, and extra args", () => {
  for (const command of ["site", "page", "shot", "check", "inspect", "doctor", "clean", "open"]) {
    expect(() => parseCliArgs([command, "https://example.com"])).toThrow(SiteSnapError)
  }
  expect(() => parseCliArgs(["list", "--limit", "1"])).toThrow(SiteSnapError)
  expect(() => parseCliArgs(["capture", "https://example.com", "--concurrency", "0"])).toThrow(SiteSnapError)
  expect(() => parseCliArgs(["capture", "https://example.com", "extra"])).toThrow(SiteSnapError)
})

test("login accepts only its URL, output file, and private opt-in", () => {
  const context = parseCliArgs(["login", "http://localhost:3000", "--allow-private", "-o", "auth.json"], {})
  expect(context.outFile).toBe(path.resolve("auth.json"))
  expect(context.captureOptions.allowPrivate).toBeTrue()
  expect(() => parseCliArgs(["login", "https://example.com", "--header", "X: y"])).toThrow(SiteSnapError)
})
