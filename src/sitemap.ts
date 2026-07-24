import { XMLParser } from "fast-xml-parser"
import { DEFAULTS, USER_AGENT } from "./config.ts"
import { SiteSnapError } from "./errors.ts"
import { assertPublicUrl, assertPublicUrlResolved, type HostLookup } from "./url-guard.ts"

const parser = new XMLParser()

interface FetchXmlOptions {
  allowPrivate?: boolean
  headers?: Record<string, string>
  authOrigin?: string
  lookup?: HostLookup
  fetchTimeoutMs?: number
}

async function fetchXml(url: string, opts: FetchXmlOptions): Promise<unknown> {
  let current = url
  let response: Response | undefined
  for (let redirects = 0; redirects <= 10; redirects += 1) {
    await assertPublicUrlResolved(current, opts)
    const scopedHeaders = !opts.authOrigin || new URL(current).origin === opts.authOrigin ? opts.headers : undefined
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, ...(scopedHeaders ?? {}) },
        signal: AbortSignal.timeout(opts.fetchTimeoutMs ?? DEFAULTS.navigationTimeout),
      })
    } catch (error) {
      throw new SiteSnapError("SITEMAP_FETCH_FAILED", `sitemapの取得に失敗しました: ${(error as Error).message}`, "URLとネットワーク接続を確認してください。", { url: current })
    }
    if (response.status < 300 || response.status >= 400) break
    const location = response.headers.get("location")
    if (!location) break
    current = new URL(location, current).href
  }

  if (!response || (response.status >= 300 && response.status < 400)) {
    throw new SiteSnapError("SITEMAP_FETCH_FAILED", `sitemapのredirectが多すぎます: ${url}`, "redirect設定を確認してください。", { url })
  }
  if (!response.ok) {
    throw new SiteSnapError("SITEMAP_FETCH_FAILED", `sitemapの取得に失敗しました: ${response.status} ${current}`, "URLとネットワーク接続を確認してください。", { url: current, status: response.status })
  }
  if (/text\/html/i.test(response.headers.get("content-type") ?? "")) {
    throw new SiteSnapError("SITEMAP_NOT_XML", `URLがHTMLを返しました: ${current}`, "単一ページはsitesnap capture <url>を使用してください。", { url: current })
  }
  try {
    return parser.parse(await response.text())
  } catch (error) {
    throw new SiteSnapError("SITEMAP_PARSE_FAILED", `sitemap XMLの解析に失敗しました: ${(error as Error).message}`, "XML構文を確認してください。", { url: current })
  }
}

export interface ExpandSitemapOptions {
  visited?: Set<string>
  depth?: number
  maxDepth?: number
  allowPrivate?: boolean
  headers?: Record<string, string>
  authOrigin?: string
  lookup?: HostLookup
  fetchTimeoutMs?: number
}

interface SitemapIndexEntry { loc?: string }
interface UrlsetEntry { loc?: string }
interface ParsedSitemap {
  sitemapindex?: { sitemap: SitemapIndexEntry | SitemapIndexEntry[] }
  urlset?: { url: UrlsetEntry | UrlsetEntry[] }
}

export async function expandSitemap(sitemapUrl: string, opts: ExpandSitemapOptions = {}): Promise<string[]> {
  assertPublicUrl(sitemapUrl, opts)
  const visited = opts.visited ?? new Set<string>()
  const depth = opts.depth ?? 0
  const maxDepth = opts.maxDepth ?? DEFAULTS.maxSitemapDepth
  if (depth > maxDepth) {
    throw new SiteSnapError("SITEMAP_TOO_DEEP", `sitemapのネストが深すぎます: ${sitemapUrl}`, "maxDepthを確認してください。", { url: sitemapUrl, depth })
  }
  if (visited.has(sitemapUrl)) return []
  visited.add(sitemapUrl)

  const authOrigin = opts.authOrigin ?? new URL(sitemapUrl).origin
  const data = (await fetchXml(sitemapUrl, { ...opts, authOrigin })) as ParsedSitemap
  if (data.sitemapindex) {
    const entries = Array.isArray(data.sitemapindex.sitemap) ? data.sitemapindex.sitemap : [data.sitemapindex.sitemap]
    const urls = new Set<string>()
    for (const child of entries.map((entry) => entry.loc).filter((value): value is string => Boolean(value))) {
      for (const url of await expandSitemap(child, { ...opts, visited, depth: depth + 1, maxDepth, authOrigin })) urls.add(url)
    }
    return [...urls].sort()
  }
  if (!data.urlset?.url) return []
  const entries = Array.isArray(data.urlset.url) ? data.urlset.url : [data.urlset.url]
  return entries.map((entry) => entry.loc).filter((value): value is string => Boolean(value)).sort()
}
