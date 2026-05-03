import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULTS } from './config.mjs';
import { slugify } from './capture.mjs';

async function fetchTitle(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return m ? m[1].trim().replace(/\s+/g, ' ') : '';
  } catch {
    return '';
  }
}

export async function buildSiteMeta({ domain, siteDir, urls, source, results }) {
  const metaPath = path.join(siteDir, 'meta.json');

  let prev = { pages: [] };
  try { prev = JSON.parse(await readFile(metaPath, 'utf8')); } catch {}
  const titleByUrl = new Map((prev.pages || []).map(p => [p.url, p.title]));

  const resultByUrlMode = new Map();
  for (const r of results || []) {
    resultByUrlMode.set(`${r.url}|${r.mode}`, r);
  }

  const now = new Date().toISOString();
  const pages = [];
  for (const url of urls) {
    const slug = slugify(url);
    const desktopFile = path.join(siteDir, 'desktop', `${slug}.png`);
    const mobileFile = path.join(siteDir, 'mobile', `${slug}.png`);
    const dResult = resultByUrlMode.get(`${url}|desktop`);
    const mResult = resultByUrlMode.get(`${url}|mobile`);

    let title = titleByUrl.get(url) || '';
    if (dResult?.title) title = dResult.title;
    if (!title) title = await fetchTitle(url);

    pages.push({
      url,
      slug,
      title,
      desktop: existsSync(desktopFile) ? `desktop/${slug}.png` : null,
      mobile: existsSync(mobileFile) ? `mobile/${slug}.png` : null,
      captured_at: now,
      desktop_error: dResult?.error || null,
      mobile_error: mResult?.error || null,
    });
  }

  pages.sort((a, b) => a.url.localeCompare(b.url));

  const meta = {
    domain,
    source: source || prev.source || null,
    captured_at: now,
    pages,
  };

  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

export async function buildIndex() {
  const sitesDir = DEFAULTS.sitesDir;
  if (!existsSync(sitesDir)) return [];
  const entries = await readdir(sitesDir, { withFileTypes: true });
  const sites = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const metaPath = path.join(sitesDir, e.name, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(await readFile(metaPath, 'utf8'));
      const totalPages = (meta.pages || []).length;
      const captured = (meta.pages || []).filter(p => p.desktop || p.mobile).length;
      sites.push({
        domain: meta.domain || e.name,
        source: meta.source || null,
        captured_at: meta.captured_at || null,
        pages: totalPages,
        captured_pages: captured,
      });
    } catch {}
  }
  sites.sort((a, b) => a.domain.localeCompare(b.domain));
  await writeFile(path.join(sitesDir, 'index.json'), JSON.stringify(sites, null, 2));
  return sites;
}
