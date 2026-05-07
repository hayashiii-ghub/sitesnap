import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function makeTmpDir(prefix = 'sitesnap-test-') {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanupTmpDir(dir: string) {
  await rm(dir, { recursive: true, force: true });
}

export const FIXTURE_URLSET = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;

export const FIXTURE_SITEMAPINDEX = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;

export const FIXTURE_CYCLIC_INDEX = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-cycle.xml</loc></sitemap>
</sitemapindex>`;
