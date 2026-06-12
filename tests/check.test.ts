import { test, expect } from "bun:test";
import { checkUrl } from "../src/check.ts";

// 横はみ出し + console.error + 404 リクエスト + alt なし画像 (axe: image-alt) を全部持つページ
const BAD_HTML = `<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>bad-page</title></head>
<body style="margin:0">
  <div style="width:2000px;height:10px">wide</div>
  <img src="/exists.png" width="10" height="10">
  <img src="/missing.png" alt="404 image" width="10" height="10">
  <script>console.error("boom from page");</script>
</body></html>`;

const CLEAN_HTML = `<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>clean-page</title></head>
<body style="margin:0"><main><h1>hello</h1></main></body></html>`;

// 1x1 transparent PNG
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

function serve(html: string) {
  return Bun.serve({
    port: 0,
    fetch: (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/exists.png") {
        return new Response(PNG_1X1, { headers: { "content-type": "image/png" } });
      }
      if (path === "/missing.png") {
        return new Response("not found", { status: 404 });
      }
      return new Response(html, { headers: { "content-type": "text/html" } });
    },
  });
}

test(
  "checkUrl: 問題ページで4チェックすべて検出する",
  async () => {
    const server = serve(BAD_HTML);
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await checkUrl(url, { allowPrivate: true });

      expect(r.pass).toBeFalse();

      expect(r.checks.overflow.pass).toBeFalse();
      expect(r.checks.overflow.amount).toBeGreaterThan(0);
      expect(r.checks.overflow.offenders.length).toBeGreaterThan(0);

      expect(r.checks.console_errors.pass).toBeFalse();
      expect(r.checks.console_errors.messages.some((m) => m.includes("boom from page"))).toBeTrue();

      expect(r.checks.failed_requests.pass).toBeFalse();
      expect(
        r.checks.failed_requests.requests.some((q) => q.url.endsWith("/missing.png") && q.status === 404)
      ).toBeTrue();

      expect(r.checks.a11y.pass).toBeFalse();
      expect(r.checks.a11y.violations.some((v) => v.id === "image-alt")).toBeTrue();
    } finally {
      server.stop();
    }
  },
  60000
);

test(
  "checkUrl: クリーンなページは全チェック pass する",
  async () => {
    const server = serve(CLEAN_HTML);
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await checkUrl(url, { allowPrivate: true });
      expect(r.checks.overflow.pass).toBeTrue();
      expect(r.checks.console_errors.pass).toBeTrue();
      expect(r.checks.failed_requests.pass).toBeTrue();
      expect(r.checks.a11y.pass).toBeTrue();
      expect(r.pass).toBeTrue();
    } finally {
      server.stop();
    }
  },
  60000
);
