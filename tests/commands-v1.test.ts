import { expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseCliArgs } from "../src/cli-args.ts"
import { buildCommands } from "../src/commands.ts"
import { readArchiveManifest } from "../src/manifest.ts"
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts"

test("capture isolates hosts, preserves both archives, and reports partial status", async () => {
  const good = Bun.serve({ port: 0, fetch: () => new Response("<html><title>good</title><body>ok</body></html>", { headers: { "content-type": "text/html" } }) })
  const bad = Bun.serve({ port: 0, fetch: () => new Response("<html><title>bad</title><body>bad</body></html>", { status: 500, headers: { "content-type": "text/html" } }) })
  const out = await makeTmpDir()
  try {
    const input = path.join(out, "urls.txt")
    await writeFile(input, `http://127.0.0.1:${good.port}/\nhttp://localhost:${bad.port}/\n`)
    const context = parseCliArgs(["capture", "--input", input, "--out", out, "--allow-private", "--pre-scroll", "none"], {})
    const result = await buildCommands().capture!(context)
    const payload = JSON.parse(result.stdout)
    expect(result.exitCode).toBe(1)
    expect(payload.success).toBeFalse()
    expect(payload.status).toBe("partial")
    expect(payload.archives).toHaveLength(2)
    expect(payload.archives.map((archive: { domain: string }) => archive.domain)).toEqual(["127.0.0.1", "localhost"])
    expect(await readArchiveManifest(path.join(out, "127.0.0.1"))).not.toBeNull()
    expect(await readArchiveManifest(path.join(out, "localhost"))).not.toBeNull()
  } finally {
    good.stop(true)
    bad.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("retry repairs only failed captures while preserving original source history", async () => {
  let status = 500
  const web = Bun.serve({
    port: 0,
    fetch: () => new Response("<html><title>page</title><body>ok</body></html>", { status, headers: { "content-type": "text/html" } }),
  })
  const out = await makeTmpDir()
  const url = `http://127.0.0.1:${web.port}/`
  try {
    const captureContext = parseCliArgs(["capture", url, "--out", out, "--allow-private", "--pre-scroll", "none", "--header", "X-Secret: top-secret"], {})
    const first = await buildCommands().capture!(captureContext)
    expect(JSON.parse(first.stdout).status).toBe("failed")

    status = 200
    const retryContext = parseCliArgs(["retry", "127.0.0.1", "--out", out, "--allow-private", "--pre-scroll", "none"], {})
    const retried = await buildCommands().retry!(retryContext)
    expect(retried.exitCode).toBe(0)
    expect(JSON.parse(retried.stdout).status).toBe("complete")
    const manifest = await readArchiveManifest(path.join(out, "127.0.0.1"))
    expect(manifest?.sources).toEqual([{ kind: "page", value: url }])
    const latest = await readFile(path.join(out, "127.0.0.1", "runs", "latest.json"), "utf8")
    expect(JSON.parse(latest).source).toEqual({ kind: "retry", value: "127.0.0.1" })
    expect(latest).not.toContain("top-secret")
  } finally {
    web.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("origin-scoped credentials reject mixed-origin input before browser work", async () => {
  const out = await makeTmpDir()
  try {
    const input = path.join(out, "urls.txt")
    await writeFile(input, "https://a.example/\nhttps://b.example/\n")
    const context = makeCtx({
      sub: "capture",
      input,
      outDir: out,
      captureOptions: {
        outDir: out,
        headers: { Authorization: "Bearer secret" },
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      },
    })
    await expect(buildCommands().capture!(context)).rejects.toMatchObject({ code: "INVALID_OPTION" })
  } finally {
    await cleanupTmpDir(out)
  }
})

test("a corrupt host manifest is preserved and does not stop later hosts", async () => {
  const web = Bun.serve({ port: 0, fetch: () => new Response("<html><body>ok</body></html>", { headers: { "content-type": "text/html" } }) })
  const out = await makeTmpDir()
  const corruptFile = path.join(out, "127.0.0.1", "manifest.json")
  try {
    await mkdir(path.dirname(corruptFile), { recursive: true })
    const original = '{"schema_version":99,"keep":true}\n'
    await writeFile(corruptFile, original)
    const input = path.join(out, "urls.txt")
    await writeFile(input, `http://127.0.0.1:${web.port}/first\nhttp://localhost:${web.port}/second\n`)
    const context = parseCliArgs(["capture", "--input", input, "--out", out, "--allow-private", "--pre-scroll", "none"], {})
    const result = await buildCommands().capture!(context)
    const payload = JSON.parse(result.stdout)
    expect(result.exitCode).toBe(1)
    expect(payload.archives).toHaveLength(2)
    expect(payload.archives[0].manifest).toBeNull()
    expect(payload.archives[1].manifest).toEndWith("localhost/manifest.json")
    expect(await readFile(corruptFile, "utf8")).toBe(original)
  } finally {
    web.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)
