import { test, expect } from "bun:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  expect(stdout).toMatch(/--strict/);
  expect(stdout).toMatch(/--allow-private/);
  expect(stdout).toMatch(/--min-interval/);
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
