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
    mobile: "iPhone 13",
  },
  locale: "ja-JP",
  timezone: "Asia/Tokyo",
  concurrency: 3,
  navigationTimeout: 45000,
  scrollStep: 400,
  scrollInterval: 120,
  postScrollWait: 600,
  sitesDir: "sites",
  maxSitemapDepth: 5,
  minIntervalMs: 0,
} as const
