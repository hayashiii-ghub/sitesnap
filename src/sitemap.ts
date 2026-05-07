import { XMLParser } from "fast-xml-parser"
import { assertPublicUrl } from "./url-guard.ts"
import { USER_AGENT, DEFAULTS } from "./config.ts"
import { SiteSnapError } from "./errors.ts"

const parser = new XMLParser()

async function fetchXml(url: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { headers: { "user-agent": USER_AGENT } })
  } catch (err) {
    throw new SiteSnapError(
      "SITEMAP_FETCH_FAILED",
      `sitemap の取得に失敗しました: ${(err as Error).message}`,
      "URL を確認、またはネットワーク接続を確認してください。",
      { url }
    )
  }
  if (!res.ok) {
    throw new SiteSnapError(
      "SITEMAP_FETCH_FAILED",
      `sitemap の取得に失敗しました: ${res.status} ${url}`,
      "URL を確認、またはネットワーク接続を確認してください。",
      { url, status: res.status }
    )
  }
  const ct = res.headers.get("content-type") || ""
  if (/text\/html/i.test(ct)) {
    throw new SiteSnapError(
      "SITEMAP_NOT_XML",
      `URLがHTMLを返しました（sitemapではありません）: ${url}`,
      "単一ページなら 'sitesnap page <url>' を使うか、実際の sitemap 位置を確認してください（/sitemap.xml や /robots.txt 内）。",
      { url }
    )
  }
  try {
    return parser.parse(await res.text())
  } catch (err) {
    throw new SiteSnapError(
      "SITEMAP_PARSE_FAILED",
      `sitemap XML の解析に失敗しました: ${(err as Error).message}`,
      "sitemap XML の構文を確認してください。",
      { url }
    )
  }
}

export interface ExpandSitemapOptions {
  visited?: Set<string>
  depth?: number
  maxDepth?: number
  allowPrivate?: boolean
}

interface SitemapIndexEntry {
  loc?: string
}
interface UrlsetEntry {
  loc?: string
}
interface ParsedSitemap {
  sitemapindex?: { sitemap: SitemapIndexEntry | SitemapIndexEntry[] }
  urlset?: { url: UrlsetEntry | UrlsetEntry[] }
}

export async function expandSitemap(
  sitemapUrl: string,
  opts: ExpandSitemapOptions = {}
): Promise<string[]> {
  const visited = opts.visited || new Set<string>()
  const depth = opts.depth || 0
  const maxDepth = opts.maxDepth ?? DEFAULTS.maxSitemapDepth
  const allowPrivate = opts.allowPrivate || false

  if (depth > maxDepth) {
    throw new SiteSnapError(
      "SITEMAP_TOO_DEEP",
      `サイトマップのネストが深すぎます (maxDepth=${maxDepth}): ${sitemapUrl}`,
      "maxDepth オプションで上限を引き上げるか、再帰的な sitemap を確認してください。",
      { url: sitemapUrl, depth: maxDepth }
    )
  }
  if (visited.has(sitemapUrl)) return []
  visited.add(sitemapUrl)

  assertPublicUrl(sitemapUrl, { allowPrivate })

  const data = (await fetchXml(sitemapUrl)) as ParsedSitemap

  if (data.sitemapindex) {
    const entries = data.sitemapindex.sitemap
    const subs = (Array.isArray(entries) ? entries : [entries])
      .map((s) => s.loc)
      .filter((loc): loc is string => Boolean(loc))
    const all = new Set<string>()
    for (const sub of subs) {
      const childOpts: ExpandSitemapOptions = {
        visited,
        depth: depth + 1,
        maxDepth,
        allowPrivate,
      }
      for (const u of await expandSitemap(sub, childOpts)) all.add(u)
    }
    return [...all].sort()
  }

  if (data.urlset) {
    const entries = data.urlset.url
    if (!entries) return []
    return (Array.isArray(entries) ? entries : [entries])
      .map((e) => e.loc)
      .filter((loc): loc is string => Boolean(loc))
      .sort()
  }

  return []
}
