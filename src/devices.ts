import { devices } from "playwright"
import { DEFAULTS } from "./config.ts"
import { SiteSnapError } from "./errors.ts"

export function defaultMobileDeviceName(): string {
  const v = DEFAULTS.viewports.mobile
  if (typeof v !== "string") {
    throw new Error("DEFAULTS.viewports.mobile must be a Playwright device name")
  }
  return v
}

export function deviceDescriptorFor(name: string) {
  const d = devices[name]
  if (!d) {
    throw new SiteSnapError(
      "UNKNOWN_DEVICE",
      `不明なデバイス名です: ${name}`,
      `Playwright のデバイス名を指定してください (例: "iPhone 17", "iPad Pro 11", "Pixel 10")。`,
      {}
    )
  }
  return d
}

export function deviceContextOptions(name: string) {
  const d = deviceDescriptorFor(name)
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = d
  return { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent }
}
