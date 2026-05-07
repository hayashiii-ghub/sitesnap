import { test, expect } from "bun:test";
import { createHostRateLimiter } from "../src/rate-limit.ts";

test("rate limiter: zero interval is a no-op", async () => {
  const limiter = createHostRateLimiter(0);
  const t0 = Date.now();
  await limiter.wait("example.com");
  await limiter.wait("example.com");
  await limiter.wait("example.com");
  expect(Date.now() - t0).toBeLessThan(50);
});

test("rate limiter: enforces minimum interval per host", async () => {
  const limiter = createHostRateLimiter(150);
  const t0 = Date.now();
  await limiter.wait("a.example.com");
  await limiter.wait("a.example.com");
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeGreaterThanOrEqual(140);
});

test("rate limiter: independent hosts do not block each other", async () => {
  const limiter = createHostRateLimiter(200);
  const t0 = Date.now();
  await limiter.wait("a.example.com");
  await limiter.wait("b.example.com");
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(100);
});
