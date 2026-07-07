import { test, expect } from "bun:test";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureUrls } from "../src/capture.ts";
import { buildSiteMeta } from "../src/meta.ts";
import { MOBILE_PROFILE_BROAD } from "../src/config.ts";

const PAGE_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>broad-test</title></head><body><p>hello</p></body></html>`;

test(
  "captureUrls --mobile-profile broad: 3端末の出力パスと meta.json mobile_variants",
  async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(PAGE_HTML, { headers: { "content-type": "text/html" } }),
    });
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-broad-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const { siteDir, results } = await captureUrls([url], {
        outDir,
        allowPrivate: true,
        preScroll: "none",
        mobileProfile: "broad",
        onLog: () => {},
      });

      expect(siteDir).toBeTruthy();
      const slug = "index";

      expect(existsSync(path.join(siteDir!, "mobile", `${slug}.png`))).toBeTrue();
      expect(existsSync(path.join(siteDir!, "mobile", "iphone-se-3rd-gen", `${slug}.png`))).toBeTrue();
      expect(existsSync(path.join(siteDir!, "mobile", "pixel-10", `${slug}.png`))).toBeTrue();

      const mobileResults = results.filter((r) => r.mode === "mobile");
      expect(mobileResults).toHaveLength(3);
      expect(mobileResults.map((r) => r.device).sort()).toEqual([...MOBILE_PROFILE_BROAD].sort());

      const paths = mobileResults.map((r) => r.file).sort();
      expect(new Set(paths).size).toBe(3);

      const meta = await buildSiteMeta({
        domain: "127.0.0.1",
        siteDir: siteDir!,
        urls: [url],
        results,
        mobileProfile: "broad",
      });
      const page = meta.pages[0]!;
      expect(page.mobile).toBe(`mobile/${slug}.png`);
      expect(page.mobile_variants).toEqual({
        "iPhone 17": `mobile/${slug}.png`,
        "iPhone SE (3rd gen)": `mobile/iphone-se-3rd-gen/${slug}.png`,
        "Pixel 10": `mobile/pixel-10/${slug}.png`,
      });
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  90000
);

test("buildSiteMeta: 通常モードでは mobile_variants を出さない", async () => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "sitesnap-meta-"));
  try {
    const url = "https://example.com/";
    const slug = "index";
    await mkdtemp(path.join(siteDir, "desktop"));
    await mkdtemp(path.join(siteDir, "mobile"));
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.join(siteDir, "desktop"), { recursive: true });
    await mkdir(path.join(siteDir, "mobile"), { recursive: true });
    await writeFile(path.join(siteDir, "desktop", `${slug}.png`), Buffer.alloc(2048));
    await writeFile(path.join(siteDir, "mobile", `${slug}.png`), Buffer.alloc(2048));

    const meta = await buildSiteMeta({
      domain: "example.com",
      siteDir,
      urls: [url],
    });
    expect(meta.pages[0]!.mobile).toBe(`mobile/${slug}.png`);
    expect(meta.pages[0]!.mobile_variants).toBeUndefined();
  } finally {
    await rm(siteDir, { recursive: true, force: true });
  }
});
