import path from "node:path"
import { parseHeaderFlag, parseHttpCredentials, resolveStorageStatePath } from "./auth.ts"
import type { CaptureOptions } from "./capture.ts"
import { DEFAULTS } from "./config.ts"
import { SiteSnapError } from "./errors.ts"
import { createHostRateLimiter, type HostRateLimiter } from "./rate-limit.ts"

export const HELP = `
sitesnap — AIエージェント向けのサイト収集・スクリーンショットarchive CLI

使い方:
  sitesnap capture <url>             1ページをdesktop/mobileで収集
  sitesnap capture --sitemap <url>  sitemap内のページを収集
  sitesnap capture --input <file|-> 改行区切りURLを収集（- はstdin）
  sitesnap retry <domain>            manifest内の失敗captureだけ再実行
  sitesnap list                      archive一覧をJSONで取得
  sitesnap login <url>               ログイン状態をstorage stateへ保存
  sitesnap help                      このヘルプを表示
  sitesnap --version                 バージョン番号を表示

出力:
  実行コマンドは常にJSONをstdoutへ出力します。進捗ログはstderrです。
  --json は明示しても構いません（互換用のno-op）。

capture入力（いずれか1つ）:
  <url>                              単一ページ
  --sitemap <url>                    sitemap / sitemap index
  --input <file|->                   改行区切りURL。空行と#コメントは無視

収集オプション (capture / retry):
  --out <dir>                        archive出力先（既定: ./sites）
  --concurrency <N>                  同時capture数（既定: 3）
  --min-interval <ms>                同一hostへの最小アクセス間隔
  --wait-ms <ms>                     撮影前の追加待機
  --pre-scroll <full-page|none>      lazy-load用の事前scroll（既定: full-page）
  --force-visible                    scroll reveal要素を強制表示
  --allow-private                    localhost/private networkを許可
  --storage-state <file>             Playwright storage state
  --header "Name: value"             対象originだけに追加headerを送る（反復可）
  --http-credentials <user:pass>     対象originのHTTP Basic認証

capture限定:
  --limit <N>                        filter後の先頭N URLだけ収集
  --exclude <regex>                  一致するURLを除外

login限定:
  -o, --out-file <file>              保存先（既定: ./sitesnap-state.json）

例:
  sitesnap capture https://example.com/
  sitesnap capture --sitemap https://example.com/sitemap.xml --limit 20
  sitesnap capture --input urls.txt --out ./sites
  printf '%s\n' https://a.example/ https://b.example/ | sitesnap capture --input -
  sitesnap retry example.com
  sitesnap list
`

export interface CliContext {
  sub: string | undefined
  args: string[]
  json: true
  outDir: string
  outFile: string | null
  sitemap: string | null
  input: string | null
  limit: number | null
  exclude: RegExp | null
  captureOptions: CaptureOptions
  rateLimiter?: HostRateLimiter
}

function invalidOption(message: string, hint = "sitesnap help で利用可能なオプションを確認してください。"): SiteSnapError {
  return new SiteSnapError("INVALID_OPTION", message, hint)
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw invalidOption(`${flag}には正の整数を指定してください`, `${flag} <N> の形式で指定してください。`)
  return parsed
}

function nonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw invalidOption(`${flag}には0以上の整数を指定してください`, `${flag} <ms> の形式で指定してください。`)
  return parsed
}

const commands = new Set(["capture", "retry", "list", "login", "help"])
const booleanFlags = new Set(["--json", "--force-visible", "--allow-private"])
const valueFlags = new Set([
  "--out", "--out-file", "-o", "--sitemap", "--input", "--limit", "--exclude",
  "--concurrency", "--min-interval", "--wait-ms", "--pre-scroll", "--storage-state",
  "--header", "--http-credentials",
])

const allowedByCommand: Record<string, Set<string>> = {
  capture: new Set([...booleanFlags, "--out", "--sitemap", "--input", "--limit", "--exclude", "--concurrency", "--min-interval", "--wait-ms", "--pre-scroll", "--storage-state", "--header", "--http-credentials"]),
  retry: new Set([...booleanFlags, "--out", "--concurrency", "--min-interval", "--wait-ms", "--pre-scroll", "--storage-state", "--header", "--http-credentials"]),
  list: new Set(["--json", "--out"]),
  login: new Set(["--json", "--allow-private", "--out-file", "-o"]),
  help: new Set(),
}

