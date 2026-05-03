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
  web-portfolio site <sitemap-url>     Capture all URLs from a sitemap
  web-portfolio page <url>              Capture a single page
  web-portfolio list                    List captured sites
  web-portfolio open <domain>           Open captured screenshots in Finder
  web-portfolio retry <domain>          Re-capture failed/missing pages
  web-portfolio help                    Show this help

Global flags:
  --json                                Output machine-readable JSON to stdout
                                        (progress logs go to stderr)

Examples:
  web-portfolio site https://example.com/sitemap.xml
  web-portfolio page https://example.com/about
  web-portfolio list --json
  web-portfolio open example.com
`;

const argv = process.argv.slice(2);
const sub = argv[0];
const json = argv.includes('--json');
const args = argv.slice(1).filter(a => a !== '--json');

async function readMeta(domain) {
  const p = path.join(DEFAULTS.sitesDir, domain, 'meta.json');
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, 'utf8'));
}

function out(obj, humanFn) {
  if (json) {
    console.log(JSON.stringify(obj, null, 2));
  } else if (humanFn) {
    humanFn(obj);
  }
}

async function cmdSite() {
  const sitemapUrl = args[0];
  if (!sitemapUrl) { console.error('Usage: web-portfolio site <sitemap-url>'); process.exit(1); }
  console.error(`Expanding sitemap: ${sitemapUrl}`);
  const urls = await expandSitemap(sitemapUrl);
  console.error(`Found ${urls.length} URLs`);
  if (urls.length === 0) { out({ urls: 0 }, () => console.log('No URLs found.')); return; }
  const { domain, siteDir, results } = await captureUrls(urls);
  const meta = await buildSiteMeta({ domain, siteDir, urls, source: sitemapUrl, results });
  await buildIndex();
  const captured = meta.pages.filter(p => p.desktop || p.mobile).length;
  const errors = results.filter(r => r.error).map(r => ({ url: r.url, mode: r.mode, error: r.error }));
  out(
    { domain, source: sitemapUrl, pages: meta.pages.length, captured_pages: captured, errors },
    (r) => console.log(`\nDone: ${r.captured_pages}/${r.pages} pages → sites/${r.domain}/meta.json${r.errors.length ? ` (${r.errors.length} errors)` : ''}`)
  );
}

async function cmdPage() {
  const url = args[0];
  if (!url) { console.error('Usage: web-portfolio page <url>'); process.exit(1); }
  const { domain, siteDir, results } = await captureUrls([url]);
  const existing = (await readMeta(domain))?.pages.map(p => p.url) || [];
  const allUrls = [...new Set([...existing, url])];
  const meta = await buildSiteMeta({ domain, siteDir, urls: allUrls, source: null, results });
  await buildIndex();
  const page = meta.pages.find(p => p.url === url);
  out(
    { domain, url, desktop: !!page?.desktop, mobile: !!page?.mobile, errors: results.filter(r => r.error).map(r => r.error) },
    (r) => console.log(`\nDone: ${r.url} → sites/${r.domain}/${r.desktop && r.mobile ? '(desktop+mobile)' : r.desktop ? '(desktop only)' : r.mobile ? '(mobile only)' : '(failed)'}`)
  );
}

async function cmdList() {
  const sites = await buildIndex();
  out(
    sites,
    (list) => {
      if (list.length === 0) { console.log('No sites captured yet.'); return; }
      console.log('Captured sites:\n');
      for (const s of list) {
        const date = s.captured_at?.slice(0, 10) || '?';
        console.log(`  ${s.domain.padEnd(30)} ${s.captured_pages}/${s.pages} pages   ${date}`);
      }
    }
  );
}

async function cmdOpen() {
  const domain = args[0];
  if (!domain) { console.error('Usage: web-portfolio open <domain>'); process.exit(1); }
  const dir = path.resolve(DEFAULTS.sitesDir, domain);
  if (!existsSync(dir)) { console.error(`No captures for ${domain}`); process.exit(1); }
  spawn('open', [dir], { stdio: 'ignore', detached: true }).unref();
  out({ domain, opened: dir }, (r) => console.log(`Opened: ${r.opened}`));
}

async function cmdRetry() {
  const domain = args[0];
  if (!domain) { console.error('Usage: web-portfolio retry <domain>'); process.exit(1); }
  const meta = await readMeta(domain);
  if (!meta) { console.error(`No meta.json at sites/${domain}/`); process.exit(1); }
  const failedUrls = meta.pages
    .filter(p => !p.desktop || !p.mobile || p.desktop_error || p.mobile_error)
    .map(p => p.url);
  if (failedUrls.length === 0) {
    out({ domain, retried: 0 }, () => console.log('No failed pages to retry.'));
    return;
  }
  console.error(`Retrying ${failedUrls.length} pages...`);
  const { siteDir, results } = await captureUrls(failedUrls, { force: true });
  const allUrls = meta.pages.map(p => p.url);
  const newMeta = await buildSiteMeta({ domain, siteDir, urls: allUrls, source: meta.source, results });
  await buildIndex();
  const stillFailing = newMeta.pages.filter(p =>
    failedUrls.includes(p.url) && (!p.desktop || !p.mobile)
  ).length;
  out(
    { domain, retried: failedUrls.length, still_failing: stillFailing },
    (r) => console.log(`Retry done: ${r.retried - r.still_failing}/${r.retried} now captured.`)
  );
}

const commands = { site: cmdSite, page: cmdPage, list: cmdList, open: cmdOpen, retry: cmdRetry };

if (!sub || sub === 'help' || sub === '-h' || sub === '--help') {
  console.log(HELP);
  process.exit(0);
}

const fn = commands[sub];
if (!fn) {
  console.error(`Unknown command: ${sub}`);
  console.error(HELP);
  process.exit(1);
}

await fn();
