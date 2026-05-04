export function createHostRateLimiter(minIntervalMs) {
  const nextAllowed = new Map();

  return {
    async wait(host) {
      if (!minIntervalMs || minIntervalMs <= 0) return;
      const now = Date.now();
      const next = nextAllowed.get(host) || 0;
      const waitMs = Math.max(0, next - now);
      nextAllowed.set(host, Math.max(now, next) + minIntervalMs);
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    },
  };
}
