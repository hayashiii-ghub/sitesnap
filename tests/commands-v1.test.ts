import { expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseCliArgs } from "../src/cli-args.ts"
import { archiveFileStem } from "../src/capture.ts"
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

test("capture rejects an empty URL set after input filtering", async () => {
  const out = await makeTmpDir()
  try {
    const input = path.join(out, "empty.txt")
    await writeFile(input, "# no targets\n\n")
    const context = parseCliArgs(["capture", "--input", input, "--out", out], {})
    await expect(buildCommands().capture!(context)).rejects.toMatchObject({ code: "INVALID_URL" })
  } finally {
    await cleanupTmpDir(out)
  }
})

test("authenticated sitemap rejects cross-origin pages before browser work", async () => {
  let pageRequests = 0
  const page = Bun.serve({
    port: 0,
    fetch() {
      pageRequests += 1
      return new Response("<html><body>must not be reached</body></html>", { headers: { "content-type": "text/html" } })
    },
  })
  const sitemapAuthorizations: Array<string | null> = []
  const sitemap = Bun.serve({
    port: 0,
    fetch(request) {
      sitemapAuthorizations.push(request.headers.get("authorization"))
      return new Response(`<urlset><url><loc>http://127.0.0.1:${page.port}/page</loc></url></urlset>`, {
        headers: { "content-type": "application/xml" },
      })
    },
  })
  const out = await makeTmpDir()
  try {
    const context = parseCliArgs([
      "capture",
      "--sitemap", `http://127.0.0.1:${sitemap.port}/sitemap.xml`,
      "--header", "Authorization: Bearer sitemap-secret",
      "--allow-private",
      "--out", out,
    ], {})
    await expect(buildCommands().capture!(context)).rejects.toMatchObject({ code: "INVALID_OPTION" })
    expect(sitemapAuthorizations).toEqual(["Bearer sitemap-secret"])
    expect(pageRequests).toBe(0)
  } finally {
    sitemap.stop(true)
    page.stop(true)
    await cleanupTmpDir(out)
  }
})

test("a corrupt host manifest is preserved and does not stop later hosts", async () => {
  const requests: string[] = []
  const web = Bun.serve({
    port: 0,
    fetch(request) {
      requests.push(new URL(request.url).pathname)
      return new Response("<html><body>ok</body></html>", { headers: { "content-type": "text/html" } })
    },
  })
  const out = await makeTmpDir()
  const corruptFile = path.join(out, "127.0.0.1", "manifest.json")
  try {
    await mkdir(path.dirname(corruptFile), { recursive: true })
    const original = '{"schema_version":99,"keep":true}\n'
    await writeFile(corruptFile, original)
    const protectedScreenshot = path.join(
      out,
      "127.0.0.1",
      "screenshots",
      "desktop",
      `${archiveFileStem(`http://127.0.0.1:${web.port}/first`)}.png`,
    )
    await mkdir(path.dirname(protectedScreenshot), { recursive: true })
    await writeFile(protectedScreenshot, "existing screenshot")
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
    expect(await readFile(protectedScreenshot, "utf8")).toBe("existing screenshot")
    expect(requests).not.toContain("/first")
    expect(requests).toContain("/second")
  } finally {
    web.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("DNS/private failures are isolated per host before browser launch", async () => {
  const out = await makeTmpDir()
  try {
    const input = path.join(out, "urls.txt")
    await writeFile(input, "https://unresolved.example/\nhttp://127.0.0.1/\n")
    const context = makeCtx({
      sub: "capture",
      input,
      outDir: out,
      captureOptions: { outDir: out, lookup: async () => { throw new Error("DNS unavailable") } },
    })
    const result = await buildCommands().capture!(context)
    const payload = JSON.parse(result.stdout)
    expect(payload.archives.map((archive: { domain: string }) => archive.domain)).toEqual(["unresolved.example", "127.0.0.1"])
    expect(payload.archives.every((archive: { status: string }) => archive.status === "failed")).toBeTrue()
  } finally {
    await cleanupTmpDir(out)
  }
})

test("an unrelated corrupt archive is reported by the index without failing a healthy capture", async () => {
  const web = Bun.serve({ port: 0, fetch: () => new Response("<html><body>ok</body></html>", { headers: { "content-type": "text/html" } }) })
  const out = await makeTmpDir()
  const corruptFile = path.join(out, "corrupt.example", "manifest.json")
  try {
    await mkdir(path.dirname(corruptFile), { recursive: true })
    await writeFile(corruptFile, '{"schema_version":99,"keep":true}\n')
    const context = parseCliArgs(["capture", `http://127.0.0.1:${web.port}/`, "--out", out, "--allow-private", "--pre-scroll", "none"], {})
    const result = await buildCommands().capture!(context)
    const payload = JSON.parse(result.stdout)
    expect(result.exitCode).toBe(0)
    expect(payload.status).toBe("complete")
    expect(payload.index_status).toBe("partial")
    expect(payload.index_errors).toHaveLength(1)
  } finally {
    web.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)

test("a run-artifact failure still reports the committed manifest", async () => {
  const web = Bun.serve({ port: 0, fetch: () => new Response("<html><body>ok</body></html>", { headers: { "content-type": "text/html" } }) })
  const out = await makeTmpDir()
  try {
    const siteDir = path.join(out, "127.0.0.1")
    await mkdir(siteDir, { recursive: true })
    await writeFile(path.join(siteDir, "runs"), "blocks runs directory")
    const context = parseCliArgs(["capture", `http://127.0.0.1:${web.port}/`, "--out", out, "--allow-private", "--pre-scroll", "none"], {})
    const result = await buildCommands().capture!(context)
    const payload = JSON.parse(result.stdout)
    expect(result.exitCode).toBe(1)
    expect(payload.archives[0].manifest).toBe(path.join(siteDir, "manifest.json"))
    expect(payload.archives[0].run_artifact).toBeNull()
    expect(payload.archives[0].archive_status).toBe("complete")
  } finally {
    web.stop(true)
    await cleanupTmpDir(out)
  }
}, 60000)
