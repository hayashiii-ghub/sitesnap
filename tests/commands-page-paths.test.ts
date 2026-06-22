import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCommands } from "../src/commands.ts";
import type { CliContext } from "../src/cli-args.ts";

const PAGE_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>paths-test</title></head><body><p>hello</p></body></html>`;

test(
  "page --json: 画像の絶対パスを desktop_path / mobile_path で返す",
  async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(PAGE_HTML, { headers: { "content-type": "text/html" } }),
    });
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-paths-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const ctx: CliContext = {
        sub: "page",
        args: [url],
        json: true,
        strict: false,
        agentTask: false,
        outDir,
        outDirExplicit: true,
        outFile: null,
        captureOptions: { outDir, allowPrivate: true, preScroll: "none" },
        shotOptions: { vp: null, device: null, selector: null, settleMs: null, full: false, props: null, label: null, clicks: [], evalJs: null },
        limit: null,
        exclude: null,
        minInterval: null,
        dryRun: false,
        olderThan: null,
        shots: false,
      };
      const result = await buildCommands().page!(ctx);
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(path.isAbsolute(data.desktop_path)).toBeTrue();
      expect(path.isAbsolute(data.mobile_path)).toBeTrue();
      expect(existsSync(data.desktop_path)).toBeTrue();
      expect(existsSync(data.mobile_path)).toBeTrue();
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  60000
);
