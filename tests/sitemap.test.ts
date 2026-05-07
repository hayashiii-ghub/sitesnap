import { test, expect, mock } from "bun:test";
import { expandSitemap } from "../src/sitemap.ts";
import { USER_AGENT } from "../src/config.ts";
import { FIXTURE_URLSET } from "./helpers.ts";

type FetchCall = { url: unknown; opts: unknown };

function mockFetchSequence(responses: Record<string, string>) {
  const calls: FetchCall[] = [];
  const fn = mock(async (url: unknown, opts: unknown) => {
    calls.push({ url, opts });
    const body = responses[url as string];
    if (body === undefined) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: true,
      status: 200,
      headers: {
        get: (k: string) => (k.toLowerCase() === "content-type" ? "application/xml" : null),
      },
      text: async () => body,
    };
  });
  return { fn, calls };
}

test("expandSitemap: rejects private host", async () => {
  await expect(expandSitemap("http://localhost/sitemap.xml")).rejects.toThrow(
    /プライベート|ループバック/
  );
});

test("expandSitemap: rejects non-http protocol", async () => {
  await expect(expandSitemap("file:///tmp/sitemap.xml")).rejects.toThrow(/プロトコル/);
});

test("expandSitemap: parses urlset and sends User-Agent", async () => {
  const { fn, calls } = mockFetchSequence({
    "https://example.com/sitemap.xml": FIXTURE_URLSET,
  });
  const original = globalThis.fetch;
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  try {
    const urls = await expandSitemap("https://example.com/sitemap.xml");
    expect(urls).toEqual(["https://example.com/", "https://example.com/about"]);
    const opts = calls[0]?.opts as { headers?: Record<string, string> } | undefined;
    expect(opts?.headers?.["user-agent"]).toBe(USER_AGENT);
  } finally {
    globalThis.fetch = original;
  }
});

test("expandSitemap: silently skips cyclic sitemap references", async () => {
  const cyclic = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/a.xml</loc></sitemap>
</sitemapindex>`;
  const { fn } = mockFetchSequence({
    "https://example.com/a.xml": cyclic,
  });
  const original = globalThis.fetch;
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  try {
    const urls = await expandSitemap("https://example.com/a.xml");
    expect(urls).toEqual([]);
  } finally {
    globalThis.fetch = original;
  }
});

test("expandSitemap: throws when nesting exceeds maxDepth", async () => {
  const indexFor = (next: string) => `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${next}</loc></sitemap>
</sitemapindex>`;
  const { fn } = mockFetchSequence({
    "https://example.com/0.xml": indexFor("https://example.com/1.xml"),
    "https://example.com/1.xml": indexFor("https://example.com/2.xml"),
    "https://example.com/2.xml": indexFor("https://example.com/3.xml"),
  });
  const original = globalThis.fetch;
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  try {
    await expect(
      expandSitemap("https://example.com/0.xml", { maxDepth: 2 })
    ).rejects.toThrow(/ネスト|maxDepth/);
  } finally {
    globalThis.fetch = original;
  }
});

test("expandSitemap: rejects HTML response with helpful Japanese error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null,
    },
    text: async () => "<html><body><h1>Hello</h1></body></html>",
  })) as unknown as typeof globalThis.fetch;
  try {
    await expect(expandSitemap("https://tsukurikae.jp/")).rejects.toThrow(
      /HTML|sitemapではありません/
    );
  } finally {
    globalThis.fetch = original;
  }
});
