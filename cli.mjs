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

Examples:
  sitesnap site https://example.com/sitemap.xml
  sitesnap page https://example.com/about --out ~/captures
  sitesnap list --json
  sitesnap open example.com
  sitesnap site https://example.com/sitemap.xml --force-visible
`;

const argv = process.argv.slice(2);
const sub = argv[0];

const json = argv.includes('--json');
const forceVisible = argv.includes('--force-visible');

let outDir = process.env.SITESNAP_OUT || DEFAULTS.sitesDir;
const flagSet = new Set(['--json', '--force-visible']);
const args = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (flagSet.has(a)) continue;
  if (a === '--out') {
    if (argv[i + 1]) outDir = argv[++i];
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
  const urls = await expandSitemap(sitemapUrl);
  console.error(`Found ${urls.length} URLs`);
  if (urls.length === 0) { out({ urls: 0 }, () => console.log('No URLs found.')); return; }
  const { domain, siteDir, results } = await captureUrls(urls, { forceVisible, outDir });
  const meta = await buildSiteMeta({ domain, siteDir, urls, source: sitemapUrl, results });
  await buildIndex(outDir);
  const captured = meta.pages.filter(p => p.desktop || p.mobile).length;
  const errors = results.filter(r => r.error).map(r => ({ url: r.url, mode: r.mode, error: r.error }));
  out(
    { domain, source: sitemapUrl, pages: meta.pages.length, captured_pages: captured, errors, out_dir: outDir },
    (r) => console.log(`\nDone: ${r.captured_pages}/${r.pages} pages → ${path.relative(process.cwd(), siteDir)}/meta.json${r.errors.length ? ` (${r.errors.length} errors)` : ''}`)
  );
}

async function cmdPage() {
  const url = args[0];
  if (!url) { console.error('Usage: sitesnap page <url>'); process.exit(1); }
  const { domain, siteDir, results } = await captureUrls([url], { forceVisible, outDir });
  const existing = (await readMeta(domain))?.pages.map(p => p.url) || [];
  const allUrls = [...new Set([...existing, url])];
  const meta = await buildSiteMeta({ domain, siteDir, urls: allUrls, source: null, results });
  await buildIndex(outDir);
  const page = meta.pages.find(p => p.url === url);
  out(
    { domain, url, desktop: !!page?.desktop, mobile: !!page?.mobile, errors: results.filter(r => r.error).map(r => r.error), out_dir: outDir },
    (r) => console.log(`\nDone: ${r.url} → ${path.relative(process.cwd(), siteDir)}/${r.desktop && r.mobile ? '(desktop+mobile)' : r.desktop ? '(desktop only)' : r.mobile ? '(mobile only)' : '(failed)'}`)
  );
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

await fn();
