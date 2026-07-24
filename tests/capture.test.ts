import { expect, test } from "bun:test"
import path from "node:path"
import {
  archiveDirectoryName,
  archiveFileStem,
  archiveSiteDir,
  buildCaptureTasks,
  captureUrls,
  groupUrlsByHost,
  slugify,
} from "../src/capture.ts"

test("archive filename is readable, stable, and query-safe", () => {
  expect(slugify("https://example.com/about/team")).toBe("about_team")
  const first = archiveFileStem("https://example.com/products?page=1")
  const second = archiveFileStem("https://example.com/products?page=2")
  expect(first).toMatch(/^products--[0-9a-f]{16}$/)
  expect(first).not.toBe(second)
})

test("archive paths encode host names and cannot escape the output root", () => {
  expect(archiveDirectoryName("example.com")).toBe("example.com")
  expect(archiveDirectoryName("::1")).toBe("%3A%3A1")
  expect(() => archiveDirectoryName("..")).toThrow()
  const root = path.resolve("/tmp/sitesnap-root")
  expect(archiveSiteDir(root, "example.com")).toBe(path.join(root, "example.com"))
})

test("capture tasks always define desktop and mobile evidence in input order", () => {
  const urls = ["https://a.test/", "https://a.test/about"]
  const tasks = buildCaptureTasks(urls)
  expect(tasks.map(({ url, mode }) => `${url}:${mode}`)).toEqual([
    "https://a.test/:desktop",
    "https://a.test/:mobile",
    "https://a.test/about:desktop",
    "https://a.test/about:mobile",
  ])
  expect(tasks[1]?.device).toBe("iPhone 15")
})

test("URL grouping preserves first host and URL order", () => {
  expect(groupUrlsByHost(["https://b.test/1", "https://a.test/2", "https://b.test/3"])).toEqual([
    ["b.test", ["https://b.test/1", "https://b.test/3"]],
    ["a.test", ["https://a.test/2"]],
  ])
})

test("captureUrls rejects empty, private, and mixed-host input", async () => {
  await expect(captureUrls([])).rejects.toThrow(/URL/)
  await expect(captureUrls(["http://127.0.0.1/"])).rejects.toThrow(/private|プライベート|許可/i)
  await expect(captureUrls(["https://a.test/", "https://b.test/"])).rejects.toThrow(/複数host/)
})
