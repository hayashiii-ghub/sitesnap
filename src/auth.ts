import { readFileSync } from "node:fs"
import path from "node:path"
import { SiteSnapError } from "./errors.ts"

// capture / retry で共通の認証オプション。
// - storageState: Playwright storage state JSON (cookies + localStorage) のパス。
//   `sitesnap login` か `playwright codegen --save-storage` で作る
// - headers: capture対象originにだけ付与する追加ヘッダ (Bearer トークン等)
// - httpCredentials: HTTP Basic 認証 (ステージング環境向け)
export interface AuthOptions {
  storageState?: string
  headers?: Record<string, string>
  httpCredentials?: { username: string; password: string }
}

// `--header "Name: value"` を [name, value] に分解する。値側の ":" は保持する
export function parseHeaderFlag(value: string): [string, string] {
  const idx = value.indexOf(":")
  const name = idx === -1 ? "" : value.slice(0, idx).trim()
  const headerValue = idx === -1 ? "" : value.slice(idx + 1).trim()
  if (!name || !headerValue) {
    throw new SiteSnapError(
      "INVALID_OPTION",
      "--header の形式が不正です",
      '--header "Name: value" の形式で指定してください (例: --header "Authorization: Bearer TOKEN")。',
      {}
    )
  }
  return [name, headerValue]
}

// `--http-credentials user:pass` を分解する。パスワード側の ":" は保持する
export function parseHttpCredentials(value: string): { username: string; password: string } {
  const idx = value.indexOf(":")
  const username = idx === -1 ? "" : value.slice(0, idx)
  const password = idx === -1 ? "" : value.slice(idx + 1)
  if (!username || !password) {
    throw new SiteSnapError(
      "INVALID_OPTION",
      "--http-credentials の形式が不正です",
      "--http-credentials <user>:<pass> の形式で指定してください (SITESNAP_HTTP_CREDENTIALS 環境変数でも指定可)。",
      {}
    )
  }
  return { username, password }
}

// storage state ファイルを検証して絶対パスを返す。Playwright は不正ファイルを
// 生のエラーで落とすので、ここで code + hint 付きの構造化エラーに変換しておく
export function resolveStorageStatePath(file: string): string {
  const resolved = path.resolve(file)
  let raw: string
  try {
    raw = readFileSync(resolved, "utf8")
  } catch {
    throw new SiteSnapError(
      "STORAGE_STATE_NOT_FOUND",
      `storage state ファイルが見つかりません: ${resolved}`,
      "sitesnap login <url> でログイン状態を保存してから --storage-state に渡してください。",
      { output: resolved }
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SiteSnapError(
      "STORAGE_STATE_INVALID",
      `storage state が JSON として解析できません: ${resolved}`,
      "sitesnap login <url> で作り直してください (Playwright storageState 形式の JSON が必要です)。",
      { output: resolved }
    )
  }
  const state = parsed as { cookies?: unknown; origins?: unknown }
  if (!Array.isArray(state.cookies) && !Array.isArray(state.origins)) {
    throw new SiteSnapError(
      "STORAGE_STATE_INVALID",
      `storage state に cookies / origins がありません: ${resolved}`,
      "Playwright storageState 形式 ({cookies:[], origins:[]}) の JSON を指定してください。sitesnap login <url> で作れます。",
      { output: resolved }
    )
  }
  return resolved
}

// browser.newContext に spread する認証系オプション
export function authContextOptions(opts: AuthOptions, credentialsOrigin?: string): {
  storageState?: string
  extraHTTPHeaders?: Record<string, string>
  httpCredentials?: { username: string; password: string; origin?: string }
} {
  return {
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
    ...(opts.headers && Object.keys(opts.headers).length > 0 ? { extraHTTPHeaders: opts.headers } : {}),
    ...(opts.httpCredentials
      ? { httpCredentials: { ...opts.httpCredentials, ...(credentialsOrigin ? { origin: credentialsOrigin } : {}) } }
      : {}),
  }
}

// sitemap / meta の素の fetch に付与するヘッダ。--http-credentials も
// Authorization: Basic として反映する (認証下の sitemap.xml 向け)
export function authFetchHeaders(opts: AuthOptions, base: Record<string, string>): Record<string, string> {
  const headers = { ...base, ...(opts.headers || {}) }
  if (opts.httpCredentials && !("authorization" in lowerKeys(headers))) {
    const { username, password } = opts.httpCredentials
    headers["authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
  }
  return headers
}

function lowerKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v
  return out
}

// run 成果物 (options.json) にシークレットを書き残さないための redaction。
// storage state はパスのみ (中身は書かない) なのでそのまま残す
export function redactAuthOptions<T extends AuthOptions>(opts: T): T {
  const redacted = { ...opts }
  if (redacted.headers) {
    redacted.headers = Object.fromEntries(Object.keys(redacted.headers).map((k) => [k, "<redacted>"]))
  }
  if (redacted.httpCredentials) {
    redacted.httpCredentials = { username: "<redacted>", password: "<redacted>" }
  }
  return redacted
}
