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
sitesnap — capture website screenshots for portfolio reference

Usage:
  sitesnap site <sitemap-url>     Capture all URLs from a sitemap
  sitesnap page <url>              Capture a single page
  sitesnap list                    List captured sites
  sitesnap open <domain>           Open captured screenshots in Finder
  sitesnap retry <domain>          Re-capture failed/missing pages
  sitesnap help                    Show this help

Global flags:
  --json                                Output machine-readable JSON to stdout
                                        (progress logs go to stderr)
  --force-visible                       Force-show elements hidden by scroll-reveal libraries
                                        (AOS, wow.js, etc.) Use when screenshots come out blank.
  --out <dir>                           Output directory (default: ./sites/ in current working dir).
                                        Also configurable via SITESNAP_OUT env var.
  --limit <N>                           Capture at most N URLs (sitemap order, after --exclude).
  --exclude <regex>                     Skip URLs matching this regular expression.
  --concurrency <N>                     Override worker count (default 3).
  --min-interval <ms>                   Minimum delay between requests to the same host (default 0).
  --strict                              Exit with non-zero status if any page failed to capture.
  --allow-private                       Allow loopback/RFC1918/link-local hosts (default refused).

Examples:
  sitesnap site https://example.com/sitemap.xml --limit 10
  sitesnap site https://example.com/sitemap.xml --exclude '\\?utm_'
  sitesnap site https://example.com/sitemap.xml --concurrency 5 --min-interval 250
  sitesnap site https://example.com/sitemap.xml --strict
  sitesnap site http://localhost:8080/sitemap.xml --allow-private
