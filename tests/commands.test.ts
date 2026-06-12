import { test, expect } from "bun:test";
import { buildCommands } from "../src/commands.ts";
import { DEFAULTS } from "../src/config.ts";
import type { CliContext } from "../src/cli-args.ts";

function baseCtx(overrides: Partial<CliContext> = {}): CliContext {
  return {
    sub: "list",
    args: [],
    json: true,
    strict: false,
    agentTask: false,
    outDir: "/tmp/sitesnap-command-test-missing",
    captureOptions: {
      outDir: "/tmp/sitesnap-command-test-missing",
      forceVisible: false,
      allowPrivate: false,
    },
    shotOptions: { vp: null, device: null, selector: null, settleMs: null, full: false, props: null },
    limit: null,
    exclude: null,
    minInterval: null,
    ...overrides,
  };
}

test("command handlers return CommandResult instead of writing directly to process state", async () => {
  const result = await buildCommands().list(baseCtx());
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe(JSON.stringify({ success: true, sites: [] }, null, 2));
  expect(result.stderr).toBe("");
});

test("command handlers can return human-readable output without exiting", async () => {
  const result = await buildCommands().list(baseCtx({ json: false, outDir: DEFAULTS.sitesDir }));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("まだキャプチャ済みサイトはありません");
  expect(result.stderr).toBe("");
});
