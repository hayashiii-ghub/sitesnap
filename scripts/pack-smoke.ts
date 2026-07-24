import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const npmCache = mkdtempSync(join(tmpdir(), "sitesnap-npm-cache-"))
const packTmp = mkdtempSync(join(tmpdir(), "sitesnap-pack-smoke-"))
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as { version: string }

function run(command: string, args: string[], cwd = root): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      npm_config_fetch_retries: "1",
      npm_config_fetch_retry_mintimeout: "1000",
      npm_config_fetch_retry_maxtimeout: "5000",
      npm_config_fetch_timeout: "15000",
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  })

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `exit: ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n")
    )
  }

  return result.stdout
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

interface PackEntry {
  filename: string
  files?: Array<{ path: string }>
}

// npm pack --json の出力形式は npm 12 で変わった:
//   npm 11 以前: [{ filename, files, ... }]
//   npm 12:      { "<package name>": { filename, files, ... } }
// release.yml は npm@latest を入れるので、どちらでも動くよう正規化する
// (形式差でリリースが落ちても tarball の中身は壊れていない、という事故を防ぐ)
function packEntries(raw: string): PackEntry[] {
  const parsed = JSON.parse(raw) as PackEntry[] | Record<string, PackEntry>
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed)
  assert(entries.length > 0, `npm pack --json returned no package entry: ${raw.slice(0, 200)}`)
  return entries
}

try {
  const dryRun = packEntries(run("npm", ["pack", "--dry-run", "--json"]))
  const packedFiles = dryRun[0]!.files
  assert(packedFiles, "npm pack --dry-run --json did not report a file list")
  const packedPaths = new Set(packedFiles.map((file) => file.path))

  for (const required of [
    "dist/cli.js",
    "package.json",
    "README.md",
    "README.en.md",
    "CHANGELOG.md",
    "AGENTS.md",
    "skills/sitesnap/SKILL.md",
  ]) {
    assert(packedPaths.has(required), `npm package is missing ${required}`)
  }

  for (const filePath of packedPaths) {
    assert(!filePath.startsWith("src/"), `npm package should not include source file: ${filePath}`)
    assert(!filePath.startsWith("tests/"), `npm package should not include test file: ${filePath}`)
  }

  const pack = packEntries(run("npm", ["pack", "--json", "--pack-destination", packTmp]))
  const tarball = join(packTmp, pack[0]!.filename)
  assert(existsSync(tarball), `packed tarball does not exist: ${tarball}`)

  const installDir = join(packTmp, "install")
  mkdirSync(installDir)
  run("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], installDir)

  const bin = join(
    installDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "sitesnap.cmd" : "sitesnap"
  )
  assert(existsSync(bin), `installed sitesnap bin does not exist: ${bin}`)

  const version = run(bin, ["--version"], installDir).trim()
  assert(version === pkg.version, `expected installed CLI version ${pkg.version}, got ${version}`)

  const help = run(bin, ["help"], installDir)
  assert(help.includes("sitesnap capture"), "installed CLI help is missing capture")
  for (const removed of ["sitesnap shot", "sitesnap check", "sitesnap inspect", "sitesnap doctor"]) {
    assert(!help.includes(removed), `installed CLI help still exposes removed command: ${removed}`)
  }

  const listed = JSON.parse(run(bin, ["list"], installDir)) as {
    success?: boolean
    schema_version?: number
    archives?: unknown[]
  }
  assert(listed.success === true, "installed CLI list did not succeed")
  assert(listed.schema_version === 1, "installed CLI list returned an unexpected schema")
  assert(Array.isArray(listed.archives), "installed CLI list did not return archives[]")
  console.log("pack smoke: ok")
} finally {
  rmSync(packTmp, { recursive: true, force: true })
  rmSync(npmCache, { recursive: true, force: true })
}
