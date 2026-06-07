import { test, expect } from "bun:test";
import {
  slugify,
  domainOf,
  captureUrls,
  formatCrossHostWarning,
  resolveCaptureTarget,
} from "../src/capture.ts";

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

test("resolveCaptureTarget: validates URLs and builds target paths", () => {
  expect(
    resolveCaptureTarget(
      ["https://example.com/a", "https://other.com/b", "https://third.com/c"],
      { outDir: "/tmp/sitesnap-out" }
    )
  ).toEqual({
    domain: "example.com",
    siteDir: "/tmp/sitesnap-out/example.com",
    otherHosts: ["other.com", "third.com"],
  });
});

test("resolveCaptureTarget: dry run has no output directory", () => {
  expect(resolveCaptureTarget(["https://example.com/a"], { dryRun: true }).siteDir).toBeNull();
});

test("formatCrossHostWarning: summarizes extra hostnames", () => {
  expect(
    formatCrossHostWarning("example.com", ["a.example", "b.example", "c.example", "d.example"])
  ).toContain("a.example, b.example, c.example (+1)");
});

test("captureUrls: reports cross-host warning through onLog", async () => {
  const warnings: string[] = [];
  await captureUrls(
    ["https://example.com/a", "https://other.com/b"],
    {
      dryRun: true,
      onLog: (msg) => warnings.push(msg),
    }
  );
  expect(warnings.some((w) => /複数のホスト/.test(w))).toBeTruthy();
});
