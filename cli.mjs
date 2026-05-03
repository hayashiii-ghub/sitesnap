#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { expandSitemap } from './src/sitemap.mjs';
import { captureUrls } from './src/capture.mjs';
import { buildSiteMeta, buildIndex } from './src/meta.mjs';
import { DEFAULTS } from './src/config.mjs';

const HELP = `
web-portfolio — capture website screenshots for portfolio reference

Usage:
  node cli.mjs site <sitemap-url>     Capture all URLs from a sitemap
  node cli.mjs page <url>              Capture a single page
  node cli.mjs list                    List captured sites
  node cli.mjs view [--port 3000]      Start local viewer server
  node cli.mjs retry <domain>          Re-capture failed/missing pages
  node cli.mjs help                    Show this help

Examples:
  node cli.mjs site https://example.com/sitemap.xml
  node cli.mjs page https://example.com/about
  node cli.mjs view
`;

const sub = process.argv[2];
const args = process.argv.slice(3);

async function readMeta(domain) {
  const p = path.join(DEFAULTS.sitesDir, domain, 'meta.json');
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, 'utf8'));
}

async function cmdSite() {
  const sitemapUrl = args[0];
  if (!sitemapUrl) { console.error('Usage: node cli.mjs site <sitemap-url>'); process.exit(1); }
  console.log(`Expanding sitemap: ${sitemapUrl}`);
  const urls = await expandSitemap(sitemapUrl);
  console.log(`Found ${urls.length} URLs`);
  if (urls.length === 0) return;
  const { domain, siteDir, results } = await captureUrls(urls);
  const meta = await buildSiteMeta({ domain, siteDir, urls, source: sitemapUrl, results });
  await buildIndex();
  console.log(`\nDone: ${meta.pages.length} pages → sites/${domain}/meta.json`);
}

async function cmdPage() {
  const url = args[0];
  if (!url) { console.error('Usage: node cli.mjs page <url>'); process.exit(1); }
  const { domain, siteDir, results } = await captureUrls([url]);
  const existing = (await readMeta(domain))?.pages.map(p => p.url) || [];
  const allUrls = [...new Set([...existing, url])];
  await buildSiteMeta({ domain, siteDir, urls: allUrls, source: null, results });
  await buildIndex();
  console.log(`\nDone: ${url} → sites/${domain}/`);
}

async function cmdList() {
  const sites = await buildIndex();
  if (sites.length === 0) { console.log('No sites captured yet.'); return; }
  console.log('Captured sites:\n');
  for (const s of sites) {
    const date = s.captured_at?.slice(0, 10) || '?';
    console.log(`  ${s.domain.padEnd(30)} ${s.captured_pages}/${s.pages} pages   ${date}`);
  }
}

async function cmdView() {
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? args[portIdx + 1] : '3000';
  await buildIndex();
  console.log(`Starting viewer at http://localhost:${port}/viewer/`);
  const child = spawn('npx', ['--yes', 'serve', '-l', port, '.'], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code));
}

async function cmdRetry() {
  const domain = args[0];
  if (!domain) { console.error('Usage: node cli.mjs retry <domain>'); process.exit(1); }
  const meta = await readMeta(domain);
  if (!meta) { console.error(`No meta.json at sites/${domain}/`); process.exit(1); }
  const failedUrls = meta.pages
    .filter(p => !p.desktop || !p.mobile || p.desktop_error || p.mobile_error)
    .map(p => p.url);
  if (failedUrls.length === 0) { console.log('No failed pages to retry.'); return; }
  console.log(`Retrying ${failedUrls.length} pages...`);
  const { siteDir, results } = await captureUrls(failedUrls, { force: true });
  const allUrls = meta.pages.map(p => p.url);
  await buildSiteMeta({ domain, siteDir, urls: allUrls, source: meta.source, results });
  await buildIndex();
  console.log('Retry done.');
}

const commands = { site: cmdSite, page: cmdPage, list: cmdList, view: cmdView, retry: cmdRetry };

if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
  console.log(HELP);
  process.exit(0);
}

const fn = commands[sub];
if (!fn) {
  console.error(`Unknown command: ${sub}`);
  console.log(HELP);
  process.exit(1);
}

await fn();
