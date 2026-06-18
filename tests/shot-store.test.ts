import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile, rm, mkdtemp, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listShots, pruneShots } from "../src/shot-store.ts";

async function makeSites(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sitesnap-store-"));
  // shots を持つホスト 2 つ
  await mkdir(path.join(dir, "localhost_3000", "shots"), { recursive: true });
  await writeFile(path.join(dir, "localhost_3000", "shots", "a.png"), "aaaa"); // 4 bytes
  await writeFile(path.join(dir, "localhost_3000", "shots", "b.png"), "bbbbbb"); // 6 bytes
  await mkdir(path.join(dir, "_file", "shots"), { recursive: true });
  await writeFile(path.join(dir, "_file", "shots", "c.png"), "cc"); // 2 bytes
  // shots を持たないアーカイブ用ホスト (clean/list の対象外であるべき)
  await mkdir(path.join(dir, "example.com", "desktop"), { recursive: true });
  await writeFile(path.join(dir, "example.com", "meta.json"), "{}");
  await writeFile(path.join(dir, "example.com", "desktop", "x.png"), "zzzzz");
  return dir;
}

test("listShots: shots/ を持つホストだけをホスト別に集計する", async () => {
  const dir = await makeSites();
  try {
    const summary = await listShots(dir);
    const hosts = summary.map((s) => s.host).sort();
    expect(hosts).toEqual(["_file", "localhost_3000"]);
    const lh = summary.find((s) => s.host === "localhost_3000")!;
    expect(lh.files).toBe(2);
    expect(lh.bytes).toBe(10);
    expect(lh.latest_mtime).not.toBeNull();
    // アーカイブ用の example.com は含まれない
    expect(summary.find((s) => s.host === "example.com")).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("listShots: sitesDir が無ければ空配列", async () => {
  expect(await listShots(path.join(tmpdir(), "no-such-sitesnap-dir-xyz"))).toEqual([]);
});

test("pruneShots: dry-run はファイルを消さず対象を返す", async () => {
  const dir = await makeSites();
  try {
    const result = await pruneShots(dir, { dryRun: true });
    expect(result.dry_run).toBeTrue();
    expect(result.removed.length).toBe(3);
    expect(result.bytes).toBe(12);
    // 実ファイルは残っている
    expect(existsSync(path.join(dir, "localhost_3000", "shots", "a.png"))).toBeTrue();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pruneShots: 実削除は shots のみ消し、アーカイブは残す", async () => {
  const dir = await makeSites();
  try {
    const result = await pruneShots(dir, {});
    expect(result.dry_run).toBeFalse();
    expect(result.removed.length).toBe(3);
    expect(existsSync(path.join(dir, "localhost_3000", "shots", "a.png"))).toBeFalse();
    expect(existsSync(path.join(dir, "_file", "shots", "c.png"))).toBeFalse();
    // アーカイブ (desktop / meta.json) は無傷
    expect(existsSync(path.join(dir, "example.com", "desktop", "x.png"))).toBeTrue();
    expect(existsSync(path.join(dir, "example.com", "meta.json"))).toBeTrue();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pruneShots: host 指定はそのホストだけ消す", async () => {
  const dir = await makeSites();
  try {
    const result = await pruneShots(dir, { host: "_file" });
    expect(result.removed.length).toBe(1);
    expect(existsSync(path.join(dir, "_file", "shots", "c.png"))).toBeFalse();
    // 他ホストは残る
    expect(existsSync(path.join(dir, "localhost_3000", "shots", "a.png"))).toBeTrue();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pruneShots: --older-than は古いファイルだけ消す", async () => {
  const dir = await makeSites();
  try {
    const now = Date.parse("2026-06-18T00:00:00Z");
    // a.png を 10 日前に、b.png を 1 日前にする
    const tenDaysAgo = new Date(now - 10 * 86400000);
    const oneDayAgo = new Date(now - 1 * 86400000);
    await utimes(path.join(dir, "localhost_3000", "shots", "a.png"), tenDaysAgo, tenDaysAgo);
    await utimes(path.join(dir, "localhost_3000", "shots", "b.png"), oneDayAgo, oneDayAgo);
    await utimes(path.join(dir, "_file", "shots", "c.png"), oneDayAgo, oneDayAgo);

    const result = await pruneShots(dir, { olderThanDays: 7, now });
    // 7日より古いのは a.png のみ
    expect(result.removed.map((r) => path.basename(r.file))).toEqual(["a.png"]);
    expect(existsSync(path.join(dir, "localhost_3000", "shots", "a.png"))).toBeFalse();
    expect(existsSync(path.join(dir, "localhost_3000", "shots", "b.png"))).toBeTrue();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
