import { test, expect, mock } from "bun:test";
import { USER_AGENT } from "../src/config.ts";

test("meta: fetchTitle sends identifiable User-Agent", async () => {
  const calls: { url: unknown; opts: unknown }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = mock(async (url: unknown, opts: unknown) => {
    calls.push({ url, opts });
    return {
      ok: true,
      text: async () => "<html><head><title>Hello</title></head></html>",
    };
  }) as unknown as typeof globalThis.fetch;
  try {
    const { _fetchTitleForTest } = await import("../src/meta.ts");
    const title = await _fetchTitleForTest("https://example.com/");
    expect(title).toBe("Hello");
    const opts = calls[0]?.opts as { headers?: Record<string, string> } | undefined;
    expect(opts?.headers?.["user-agent"]).toBe(USER_AGENT);
  } finally {
    globalThis.fetch = original;
  }
});
