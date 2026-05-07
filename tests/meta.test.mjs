import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { USER_AGENT } from '../src/config.ts';

test('meta: fetchTitle sends identifiable User-Agent', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = mock.fn(async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, text: async () => '<html><head><title>Hello</title></head></html>' };
  });
  try {
    const { _fetchTitleForTest } = await import('../src/meta.ts');
    const title = await _fetchTitleForTest('https://example.com/');
    assert.equal(title, 'Hello');
    assert.equal(calls[0].opts?.headers?.['user-agent'], USER_AGENT);
  } finally {
    globalThis.fetch = original;
  }
});
