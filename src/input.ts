import { readFile } from "node:fs/promises"
import { SiteSnapError } from "./errors.ts"
import { expandSitemap } from "./sitemap.ts"
import { assertPublicUrl, type HostLookup } from "./url-guard.ts"

export type CaptureSource =
  | { kind: "page"; value: string }
  | { kind: "sitemap"; value: string }
  | { kind: "input"; value: string }

export type RunSource = CaptureSource | { kind: "retry"; value: string }

export function parseCaptureSource(args: string[], sitemap: string | null, input: string | null): CaptureSource {
  const sources: CaptureSource[] = []
  if (args.length === 1) sources.push({ kind: "page", value: args[0]! })
  if (sitemap) sources.push({ kind: "sitemap", value: sitemap })
  if (input) sources.push({ kind: "input", value: input })
  if (args.length > 1 || sources.length !== 1) {
    throw new SiteSnapError("INVALID_OPTION", "captureにはURL、--sitemap、--inputのいずれか1つを指定してください", "sitesnap capture <url>、--sitemap <url>、--input <file|->のいずれかを使用してください。")
  }
  return sources[0]!
}

export interface LoadCaptureUrlsOptions {
  allowPrivate?: boolean
  headers?: Record<string, string>
  stdin?: AsyncIterable<Uint8Array | string>
  lookup?: HostLookup
}

async function readStdin(stream: AsyncIterable<Uint8Array | string>): Promise<string> {
  let content = ""
  for await (const chunk of stream) content += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8")
  return content
}

export async function loadCaptureUrls(source: CaptureSource, opts: LoadCaptureUrlsOptions = {}): Promise<string[]> {
  let urls: string[]
  if (source.kind === "page") {
    urls = [source.value]
  } else if (source.kind === "sitemap") {
    urls = await expandSitemap(source.value, {
      allowPrivate: opts.allowPrivate,
      headers: opts.headers,
      lookup: opts.lookup,
    })
  } else {
    let content: string
    try {
      content = source.value === "-"
        ? await readStdin(opts.stdin ?? (process.stdin as AsyncIterable<Uint8Array>))
        : await readFile(source.value, "utf8")
    } catch {
      throw new SiteSnapError("INPUT_READ_FAILED", `URL入力を読み込めません: ${source.value}`, "読み取り可能な改行区切りファイル、またはstdinには-を指定してください。", { output: source.value })
    }
    urls = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
  }
  const unique = [...new Set(urls)]
  for (const url of unique) assertPublicUrl(url, { allowPrivate: true })
  return unique
}
