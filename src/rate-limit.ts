export interface HostRateLimiter {
  wait(host: string): Promise<void>
}

export function createHostRateLimiter(minIntervalMs: number): HostRateLimiter {
  const nextAllowed = new Map<string, number>()

  return {
    async wait(host: string): Promise<void> {
      if (!minIntervalMs || minIntervalMs <= 0) return
      const now = Date.now()
      const next = nextAllowed.get(host) || 0
      const waitMs = Math.max(0, next - now)
      nextAllowed.set(host, Math.max(now, next) + minIntervalMs)
      if (waitMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
      }
    },
  }
}
