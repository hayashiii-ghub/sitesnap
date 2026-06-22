import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCliArgs, type CliContext } from "../src/cli-args.ts";
import { buildCommands } from "../src/commands.ts";
import { makeCtx } from "./helpers";

function ctxFor(outDir: string, over: Partial<CliContext> = {}): CliContext {
  return makeCtx({ sub: "clean", outDir, ...over });
}

async function makeShots(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sitesnap-clean-"));
  await mkdir(path.join(dir, "localhost_3000", "shots"), { recursive: true });
  await writeFile(path.join(dir, "localhost_3000", "shots", "a.png"), "aaaa");
  await mkdir(path.join(dir, "example.com", "desktop"), { recursive: true });
  await writeFile(path.join(dir, "example.com", "meta.json"), "{}");
  await writeFile(path.join(dir, "example.com", "desktop", "x.png"), "zzzzz");
  return dir;
}

test("parseCliArgs: clean の host / --older-than / --dry-run をパースする", () => {
  const ctx = parseCliArgs(["clean", "localhost_3000", "--older-than", "7", "--dry-run"]);
  expect(ctx.sub).toBe("clean");
  expect(ctx.args).toEqual(["localhost_3000"]);
  expect(ctx.olderThan).toBe(7);
  expect(ctx.dryRun).toBeTrue();
});

test("parseCliArgs: clean は位置引数 1 個まで", () => {
  expect(() => parseCliArgs(["clean", "a", "b"])).toThrow(/引数が多すぎます/);
});

test("clean --dry-run: 消さずに対象を返す", async () => {
  const dir = await makeShots();
  try {
    const result = await buildCommands().clean!(ctxFor(dir, { dryRun: true }));
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.dry_run).toBeTrue();
    expect(data.removed_files).toBe(1);
    // 実ファイルは残る
    expect(existsSync(path.join(dir, "localhost_3000", "shots", "a.png"))).toBeTrue();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("list --shots: shots を持つホストをホスト別に列挙する", async () => {
  const dir = await makeShots();
  try {
    const result = await buildCommands().list!(ctxFor(dir, { sub: "list", shots: true }));
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.success).toBeTrue();
    expect(Array.isArray(data.shots)).toBeTrue();
    const hosts = (data.shots as { host: string }[]).map((s) => s.host);
    expect(hosts).toContain("localhost_3000");
    // アーカイブ用ホストは含まれない
    expect(hosts).not.toContain("example.com");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clean: shots を消し、アーカイブは残す", async () => {
  const dir = await makeShots();
  try {
    const result = await buildCommands().clean!(ctxFor(dir));
    const data = JSON.parse(result.stdout);
    expect(data.dry_run).toBeFalse();
    expect(data.removed_files).toBe(1);
    expect(existsSync(path.join(dir, "localhost_3000", "shots", "a.png"))).toBeFalse();
    // アーカイブは無傷
    expect(existsSync(path.join(dir, "example.com", "meta.json"))).toBeTrue();
    expect(existsSync(path.join(dir, "example.com", "desktop", "x.png"))).toBeTrue();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