export function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliContext {
  const sub = argv[0]
  if (sub && !sub.startsWith("-") && !commands.has(sub)) {
    throw invalidOption(`不明なコマンドです: ${sub}`, "sitesnap help でコマンドを確認してください。")
  }
  if (!sub || sub.startsWith("-")) {
    return {
      sub,
      args: [],
      json: true,
      outDir: path.resolve(env.SITESNAP_OUT || DEFAULTS.sitesDir),
      outFile: null,
      sitemap: null,
      input: null,
      limit: null,
      exclude: null,
      captureOptions: {},
    }
  }

  const allowed = allowedByCommand[sub]!
  const args: string[] = []
  const headers: Record<string, string> = {}
  let outDir = env.SITESNAP_OUT || DEFAULTS.sitesDir
  let outFile: string | null = null
  let sitemap: string | null = null
  let input: string | null = null
  let limit: number | null = null
  let exclude: RegExp | null = null
  let concurrency: number | undefined
  let minInterval: number | undefined
  let waitMs: number | undefined
  let preScroll: "full-page" | "none" | undefined
  let forceVisible = false
  let allowPrivate = false
  let storageState: string | undefined
  let httpCredentials: { username: string; password: string } | undefined

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!
    if (!token.startsWith("-")) {
      args.push(token)
      continue
    }
    if (!booleanFlags.has(token) && !valueFlags.has(token)) throw invalidOption(`不明なオプションです: ${token}`)
    if (!allowed.has(token)) throw invalidOption(`${token}は${sub}コマンドでは使用できません`)
    if (booleanFlags.has(token)) {
      if (token === "--force-visible") forceVisible = true
      if (token === "--allow-private") allowPrivate = true
      continue
    }
    const value = argv[++index]
    if (value === undefined || value.startsWith("--")) throw invalidOption(`${token}の値が不足しています`)
    switch (token) {
      case "--out": outDir = value; break
      case "--out-file":
      case "-o": outFile = path.resolve(value); break
      case "--sitemap": sitemap = value; break
      case "--input": input = value; break
      case "--limit": limit = positiveInteger(value, token); break
      case "--exclude":
        try { exclude = new RegExp(value) } catch { throw invalidOption(`--excludeの正規表現が不正です: ${value}`) }
        break
      case "--concurrency": concurrency = positiveInteger(value, token); break
      case "--min-interval": minInterval = nonNegativeInteger(value, token); break
      case "--wait-ms": waitMs = nonNegativeInteger(value, token); break
      case "--pre-scroll":
        if (value !== "full-page" && value !== "none") throw invalidOption("--pre-scrollはfull-pageまたはnoneを指定してください")
        preScroll = value
        break
      case "--storage-state": storageState = resolveStorageStatePath(value); break
      case "--header": {
        const [name, headerValue] = parseHeaderFlag(value)
        headers[name] = headerValue
        break
      }
      case "--http-credentials": httpCredentials = parseHttpCredentials(value); break
    }
  }

  const maxArgs = sub === "list" || sub === "help" ? 0 : 1
  if (args.length > maxArgs) throw invalidOption(`${sub}コマンドの引数が多すぎます`)
  if (sub !== "capture" && (sitemap || input || limit || exclude)) throw invalidOption(`入力filterはcaptureコマンドだけで使用できます`)
  if (sub !== "capture" && sub !== "retry" && (concurrency !== undefined || minInterval !== undefined || waitMs !== undefined || preScroll || forceVisible || storageState || Object.keys(headers).length || httpCredentials)) {
    throw invalidOption(`収集オプションはcaptureまたはretryで使用してください`)
  }
  if (sub === "login" && !args[0]) throw invalidOption("loginにはURLが必要です", "sitesnap login <url> の形式で指定してください。")
  if (sub === "retry" && !args[0]) throw invalidOption("retryにはdomainが必要です", "sitesnap retry <domain> の形式で指定してください。")

  if ((sub === "capture" || sub === "retry") && !httpCredentials && env.SITESNAP_HTTP_CREDENTIALS) {
    httpCredentials = parseHttpCredentials(env.SITESNAP_HTTP_CREDENTIALS)
  }
  const captureOptions: CaptureOptions = {
    outDir: path.resolve(outDir),
    ...(concurrency !== undefined ? { concurrency } : {}),
    ...(forceVisible ? { forceVisible: true } : {}),
    ...(waitMs !== undefined ? { waitMs } : {}),
    ...(preScroll ? { preScroll } : {}),
    ...(allowPrivate ? { allowPrivate: true } : {}),
    ...(storageState ? { storageState } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(httpCredentials ? { httpCredentials } : {}),
  }
  return {
    sub,
    args,
    json: true,
    outDir: path.resolve(outDir),
    outFile,
    sitemap,
    input,
    limit,
    exclude,
    captureOptions,
    ...(minInterval !== undefined && minInterval > 0 ? { rateLimiter: createHostRateLimiter(minInterval) } : {}),
  }
}
