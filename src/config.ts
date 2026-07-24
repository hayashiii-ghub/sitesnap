import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))

export const VERSION: string = pkg.version
export const USER_AGENT: string = `sitesnap/${VERSION} (+${pkg.homepage})`

export const DEFAULTS = {
  viewports: {
    desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
    mobile: "iPhone 15",
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
