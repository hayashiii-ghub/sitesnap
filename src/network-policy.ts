import type { BrowserContext } from "playwright"
import type { AuthOptions } from "./auth.ts"
import { assertPublicUrlResolved, type HostLookup } from "./url-guard.ts"

export interface NetworkPolicyOptions extends Pick<AuthOptions, "headers"> {
  allowPrivate?: boolean
  authOrigin?: string
  lookup?: HostLookup
}

export async function installNetworkPolicy(
  context: BrowserContext,
  targetUrl: string,
  opts: NetworkPolicyOptions
): Promise<() => Error | undefined> {
  const authOrigin = opts.authOrigin ?? new URL(targetUrl).origin
  const customHeaders = opts.headers ?? {}
  const customNames = new Set(Object.keys(customHeaders).map((name) => name.toLowerCase()))
  const checked = new Map<string, Promise<void>>()
  let policyError: Error | undefined

  const validate = (rawUrl: string) => {
    const parsed = new URL(rawUrl)
    if (parsed.protocol === "ws:") parsed.protocol = "http:"
    if (parsed.protocol === "wss:") parsed.protocol = "https:"
    const existing = checked.get(parsed.origin)
    if (existing) return existing
    const pending = assertPublicUrlResolved(parsed.href, { allowPrivate: opts.allowPrivate, lookup: opts.lookup })
    checked.set(parsed.origin, pending)
    return pending
  }

  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url()
    try {
      await validate(requestUrl)
    } catch (error) {
      policyError ??= error as Error
      await route.abort("blockedbyclient")
      return
    }

    if (customNames.size === 0) {
      await route.continue()
      return
    }
    const headers = Object.fromEntries(
      Object.entries(route.request().headers()).filter(([name]) => !customNames.has(name.toLowerCase()))
    )
    if (new URL(requestUrl).origin === authOrigin) {
      Object.assign(headers, customHeaders)
      try {
        const response = await route.fetch({ headers, maxRedirects: 0 })
        await route.fulfill({ response })
      } catch (error) {
        policyError ??= error as Error
        await route.abort("failed")
      }
      return
    }
    await route.continue({ headers })
  })

  await context.routeWebSocket("**/*", async (webSocket) => {
    try {
      await validate(webSocket.url())
      webSocket.connectToServer()
    } catch (error) {
      policyError ??= error as Error
      await webSocket.close({ code: 1008, reason: "blocked by sitesnap URL policy" })
    }
  })
  return () => policyError
}
