import { test, expect } from "bun:test";
import { inspectUrl } from "../src/inspect.ts";

const PAGE_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>inspect-test</title>
<style>
  body { margin: 0; }
  footer { display: block; width: 600px; height: 80px; color: rgb(255, 0, 0); font-size: 18px; }
  .clipped { width: 100px; height: 40px; overflow: hidden; white-space: nowrap; }
</style></head>
<body>
  <footer>copyright text</footer>
  <div class="clipped">very long unbreakable content that overflows horizontally for sure</div>
</body></html>`;

function serve() {
  return Bun.serve({
    port: 0,
    fetch: () => new Response(PAGE_HTML, { headers: { "content-type": "text/html" } }),
  });
}

test(
  "inspectUrl: boundingBox・computed style・テキストを返す",
  async () => {
    const server = serve();
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await inspectUrl(url, { selector: "footer", allowPrivate: true });
      expect(r.count).toBe(1);
      const el = r.elements[0]!;
      expect(el.box.width).toBe(600);
      expect(el.box.height).toBe(80);
      expect(el.style["color"]).toBe("rgb(255, 0, 0)");
      expect(el.style["font-size"]).toBe("18px");
      expect(el.text).toBe("copyright text");
      expect(el.overflow.x).toBe(0);
      expect(el.overflow.y).toBe(0);
    } finally {
      server.stop();
    }
  },
  60000
);

test(
  "inspectUrl: はみ出し量を overflow.x / overflow.y で返す",
  async () => {
    const server = serve();
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await inspectUrl(url, { selector: ".clipped", allowPrivate: true });
      expect(r.count).toBe(1);
      expect(r.elements[0]!.overflow.x).toBeGreaterThan(0);
    } finally {
      server.stop();
    }
  },
  60000
);

test(
  "inspectUrl: --props で追加プロパティを取れる",
  async () => {
    const server = serve();
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await inspectUrl(url, {
        selector: "footer",
        allowPrivate: true,
        props: ["white-space", "text-align"],
      });
      expect(r.elements[0]!.style["white-space"]).toBe("normal");
      expect(r.elements[0]!.style["text-align"]).toBe("start");
    } finally {
      server.stop();
    }
  },
  60000
);

test(
  "inspectUrl: マッチ 0 件はエラーではなく count: 0 を返す",
  async () => {
    const server = serve();
    try {
      const url = `http://127.0.0.1:${server.port}/`;
      const r = await inspectUrl(url, { selector: "#nope", allowPrivate: true });
      expect(r.count).toBe(0);
      expect(r.elements).toEqual([]);
    } finally {
      server.stop();
    }
  },
  60000
);
