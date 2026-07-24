import { expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { loadCaptureUrls, parseCaptureSource } from "../src/input.ts"
import { SiteSnapError } from "../src/errors.ts"
import { cleanupTmpDir, makeTmpDir } from "./helpers.ts"

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }]

test("capture source requires exactly one of URL, sitemap, or input", () => {
  expect(parseCaptureSource(["https://example.com"], null, null)).toEqual({ kind: "page", value: "https://example.com" })
  expect(parseCaptureSource([], "https://example.com/sitemap.xml", null)).toEqual({ kind: "sitemap", value: "https://example.com/sitemap.xml" })
  expect(() => parseCaptureSource(["https://example.com"], "https://example.com/sitemap.xml", null)).toThrow(SiteSnapError)
  expect(() => parseCaptureSource([], null, null)).toThrow(SiteSnapError)
})

test("input files ignore comments/blanks, preserve order, and deduplicate", async () => {
  const dir = await makeTmpDir()
  try {
    const file = path.join(dir, "urls.txt")
    await writeFile(file, "# production\nhttps://b.example/\n\nhttps://a.example/\nhttps://b.example/\n")
    expect(await loadCaptureUrls({ kind: "input", value: file }, { lookup: publicLookup })).toEqual([
      "https://b.example/",
      "https://a.example/",
    ])
  } finally {
    await cleanupTmpDir(dir)
  }
})

test("stdin input is parsed while DNS/private policy is deferred to each host capture", async () => {
  async function* stdin() { yield "https://example.com/\n" }
  expect(await loadCaptureUrls({ kind: "input", value: "-" }, { stdin: stdin(), lookup: publicLookup })).toEqual(["https://example.com/"])
  expect(await loadCaptureUrls({ kind: "page", value: "https://internal.example/" }, {
    lookup: async () => [{ address: "10.0.0.2", family: 4 }],
  })).toEqual(["https://internal.example/"])
  await expect(loadCaptureUrls({ kind: "page", value: "file:///tmp/page.html" })).rejects.toMatchObject({ code: "INVALID_URL" })
  await expect(loadCaptureUrls({ kind: "sitemap", value: "not-a-url" })).rejects.toMatchObject({ code: "INVALID_URL" })
})
