import { test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupTmpDir, makeTmpDir } from "./helpers";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts");

type RunResult = { code: number | null; stdout: string; stderr: string };

function run(args: string[], env: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn("bun", [CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout!.on("data", (d) => (stdout += d));
    child.stderr!.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("CLI: help mentions new flags", async () => {
  const { stdout, code } = await run(["help"]);
  expect(code).toBe(0);
  expect(stdout).toMatch(/--limit/);
  expect(stdout).toMatch(/--exclude/);
  expect(stdout).toMatch(/--concurrency/);
  expect(stdout).toMatch(/doctor <run-dir>/);
  expect(stdout).toMatch(/--agent-task/);
  expect(stdout).toMatch(/--wait-ms/);
  expect(stdout).toMatch(/--strict/);
  expect(stdout).toMatch(/--allow-private/);
  expect(stdout).toMatch(/--min-interval/);
  expect(stdout).toMatch(/--click/);
  expect(stdout).toMatch(/--label/);
  expect(stdout).toMatch(/--eval/);
  expect(stdout).toMatch(/--allow-file/);
  expect(stdout).toMatch(/clean/);
  expect(stdout).toMatch(/--dry-run/);
  expect(stdout).toMatch(/--older-than/);
  expect(stdout).toMatch(/--shots/);
});

test("CLI: site rejects private URL by default with non-zero exit", async () => {
  const { code, stderr } = await run(["site", "http://localhost/sitemap.xml"]);
  expect(code).not.toBe(0);
  expect(stderr).toMatch(/プライベート|ループバック/);
});

test("CLI: page rejects file:// scheme", async () => {
  const { code, stderr } = await run(["page", "file:///etc/passwd"]);
  expect(code).not.toBe(0);
  expect(stderr).toMatch(/プロトコル/);
});

test("CLI: invalid numeric option fails as structured JSON before command execution", async () => {
  const { code, stdout, stderr } = await run([
    "site",
    "https://example.com/sitemap.xml",
    "--limit",
    "abc",
    "--json",
  ]);
  expect(code).toBe(1);
  expect(stderr).toBe("");
  const parsed = JSON.parse(stdout);
  expect(parsed.success).toBe(false);
  expect(parsed.error.code).toBe("INVALID_OPTION");
  expect(parsed.error.hint).toContain("--limit");
});

test("CLI: extra positional argument fails as structured JSON before command execution", async () => {
  const { code, stdout, stderr } = await run([
    "page",
    "https://example.com/about",
    "extra",
    "--json",
  ]);
  expect(code).toBe(1);
  expect(stderr).toBe("");
  const parsed = JSON.parse(stdout);
  expect(parsed.success).toBe(false);
  expect(parsed.error.code).toBe("INVALID_OPTION");
  expect(parsed.error.message).toContain("引数が多すぎます");
});

test("CLI: 引数不足は構造化 JSON (success:false / INVALID_OPTION) で返す", async () => {
  const { code, stdout, stderr } = await run(["shot", "--json"]);
  expect(code).toBe(1);
  expect(stderr).not.toMatch(/INVALID_OPTION|エラー/i);
  const parsed = JSON.parse(stdout);
  expect(parsed.success).toBe(false);
  expect(parsed.error.code).toBe("INVALID_OPTION");
});

test("CLI: open で未キャプチャの domain は DOMAIN_NOT_FOUND を JSON で返す", async () => {
  const { code, stdout } = await run(["open", "no-such-domain.example", "--json"]);
  expect(code).toBe(1);
  const parsed = JSON.parse(stdout);
  expect(parsed.success).toBe(false);
  expect(parsed.error.code).toBe("DOMAIN_NOT_FOUND");
});

test("CLI: doctor で存在しない run-dir は RUN_DIR_NOT_FOUND を JSON で返す", async () => {
  const { code, stdout, stderr } = await run(["doctor", "/no/such/sitesnap-run-dir", "--json"]);
  expect(code).toBe(1);
  expect(stderr).not.toMatch(/RUN_DIR_NOT_FOUND|エラー/i);
  const parsed = JSON.parse(stdout);
  expect(parsed.success).toBe(false);
  expect(parsed.error.code).toBe("RUN_DIR_NOT_FOUND");
});

test("CLI: --version prints version and exits 0", async () => {
  const { stdout, code } = await run(["--version"]);
  expect(code).toBe(0);
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

test("CLI: -v alias prints version and exits 0", async () => {
  const { stdout, code } = await run(["-v"]);
  expect(code).toBe(0);
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

test("CLI: --version takes precedence over subcommand", async () => {
  const { stdout, code } = await run(["site", "http://localhost/sitemap.xml", "--version"]);
  expect(code).toBe(0);
  expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
});

test("CLI: subcommand --help / -h prints help and exits 0", async () => {
  for (const args of [["shot", "--help"], ["shot", "-h"]]) {
    const { stdout, code } = await run(args);
    expect(code).toBe(0);
    expect(stdout).toMatch(/sitesnap shot <url>/);
    expect(stdout).toMatch(/--out-file/);
  }
});

test("CLI: doctor --agent-task diagnoses a run directory and writes handoff files", async () => {
  const dir = await makeTmpDir("sitesnap-cli-doctor-");
  try {
    await mkdir(path.join(dir, "screenshots", "mobile"), { recursive: true });
    await writeFile(
      path.join(dir, "result.json"),
      JSON.stringify({
        domain: "example.com",
        captures: [
          {
            url: "https://example.com/about",
            viewport: "mobile",
            status: "failed",
            reason: "blank_screenshot",
            screenshotPath: "screenshots/mobile/about.png",
          },
        ],
      })
    );

    const { stdout, code } = await run(["doctor", dir, "--agent-task"]);

    expect(code).toBe(0);
    expect(stdout).toContain("1件のスクリーンショットが白紙っぽいです。");
    expect(stdout).toContain("推奨リトライ:");
    expect(existsSync(path.join(dir, "diagnosis.md"))).toBe(true);
    expect(existsSync(path.join(dir, "agent-task.md"))).toBe(true);
    expect(existsSync(path.join(dir, "suggested-sitesnap.config.json"))).toBe(true);
  } finally {
    await cleanupTmpDir(dir);
  }
});
