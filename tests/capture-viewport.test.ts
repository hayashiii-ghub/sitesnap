import { test, expect } from "bun:test";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureUrls } from "../src/capture.ts";
import { DEFAULTS } from "../src/config.ts";
import { devices } from "playwright";

// meta viewport がないと isMobile の Chromium は 980px フォールバック幅でレイアウトする
const PAGE_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>vp-test</title></head><body><p>hello</p></body></html>`;

// PNG の幅は IHDR チャンク先頭 (offset 16) の big-endian uint32
function pngWidth(buf: Buffer): number {
  return buf.readUInt32BE(16);
}

test(
  "captureUrls: 撮影PNGの実寸が設定ビューポートと一致する (desktop 1440 / mobile iPhone 15)",
  async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(PAGE_HTML, { headers: { "content-type": "text/html" } }),
    });
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-vp-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const { results } = await captureUrls([url], {
        outDir,
        allowPrivate: true,
        preScroll: "none",
        onLog: () => {},
      });

      const desktop = results.find((r) => r.mode === "desktop");
      expect(desktop?.error).toBeUndefined();
      expect(desktop?.file).toBeTruthy();
      expect(pngWidth(await readFile(desktop!.file!))).toBe(
        DEFAULTS.viewports.desktop.width
      );

      const mobile = results.find((r) => r.mode === "mobile");
      expect(mobile?.error).toBeUndefined();
      expect(mobile?.file).toBeTruthy();
      expect(mobile?.device).toBe("iPhone 15");
      const iphone15 = devices["iPhone 15"]!;
      expect(pngWidth(await readFile(mobile!.file!))).toBe(
        iphone15.viewport.width * iphone15.deviceScaleFactor!
      );
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  60000
);
