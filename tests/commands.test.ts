import { test, expect } from "bun:test";
import { buildCommands } from "../src/commands.ts";
import { DEFAULTS } from "../src/config.ts";
import type { CliContext } from "../src/cli-args.ts";
import { makeCtx } from "./helpers";

function baseCtx(overrides: Partial<CliContext> = {}): CliContext {
  return makeCtx({ sub: "list", outDir: "/tmp/sitesnap-command-test-missing", ...overrides });
}

test("command handlers return CommandResult instead of writing directly to process state", async () => {
  const result = await buildCommands().list(baseCtx());
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe(JSON.stringify({ success: true, sites: [] }));
  expect(result.stderr).toBe("");
});

test("command handlers can return human-readable output without exiting", async () => {
  const result = await buildCommands().list(baseCtx({ json: false, outDir: DEFAULTS.sitesDir }));
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("まだキャプチャ済みサイトはありません");
  expect(result.stderr).toBe("");
});
