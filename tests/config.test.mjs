import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, USER_AGENT, DEFAULTS } from '../src/config.mjs';
import { readFile } from 'node:fs/promises';

test('VERSION matches package.json', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('USER_AGENT identifies sitesnap with version and homepage', () => {
  assert.match(USER_AGENT, /^sitesnap\/\d+\.\d+\.\d+ \(\+https?:\/\/.+\)$/);
});

test('DEFAULTS exposes maxSitemapDepth and minIntervalMs', () => {
  assert.equal(typeof DEFAULTS.maxSitemapDepth, 'number');
  assert.equal(typeof DEFAULTS.minIntervalMs, 'number');
});