`;

const argv = process.argv.slice(2);
const sub = argv[0];

const json = argv.includes('--json');
const forceVisible = argv.includes('--force-visible');
const strict = argv.includes('--strict');
const allowPrivate = argv.includes('--allow-private');

let outDir = process.env.SITESNAP_OUT || DEFAULTS.sitesDir;
let limit = null;
let exclude = null;
let concurrency = null;
let minInterval = null;

const flagSet = new Set(['--json', '--force-visible', '--strict', '--allow-private']);
const valueFlags = new Set(['--out', '--limit', '--exclude', '--concurrency', '--min-interval']);
const args = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (flagSet.has(a)) continue;
  if (valueFlags.has(a)) {
    const v = argv[++i];
    if (v === undefined) { console.error(`Missing value for ${a}`); process.exit(1); }
    if (a === '--out') outDir = v;
    else if (a === '--limit') limit = Number(v);
    else if (a === '--exclude') {
      try { exclude = new RegExp(v); }
      catch (e) { console.error(`Invalid --exclude regex: ${e.message}`); process.exit(1); }
    }
    else if (a === '--concurrency') concurrency = Number(v);
    else if (a === '--min-interval') minInterval = Number(v);
    continue;
  }
  args.push(a);
}
outDir = path.resolve(outDir);

async function readMeta(domain) {
  const p = path.join(outDir, domain, 'meta.json');
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
  if (!sitemapUrl) { console.error('Usage: sitesnap site <sitemap-url>'); process.exit(1); }
  console.error(`Expanding sitemap: ${sitemapUrl}`);
  let urls = await expandSitemap(sitemapUrl, { allowPrivate });
  console.error(`Found ${urls.length} URLs`);
  if (exclude) {
    const before = urls.length;
    urls = urls.filter(u => !exclude.test(u));
    console.error(`After --exclude: ${urls.length} URLs (filtered ${before - urls.length})`);
  }
  if (limit && urls.length > limit) {
    urls = urls.slice(0, limit);
    console.error(`After --limit: ${urls.length} URLs`);
  }
  if (urls.length === 0) { out({ urls: 0 }, () => console.log('No URLs found.')); return; }
  const rateLimiter = minInterval ? (await import('./src/rate-limit.mjs')).createHostRateLimiter(minInterval) : null;
  const { domain, siteDir, results } = await captureUrls(urls, {
    forceVisible, outDir, allowPrivate, concurrency, rateLimiter,
  });
  const meta = await buildSiteMeta({ domain, siteDir, urls, source: sitemapUrl, results });
  await buildIndex(outDir);
  const captured = meta.pages.filter(p => p.desktop || p.mobile).length;
  const errors = results.filter(r => r.error).map(r => ({ url: r.url, mode: r.mode, error: r.error }));
  out(
    { domain, source: sitemapUrl, pages: meta.pages.length, captured_pages: captured, errors, out_dir: outDir },
    (r) => console.log(`\nDone: ${r.captured_pages}/${r.pages} pages → ${path.relative(process.cwd(), siteDir)}/meta.json${r.errors.length ? ` (${r.errors.length} errors)` : ''}`)
  );
  if (strict && errors.length > 0) process.exit(1);
}

async function cmdPage() {
  const url = args[0];
  if (!url) { console.error('Usage: sitesnap page <url>'); process.exit(1); }
  const { domain, siteDir, results } = await captureUrls([url], {
    forceVisible, outDir, allowPrivate, concurrency,
  });
  const existing = (await readMeta(domain))?.pages.map(p => p.url) || [];
  const allUrls = [...new Set([...existing, url])];
  const meta = await buildSiteMeta({ domain, siteDir, urls: allUrls, source: null, results });
  await buildIndex(outDir);
  const page = meta.pages.find(p => p.url === url);
  const failed = results.filter(r => r.error);
  out(
    { domain, url, desktop: !!page?.desktop, mobile: !!page?.mobile, errors: failed.map(r => r.error), out_dir: outDir },
    (r) => console.log(`\nDone: ${r.url} → ${path.relative(process.cwd(), siteDir)}/${r.desktop && r.mobile ? '(desktop+mobile)' : r.desktop ? '(desktop only)' : r.mobile ? '(mobile only)' : '(failed)'}`)
  );
  if (strict && failed.length > 0) process.exit(1);
}

async function cmdList() {
  const sites = await buildIndex(outDir);
  out(
    sites,
    (list) => {
      if (list.length === 0) { console.log(`No sites captured yet (looked in ${outDir}).`); return; }
      console.log(`Captured sites in ${outDir}:\n`);
      for (const s of list) {
        const date = s.captured_at?.slice(0, 10) || '?';
        console.log(`  ${s.domain.padEnd(30)} ${s.captured_pages}/${s.pages} pages   ${date}`);
      }
    }
  );
}

async function cmdOpen() {
  const domain = args[0];
  if (!domain) { console.error('Usage: sitesnap open <domain>'); process.exit(1); }
  const dir = path.resolve(outDir, domain);
  if (!existsSync(dir)) { console.error(`No captures for ${domain} at ${dir}`); process.exit(1); }
  const opener =
    process.platform === 'darwin' ? { cmd: 'open', args: [dir] } :
    process.platform === 'win32'  ? { cmd: 'explorer', args: [dir] } :
                                    { cmd: 'xdg-open', args: [dir] };
  spawn(opener.cmd, opener.args, { stdio: 'ignore', detached: true }).unref();
  out({ domain, opened: dir }, (r) => console.log(`Opened: ${r.opened}`));
}

async function cmdRetry() {
  const domain = args[0];
  if (!domain) { console.error('Usage: sitesnap retry <domain>'); process.exit(1); }
  const meta = await readMeta(domain);
  if (!meta) { console.error(`No meta.json at ${path.join(outDir, domain)}`); process.exit(1); }
  const failedUrls = meta.pages
    .filter(p => !p.desktop || !p.mobile || p.desktop_error || p.mobile_error)
    .map(p => p.url);
  if (failedUrls.length === 0) {
    out({ domain, retried: 0 }, () => console.log('No failed pages to retry.'));
    return;
  }
  console.error(`Retrying ${failedUrls.length} pages...`);
  const { siteDir, results } = await captureUrls(failedUrls, { force: true, forceVisible, outDir });
  const allUrls = meta.pages.map(p => p.url);
  const newMeta = await buildSiteMeta({ domain, siteDir, urls: allUrls, source: meta.source, results });
  await buildIndex(outDir);
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

try {
  await fn();
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
