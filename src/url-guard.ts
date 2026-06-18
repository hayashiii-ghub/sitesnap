import { SiteSnapError } from "./errors.ts"

const PRIVATE_NAMES = new Set(["localhost", "::1"])

export function isPrivateHost(host: string | null | undefined): boolean {
  if (!host) return false
  // URL.hostname wraps IPv6 addresses in brackets; strip them for matching.
  const h = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (PRIVATE_NAMES.has(h)) return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^169\.254\./.test(h)) return true
  const m = h.match(/^172\.(\d+)\./)
  if (m) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return true
  }
  // IPv6 link-local: fe80::/10
  if (/^fe[89ab][0-9a-f]:/i.test(h)) return true
  // IPv6 unique-local: fc00::/7
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true
  // IPv4-mapped IPv6: ::ffff:wwxx:yyzz → recurse with the dotted-quad form
  const mapped = h.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i)
  if (mapped) {
    const hi = parseInt(mapped[1]!, 16)
    const lo = parseInt(mapped[2]!, 16)
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
    return isPrivateHost(ipv4)
  }
  return false
}

export interface UrlGuardOptions {
  allowPrivate?: boolean
  // file:// (ローカル HTML モックの直撮り) を許可する。shot 専用のオプトイン
  allowFile?: boolean
}

export function assertPublicUrl(url: string, opts: UrlGuardOptions = {}): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SiteSnapError(
      "INVALID_URL",
      `URLの形式が不正です: ${url}`,
      "http:// または https:// で始まる URL を指定してください。",
      { url }
    )
  }
  // file:// は明示的な --allow-file のときだけ許可。host チェックは不要
  if (parsed.protocol === "file:" && opts.allowFile) return
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new SiteSnapError(
      "INVALID_URL",
      `サポートされていないプロトコル: ${parsed.protocol} (http/https のみ対応)`,
      parsed.protocol === "file:"
        ? "ローカルファイルを撮る場合は --allow-file を付けてください。"
        : "http:// または https:// のURLを指定してください。",
      { url }
    )
  }
  if (opts.allowPrivate) return
  if (isPrivateHost(parsed.hostname)) {
    throw new SiteSnapError(
      "PRIVATE_URL_BLOCKED",
      `プライベート/ループバックホストへのアクセスは拒否されます: ${parsed.hostname}`,
      "--allow-private で上書きできます。",
      { url }
    )
  }
}
