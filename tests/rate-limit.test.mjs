import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHostRateLimiter } from '../src/rate-limit.mjs';

test('rate limiter: zero interval is a no-op', async () => {
  const limiter = createHostRateLimiter(0);
  const t0 = Date.now();
  await limiter.wait('example.com');
  await limiter.wait('example.com');
  await limiter.wait('example.com');
  assert.ok(Date.now() - t0 < 50);
});

test('rate limiter: enforces minimum interval per host', async () => {
  const limiter = createHostRateLimiter(150);
  const t0 = Date.now();
  await limiter.wait('a.example.com');
  await limiter.wait('a.example.com');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 140, `expected >=140ms, got ${elapsed}ms`);
});

test('rate limiter: independent hosts do not block each other', async () => {
  const limiter = createHostRateLimiter(200);
  const t0 = Date.now();
  await limiter.wait('a.example.com');
  await limiter.wait('b.example.com');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 100, `expected <100ms, got ${elapsed}ms`);
});
