import { test, expect } from "bun:test";
import { VERSION, USER_AGENT, DEFAULTS } from "../src/config.ts";
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
