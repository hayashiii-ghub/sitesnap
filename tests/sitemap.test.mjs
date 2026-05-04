import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { expandSitemap } from '../src/sitemap.mjs';
import { USER_AGENT } from '../src/config.mjs';
import { FIXTURE_URLSET, FIXTURE_SITEMAPINDEX } from './helpers.mjs';

function mockFetchSequence(responses) {
  const calls = [];
  const fn = mock.fn(async (url, opts) => {
    calls.push({ url, opts });
    const body = responses[url];
    if (body === undefined) throw new Error(`unexpected fetch: ${url}`);
    return { ok: true, status: 200, text: async () => body };
  });
  return { fn, calls };
}

test('expandSitemap: rejects private host', async () => {
  await assert.rejects(
    () => expandSitemap('http://localhost/sitemap.xml'),
    /private|loopback/i
  );
});

test('expandSitemap: rejects non-http protocol', async () => {
  await assert.rejects(
    () => expandSitemap('file:///tmp/sitemap.xml'),
    /protocol/i
  );
});

test('expandSitemap: parses urlset and sends User-Agent', async () => {
  const { fn, calls } = mockFetchSequence({
    'https://example.com/sitemap.xml': FIXTURE_URLSET,
  });
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    const urls = await expandSitemap('https://example.com/sitemap.xml');
    assert.deepEqual(urls, ['https://example.com/', 'https://example.com/about']);
    assert.equal(calls[0].opts?.headers?.['user-agent'], USER_AGENT);
  } finally {
    globalThis.fetch = original;
  }
});

test('expandSitemap: silently skips cyclic sitemap references', async () => {
  const cyclic = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/a.xml</loc></sitemap>
</sitemapindex>`;
  const { fn } = mockFetchSequence({
    'https://example.com/a.xml': cyclic,
  });
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    const urls = await expandSitemap('https://example.com/a.xml');
    assert.deepEqual(urls, []);
  } finally {
    globalThis.fetch = original;
  }
});

test('expandSitemap: throws when nesting exceeds maxDepth', async () => {
  const indexFor = (next) => `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${next}</loc></sitemap>
</sitemapindex>`;
  const { fn } = mockFetchSequence({
    'https://example.com/0.xml': indexFor('https://example.com/1.xml'),
    'https://example.com/1.xml': indexFor('https://example.com/2.xml'),
    'https://example.com/2.xml': indexFor('https://example.com/3.xml'),
  });
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    await assert.rejects(
      () => expandSitemap('https://example.com/0.xml', { maxDepth: 2 }),
      /depth/i
    );
  } finally {
    globalThis.fetch = original;
  }
});
