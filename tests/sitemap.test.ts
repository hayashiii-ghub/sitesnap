import { expect, test } from "bun:test"
import { USER_AGENT } from "../src/config.ts"
import { expandSitemap } from "../src/sitemap.ts"
import { FIXTURE_URLSET } from "./helpers.ts"

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }]
const xml = (body: string, init: ResponseInit = {}) => new Response(body, { ...init, headers: { "content-type": "application/xml", ...init.headers } })

test("urlset is parsed, sorted, and sent with the sitesnap user agent", async () => {
  const original = globalThis.fetch
  let headers: HeadersInit | undefined
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    headers = init?.headers
    return xml(FIXTURE_URLSET)
  }) as unknown as typeof fetch
  try {
    expect(await expandSitemap("https://example.com/sitemap.xml", { lookup: publicLookup })).toEqual([
      "https://example.com/",
      "https://example.com/about",
    ])
    expect(new Headers(headers).get("user-agent")).toBe(USER_AGENT)
  } finally {
    globalThis.fetch = original
  }
})

test("auth headers stay on the root origin across recursive sitemaps", async () => {
  const original = globalThis.fetch
  const seen: Array<{ url: string; authorization: string | null }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push({ url, authorization: new Headers(init?.headers).get("authorization") })
    if (url === "https://root.example/sitemap.xml") {
      return xml(`<sitemapindex><sitemap><loc>https://child.example/pages.xml</loc></sitemap></sitemapindex>`)
    }
    return xml(`<urlset><url><loc>https://child.example/page</loc></url></urlset>`)
  }) as unknown as typeof fetch
  try {
    await expandSitemap("https://root.example/sitemap.xml", {
      headers: { Authorization: "Bearer secret" },
      authOrigin: "https://root.example",
      lookup: publicLookup,
    })
    expect(seen).toEqual([
      { url: "https://root.example/sitemap.xml", authorization: "Bearer secret" },
      { url: "https://child.example/pages.xml", authorization: null },
    ])
  } finally {
    globalThis.fetch = original
  }
})

test("manual redirects are revalidated before following", async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private.xml" } })
  }) as unknown as typeof fetch
  try {
    await expect(expandSitemap("https://example.com/sitemap.xml", { lookup: publicLookup })).rejects.toMatchObject({ code: "PRIVATE_URL_BLOCKED" })
    expect(calls).toBe(1)
  } finally {
    globalThis.fetch = original
  }
})

test("HTML and excessive recursion fail with structured errors", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch
  try {
    await expect(expandSitemap("https://example.com/", { lookup: publicLookup })).rejects.toMatchObject({ code: "SITEMAP_NOT_XML" })
  } finally {
    globalThis.fetch = original
  }

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const current = Number(new URL(String(input)).pathname.slice(1, -4))
    return xml(`<sitemapindex><sitemap><loc>https://example.com/${current + 1}.xml</loc></sitemap></sitemapindex>`)
  }) as unknown as typeof fetch
  try {
    await expect(expandSitemap("https://example.com/0.xml", { lookup: publicLookup, maxDepth: 1 })).rejects.toMatchObject({ code: "SITEMAP_TOO_DEEP" })
  } finally {
    globalThis.fetch = original
  }
})
