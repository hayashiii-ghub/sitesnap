import { test, expect } from "bun:test";
import { VERSION, USER_AGENT, DEFAULTS } from "../src/config.ts";
import { parseCliArgs } from "../src/cli-args.ts";
import { readFile } from "node:fs/promises";

test("VERSION matches package.json", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  expect(VERSION).toBe(pkg.version);
});

test("USER_AGENT identifies sitesnap with version and homepage", () => {
  expect(USER_AGENT).toMatch(/^sitesnap\/\d+\.\d+\.\d+ \(\+https?:\/\/.+\)$/);
});

test("DEFAULTS exposes maxSitemapDepth and minIntervalMs", () => {
  expect(typeof DEFAULTS.maxSitemapDepth).toBe("number");
  expect(typeof DEFAULTS.minIntervalMs).toBe("number");
});

test("parseCliArgs: rejects invalid numeric flags before command execution", () => {
  expect(() => parseCliArgs(["site", "https://example.com/sitemap.xml", "--limit", "abc"])).toThrow(
    /INVALID_OPTION|--limit/
  );
  expect(() => parseCliArgs(["site", "https://example.com/sitemap.xml", "--concurrency", "0"])).toThrow(
    /INVALID_OPTION|--concurrency/
  );
  expect(() => parseCliArgs(["site", "https://example.com/sitemap.xml", "--min-interval", "-1"])).toThrow(
    /INVALID_OPTION|--min-interval/
  );
  expect(() => parseCliArgs(["site", "https://example.com/sitemap.xml", "--wait-ms", "1.5"])).toThrow(
    /INVALID_OPTION|--wait-ms/
  );
});
