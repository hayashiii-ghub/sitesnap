import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureShot } from "../src/shot.ts";
import { buildCommands } from "../src/commands.ts";
import type { CliContext } from "../src/cli-args.ts";

// 高さ 3000px のページ。footer は下端の固定サイズ要素
const PAGE_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>shot-test</title></head>
<body style="margin:0">
  <div style="height:2900px">tall content</div>
  <footer style="display:block;width:600px;height:80px">footer content</footer>
</body></html>`;

function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function serve() {
  return Bun.serve({
    port: 0,
    fetch: () => new Response(PAGE_HTML, { headers: { "content-type": "text/html" } }),
  });
}

test(
  "captureShot: デフォルトはビューポートのみ (1440x900) で撮影し絶対パスを返す",
  async () => {
    const server = serve();
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-shot-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await captureShot(url, { outDir, allowPrivate: true });
      expect(path.isAbsolute(r.file)).toBeTrue();
      expect(existsSync(r.file)).toBeTrue();
      // ポート付き localhost は host_port フォルダに分離される
      expect(r.file).toContain(`127.0.0.1_${server.port}${path.sep}shots`);
      expect(pngSize(await readFile(r.file))).toEqual({ width: 1440, height: 900 });
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  60000
);

test(
  "captureShot: --selector は要素だけ撮影する",
  async () => {
    const server = serve();
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-shot-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await captureShot(url, { outDir, allowPrivate: true, selector: "footer" });
      const size = pngSize(await readFile(r.file));
      expect(size).toEqual({ width: 600, height: 80 });
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  60000
);

test(
  "captureShot: --full はページ全体 (高さ > ビューポート) を撮影する",
  async () => {
    const server = serve();
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-shot-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await captureShot(url, { outDir, allowPrivate: true, full: true });
      const size = pngSize(await readFile(r.file));
      expect(size.width).toBe(1440);
      expect(size.height).toBeGreaterThan(2000);
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  60000
);

test(
  "captureShot: 存在しないセレクタは ELEMENT_NOT_FOUND",
  async () => {
    const server = serve();
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-shot-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      await expect(
        captureShot(url, { outDir, allowPrivate: true, selector: "#no-such-element" })
      ).rejects.toThrow(/セレクタに一致する要素がありません/);
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  60000
);

test(
  "shot --json: stdout の JSON に絶対パスとメタ情報が入る",
  async () => {
    const server = serve();
    const outDir = await mkdtemp(path.join(tmpdir(), "sitesnap-shot-"));
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const ctx: CliContext = {
        sub: "shot",
        args: [url],
        json: true,
        strict: false,
        agentTask: false,
        outDir,
        captureOptions: { outDir, allowPrivate: true },
        shotOptions: { vp: { width: 800, height: 600 }, device: null, selector: null, settleMs: null, full: false, props: null },
        limit: null,
        exclude: null,
        minInterval: null,
      };
      const result = await buildCommands().shot!(ctx);
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.success).toBeTrue();
      expect(path.isAbsolute(data.file)).toBeTrue();
      expect(existsSync(data.file)).toBeTrue();
      expect(data.viewport).toEqual({ width: 800, height: 600 });
      expect(data.title).toBe("shot-test");
      expect(data.http_status).toBe(200);
    } finally {
      server.stop();
      await rm(outDir, { recursive: true, force: true });
    }
  },
  60000
);
