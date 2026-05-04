import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'cli.mjs');

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('CLI: help mentions new flags', async () => {
  const { stdout, code } = await run(['help']);
  assert.equal(code, 0);
  assert.match(stdout, /--limit/);
  assert.match(stdout, /--exclude/);
  assert.match(stdout, /--concurrency/);
  assert.match(stdout, /--strict/);
  assert.match(stdout, /--allow-private/);
  assert.match(stdout, /--min-interval/);
});

test('CLI: site rejects private URL by default with non-zero exit', async () => {
  const { code, stderr } = await run(['site', 'http://localhost/sitemap.xml']);
  assert.notEqual(code, 0);
  assert.match(stderr, /private|loopback/i);
});

test('CLI: page rejects file:// scheme', async () => {
  const { code, stderr } = await run(['page', 'file:///etc/passwd']);
  assert.notEqual(code, 0);
  assert.match(stderr, /protocol/i);
});

test('CLI: --version prints version and exits 0', async () => {
  const { stdout, code } = await run(['--version']);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('CLI: -v alias prints version and exits 0', async () => {
  const { stdout, code } = await run(['-v']);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('CLI: --version takes precedence over subcommand', async () => {
  const { stdout, code } = await run(['site', 'http://localhost/sitemap.xml', '--version']);
  assert.equal(code, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});
