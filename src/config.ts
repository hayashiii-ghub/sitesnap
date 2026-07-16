import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import os from "node:os"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))

export const VERSION: string = pkg.version
export const USER_AGENT: string = `sitesnap/${VERSION} (+${pkg.homepage})`

export const DEFAULTS = {
  viewports: {
    desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    mobile: "iPhone 17",
  },
  locale: "ja-JP",
  timezone: "Asia/Tokyo",
  concurrency: 3,
  navigationTimeout: 45000,
  // load 後に networkidle を待つ上限。広告等で常時通信するサイトは
  // networkidle に到達しないため、これを超えたら待たずに撮影へ進む
  networkIdleTimeout: 10000,
  scrollStep: 400,
  scrollInterval: 120,
  postScrollWait: 600,
  sitesDir: "sites",
  maxSitemapDepth: 5,
  minIntervalMs: 0,
} as const

/** site/page の --mobile-profile broad で撮る端末一覧 (先頭がデフォルト = mobile/<slug>.png) */
export const MOBILE_PROFILE_BROAD = ["iPhone 17", "iPhone SE (3rd gen)", "Pixel 10"] as const

/** broad プロファイルの追加端末 → mobile/ 配下サブディレクトリ */
export const MOBILE_VARIANT_SUBDIRS: Record<string, string> = {
  "iPhone SE (3rd gen)": "iphone-se-3rd-gen",
  "Pixel 10": "pixel-10",
}

export type MobileProfile = "broad"

// shot は「使い捨て」用途なので、--out を明示しない限り cwd ではなく
// OS のキャッシュ領域に出す (無関係な git repo を汚さないため)。
// site/page のアーカイブは従来どおり ./sites/。
export function shotCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache")
  return path.join(base, "sitesnap")
}
