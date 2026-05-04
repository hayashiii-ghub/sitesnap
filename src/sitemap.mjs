import { XMLParser } from 'fast-xml-parser';
import { assertPublicUrl } from './url-guard.mjs';
import { USER_AGENT, DEFAULTS } from './config.mjs';

const parser = new XMLParser();

async function fetchXml(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const ct = res.headers.get('content-type') || '';
  if (/text\/html/i.test(ct)) {
    throw new Error(
      `URLがHTMLを返しました（sitemapではありません）: ${url}\n` +
      `ヒント: 単一ページなら 'sitesnap page <url>' を使うか、\n` +
      `実際のsitemap位置を確認してください（/sitemap.xml や /robots.txt 内）。`
    );
  }
  return parser.parse(await res.text());
}

export async function expandSitemap(sitemapUrl, opts = {}) {
  const visited = opts.visited || new Set();
  const depth = opts.depth || 0;
  const maxDepth = opts.maxDepth ?? DEFAULTS.maxSitemapDepth;
  const allowPrivate = opts.allowPrivate || false;

  if (depth > maxDepth) {
    throw new Error(`サイトマップのネストが深すぎます (maxDepth=${maxDepth}): ${sitemapUrl}`);
  }
  if (visited.has(sitemapUrl)) return [];
  visited.add(sitemapUrl);

  assertPublicUrl(sitemapUrl, { allowPrivate });

  const data = await fetchXml(sitemapUrl);

  if (data.sitemapindex) {
    const entries = data.sitemapindex.sitemap;
    const subs = (Array.isArray(entries) ? entries : [entries])
      .map(s => s.loc)
      .filter(Boolean);
    const all = new Set();
    for (const sub of subs) {
      const childOpts = { visited, depth: depth + 1, maxDepth, allowPrivate };
      for (const u of await expandSitemap(sub, childOpts)) all.add(u);
    }
    return [...all].sort();
  }

  if (data.urlset) {
    const entries = data.urlset.url;
    if (!entries) return [];
    return (Array.isArray(entries) ? entries : [entries])
      .map(e => e.loc)
      .filter(Boolean)
      .sort();
  }

  return [];
}
