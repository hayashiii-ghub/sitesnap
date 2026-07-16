import { readFile, writeFile, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { DEFAULTS, USER_AGENT, type MobileProfile } from "./config.ts"
import { captureResultKey, mobileOutputRelPath, resolveMobileDevices, slugify } from "./capture.ts"

export interface CaptureResult {
  url: string
  mode: "desktop" | "mobile"
  device?: string
  title?: string
  error?: string
}

export interface PageMeta {
  url: string
  slug: string
  title: string
  desktop: string | null
  mobile: string | null
  mobile_variants?: Record<string, string>
  captured_at: string
  desktop_error: string | null
  mobile_error: string | null
}

export interface SiteMeta {
  domain: string
  source: string | null
  captured_at: string
  pages: PageMeta[]
}

export interface IndexEntry {
  domain: string
  source: string | null
  captured_at: string | null
  pages: number
  captured_pages: number
}

export interface BuildSiteMetaOptions {
  domain: string
  siteDir: string
  urls: string[]
  source?: string | null
  results?: CaptureResult[]
  mobileProfile?: MobileProfile
  // title 補完 fetch 用の追加ヘッダ (認証下のページ向け)
  fetchHeaders?: Record<string, string>
}

async function fetchTitle(url: string, headers?: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, ...(headers || {}) } })
    const html = await res.text()
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    return m ? m[1]!.trim().replace(/\s+/g, " ") : ""
  } catch {
    return ""
  }
}

export async function buildSiteMeta({
  domain,
  siteDir,
  urls,
  source,
  results,
  mobileProfile,
  fetchHeaders,
}: BuildSiteMetaOptions): Promise<SiteMeta> {
  const metaPath = path.join(siteDir, "meta.json")

  let prev: { pages?: PageMeta[]; source?: string | null } = { pages: [] }
  try {
    prev = JSON.parse(await readFile(metaPath, "utf8"))
  } catch {}
  const titleByUrl = new Map((prev.pages || []).map((p) => [p.url, p.title]))

  const resultByKey = new Map<string, CaptureResult>()
  for (const r of results || []) {
    resultByKey.set(captureResultKey(r.url, r.mode, r.device), r)
  }

  const mobileDevices = resolveMobileDevices(mobileProfile)
  const includeMobileVariants = mobileProfile === "broad"
  const defaultMobileDevice = mobileDevices[0]!.name

  const now = new Date().toISOString()
  const pages: PageMeta[] = []
  for (const url of urls) {
    const slug = slugify(url)
    const desktopFile = path.join(siteDir, "desktop", `${slug}.png`)
    const mobileFile = path.join(siteDir, "mobile", `${slug}.png`)
    const dResult = resultByKey.get(captureResultKey(url, "desktop"))
    const mResult = resultByKey.get(captureResultKey(url, "mobile", defaultMobileDevice))

    let title = titleByUrl.get(url) || ""
    if (dResult?.title) title = dResult.title
    if (!title) title = await fetchTitle(url, fetchHeaders)

    const page: PageMeta = {
      url,
      slug,
      title,
      desktop: existsSync(desktopFile) ? `desktop/${slug}.png` : null,
      mobile: existsSync(mobileFile) ? `mobile/${slug}.png` : null,
      captured_at: now,
      desktop_error: dResult?.error || null,
      mobile_error: mResult?.error || null,
    }

    if (includeMobileVariants) {
      const mobile_variants: Record<string, string> = {}
      for (const { name, variantSubdir } of mobileDevices) {
        const relPath = mobileOutputRelPath(slug, variantSubdir)
        if (existsSync(path.join(siteDir, relPath))) {
          mobile_variants[name] = relPath
        }
      }
      if (Object.keys(mobile_variants).length > 0) {
        page.mobile_variants = mobile_variants
      }
    }

    pages.push(page)
  }

  pages.sort((a, b) => a.url.localeCompare(b.url))

  const meta: SiteMeta = {
    domain,
    source: source || prev.source || null,
    captured_at: now,
    pages,
  }

  await writeFile(metaPath, JSON.stringify(meta, null, 2))
  return meta
}

export async function buildIndex(sitesDir: string = DEFAULTS.sitesDir): Promise<IndexEntry[]> {
  if (!existsSync(sitesDir)) return []
  const entries = await readdir(sitesDir, { withFileTypes: true })
  const sites: IndexEntry[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const metaPath = path.join(sitesDir, e.name, "meta.json")
    if (!existsSync(metaPath)) continue
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8")) as SiteMeta
      const totalPages = (meta.pages || []).length
      const captured = (meta.pages || []).filter((p) => p.desktop || p.mobile).length
      sites.push({
        domain: meta.domain || e.name,
        source: meta.source || null,
        captured_at: meta.captured_at || null,
        pages: totalPages,
        captured_pages: captured,
      })
    } catch {}
  }
  sites.sort((a, b) => a.domain.localeCompare(b.domain))
  await writeFile(path.join(sitesDir, "index.json"), JSON.stringify(sites, null, 2))
  return sites
}

export const _fetchTitleForTest = fetchTitle
