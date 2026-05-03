import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser();

async function fetchXml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return parser.parse(await res.text());
}

export async function expandSitemap(sitemapUrl) {
  const data = await fetchXml(sitemapUrl);

  if (data.sitemapindex) {
    const entries = data.sitemapindex.sitemap;
    const subs = (Array.isArray(entries) ? entries : [entries])
      .map(s => s.loc)
      .filter(Boolean);
    const all = new Set();
    for (const sub of subs) {
      for (const u of await expandSitemap(sub)) all.add(u);
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
