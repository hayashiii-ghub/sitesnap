import { test, expect } from "bun:test";
import { slugify, domainOf, captureUrls } from "../src/capture.ts";

test("slugify: simple path", () => {
  expect(slugify("https://example.com/about")).toBe("about");
});

test("slugify: root path becomes index", () => {
  expect(slugify("https://example.com/")).toBe("index");
});

test("slugify: removes consecutive dots to prevent path tricks", () => {
  expect(slugify("https://example.com/..")).toBe("index");
  expect(slugify("https://example.com/../foo")).toBe("foo");
});

test("slugify: strips leading and trailing punctuation", () => {
  expect(slugify("https://example.com/.hidden")).toBe("hidden");
  expect(slugify("https://example.com/foo.")).toBe("foo");
});

test("slugify: replaces unsafe characters with underscore", () => {
  expect(slugify("https://example.com/a/b/path")).toBe("a_b_path");
});

test("slugify: caps length at 120 chars", () => {
  const long = "a".repeat(200);
  const result = slugify(`https://example.com/${long}`);
  expect(result.length).toBeLessThanOrEqual(120);
});

test("domainOf returns hostname", () => {
  expect(domainOf("https://example.com/foo")).toBe("example.com");
});

test("captureUrls: rejects empty URL list with clear error", async () => {
  await expect(captureUrls([], {})).rejects.toThrow(/URLが指定されていません/);
});

test("captureUrls: rejects private URL by default", async () => {
  await expect(captureUrls(["http://localhost/foo"], { dryRun: true })).rejects.toThrow(
    /プライベート|ループバック/
  );
});

test("captureUrls: warns when URLs span multiple hostnames", async () => {
  const warnings: string[] = [];
  const originalErr = console.error;
  console.error = (msg: unknown) => {
    warnings.push(String(msg));
  };
  try {
    await captureUrls(
      ["https://example.com/a", "https://other.com/b"],
      { dryRun: true }
    );
  } finally {
    console.error = originalErr;
  }
  expect(warnings.some((w) => /複数のホスト/.test(w))).toBeTruthy();
});
