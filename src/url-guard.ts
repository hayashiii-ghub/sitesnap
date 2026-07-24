import { lookup as dnsLookup } from "node:dns/promises"
import { isIP } from "node:net"
import { SiteSnapError } from "./errors.ts"

const PRIVATE_NAMES = new Set(["localhost", "::", "::1"])

export function isPrivateHost(host: string | null | undefined): boolean {
  if (!host) return false
  const h = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (PRIVATE_NAMES.has(h)) return true

  const ipv4 = h.split(".").map(Number)
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [first, second, third] = ipv4 as [number, number, number, number]
    if (first === 0 || first === 10 || first === 127) return true
    if (first === 100 && second >= 64 && second <= 127) return true
    if (first === 169 && second === 254) return true
    if (first === 172 && second >= 16 && second <= 31) return true
    if (first === 192 && second === 168) return true
    if (first === 192 && second === 0 && (third === 0 || third === 2)) return true
    if (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) return true
    if (first === 203 && second === 0 && third === 113) return true
    if (first >= 224) return true
  }

  if (/^fe[89ab][0-9a-f]:/i.test(h)) return true
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true
  if (/^ff[0-9a-f]{2}:/i.test(h) || /^2001:db8:/i.test(h)) return true

  const mapped = h.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i)
  if (mapped) {
    const hi = parseInt(mapped[1]!, 16)
    const lo = parseInt(mapped[2]!, 16)
    return isPrivateHost(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`)
  }
  return false
}

export interface UrlGuardOptions {
  allowPrivate?: boolean
}

export interface ResolvedAddress {
  address: string
  family: number
}

export type HostLookup = (hostname: string) => Promise<ResolvedAddress[]>

export interface ResolvedUrlGuardOptions extends UrlGuardOptions {
  lookup?: HostLookup
}

export function assertPublicUrl(url: string, opts: UrlGuardOptions = {}): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SiteSnapError("INVALID_URL", `URLの形式が不正です: ${url}`, "http:// または https:// で始まるURLを指定してください。", { url })
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SiteSnapError("INVALID_URL", `サポートされていないプロトコル: ${parsed.protocol}`, "http:// または https:// のURLを指定してください。", { url })
  }
  if (!parsed.hostname || parsed.hostname === "." || parsed.hostname === "..") {
    throw new SiteSnapError("INVALID_URL", `安全でないホスト名です: ${parsed.hostname || "(empty)"}`, "有効なホスト名を持つURLを指定してください。", { url })
  }
  if (!opts.allowPrivate && isPrivateHost(parsed.hostname)) {
    throw new SiteSnapError("PRIVATE_URL_BLOCKED", `プライベート/特殊用途ホストへのアクセスは拒否されます: ${parsed.hostname}`, "意図したprivate targetの場合のみ--allow-privateで上書きできます。", { url })
  }
}

export async function assertPublicUrlResolved(url: string, opts: ResolvedUrlGuardOptions = {}): Promise<void> {
  assertPublicUrl(url, opts)
  if (opts.allowPrivate) return
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "")
  if (isIP(hostname)) return

  let addresses: ResolvedAddress[]
  try {
    addresses = await (opts.lookup ?? ((host) => dnsLookup(host, { all: true, verbatim: true })))(hostname)
  } catch {
    throw new SiteSnapError("URL_RESOLUTION_FAILED", `ホスト名を解決できません: ${hostname}`, "DNS設定とURLを確認してください。", { url })
  }
  if (addresses.length === 0) {
    throw new SiteSnapError("URL_RESOLUTION_FAILED", `ホスト名の解決結果がありません: ${hostname}`, "DNS設定とURLを確認してください。", { url })
  }
  const blocked = addresses.find(({ address }) => isPrivateHost(address))
  if (blocked) {
    throw new SiteSnapError("PRIVATE_URL_BLOCKED", `プライベート/特殊用途IPへのアクセスは拒否されます: ${hostname} -> ${blocked.address}`, "意図したprivate targetの場合のみ--allow-privateで上書きできます。", { url })
  }
}
