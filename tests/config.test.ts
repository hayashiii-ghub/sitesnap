import { test, expect } from "bun:test";
import { VERSION, USER_AGENT, DEFAULTS, shotCacheDir } from "../src/config.ts";
import { parseCliArgs } from "../src/cli-args.ts";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

test("shotCacheDir: XDG_CACHE_HOME があればその下の sitesnap", () => {
  expect(shotCacheDir({ XDG_CACHE_HOME: "/xdg/cache" } as NodeJS.ProcessEnv)).toBe("/xdg/cache/sitesnap");
});

test("shotCacheDir: XDG なしは ~/.cache/sitesnap", () => {
  expect(shotCacheDir({} as NodeJS.ProcessEnv)).toBe(path.join(os.homedir(), ".cache", "sitesnap"));
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

test("parseCliArgs: rejects extra positional arguments per subcommand", () => {
  expect(() =>
    parseCliArgs(["page", "https://example.com/about", "extra"])
  ).toThrow(/INVALID_OPTION|引数が多すぎます/);
  expect(() =>
    parseCliArgs(["list", "extra"])
  ).toThrow(/INVALID_OPTION|引数が多すぎます/);
});

test("parseCliArgs: --min-interval で rateLimiter を一度だけ生成し site/retry が共有する", () => {
  // 未指定なら undefined (レート制限なし)
  expect(parseCliArgs(["site", "https://example.com/sitemap.xml"]).rateLimiter).toBeUndefined();
  expect(parseCliArgs(["retry", "example.com"]).rateLimiter).toBeUndefined();
  // 指定すると ctx.rateLimiter が生成される。site と retry は同じ ctx.rateLimiter を
  // 渡すので、retry も --min-interval を尊重する (以前は retry が無視していた)
  const ctx = parseCliArgs(["retry", "example.com", "--min-interval", "250"]);
  expect(ctx.minInterval).toBe(250);
  expect(typeof ctx.rateLimiter?.wait).toBe("function");
});
