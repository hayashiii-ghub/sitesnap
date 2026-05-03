import { chromium, devices } from 'playwright';
import { mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULTS } from './config.mjs';

export function slugify(url) {
  const u = new URL(url);
  let p = u.pathname.replace(/^\/+|\/+$/g, '');
  if (!p) p = 'index';
  return p.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export function domainOf(url) {
  return new URL(url).hostname;
}

function viewportFor(mode) {
  const v = DEFAULTS.viewports[mode];
  if (typeof v === 'string') return devices[v];
  return v;
}

async function autoScroll(page) {
  await page.evaluate(async ({ step, interval }) => {
    await new Promise((resolve) => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, interval);
    });
  }, { step: DEFAULTS.scrollStep, interval: DEFAULTS.scrollInterval });
  await page.waitForTimeout(DEFAULTS.postScrollWait);
}

async function captureOne(browser, url, mode, siteDir, opts = {}) {
  const slug = slugify(url);
  const file = path.join(siteDir, mode, `${slug}.png`);

  if (!opts.force && existsSync(file)) {
    const s = await stat(file);
    if (s.size > 1024) return { url, mode, file, slug, skipped: true };
  }

  const ctx = await browser.newContext({
    ...viewportFor(mode),
    locale: DEFAULTS.locale,
    timezoneId: DEFAULTS.timezone,
  });
  const page = await ctx.newPage();
  let title = '';
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: DEFAULTS.navigationTimeout });
    title = await page.title();
    await autoScroll(page);
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await ctx.close();
  }
  return { url, mode, file, slug, title };
}

export async function captureUrls(urls, opts = {}) {
  if (urls.length === 0) throw new Error('No URLs provided');

  const domain = domainOf(urls[0]);
  const siteDir = path.join(DEFAULTS.sitesDir, domain);
  await mkdir(path.join(siteDir, 'desktop'), { recursive: true });
  await mkdir(path.join(siteDir, 'mobile'), { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const mode of ['desktop', 'mobile']) {
      let i = 0;
      const worker = async () => {
        while (i < urls.length) {
          const my = i++;
          const url = urls[my];
          try {
            const r = await captureOne(browser, url, mode, siteDir, opts);
            results.push(r);
            console.log(`[${mode}] ${my + 1}/${urls.length} ${r.skipped ? 'skip' : 'ok  '} ${url}`);
          } catch (e) {
            console.log(`[${mode}] ${my + 1}/${urls.length} ERR  ${url} :: ${e.message}`);
            results.push({ url, mode, error: e.message, slug: slugify(url) });
          }
        }
      };
      await Promise.all(Array.from({ length: DEFAULTS.concurrency }, worker));
    }
  } finally {
    await browser.close();
  }

  return { domain, siteDir, results };
}
