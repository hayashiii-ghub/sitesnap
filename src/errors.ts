export type ErrorCode =
  | "INVALID_OPTION"
  | "INVALID_URL"
  | "PRIVATE_URL_BLOCKED"
  | "URL_RESOLUTION_FAILED"
  | "SITEMAP_FETCH_FAILED"
  | "SITEMAP_PARSE_FAILED"
  | "SITEMAP_TOO_DEEP"
  | "SITEMAP_NOT_XML"
  | "INPUT_READ_FAILED"
  | "BROWSER_LAUNCH_FAILED"
  | "MANIFEST_NOT_FOUND"
  | "MANIFEST_INVALID"
  | "MANIFEST_SCHEMA_UNSUPPORTED"
  | "UNKNOWN_DEVICE"
  | "INTERACTION_FAILED"
  | "STORAGE_STATE_NOT_FOUND"
  | "STORAGE_STATE_INVALID"

export interface ErrorContext {
  url?: string
  domain?: string
  output?: string
  status?: number
  depth?: number
}

export class SiteSnapError extends Error {
  code: ErrorCode
  hint: string
  context: ErrorContext

  constructor(code: ErrorCode, message: string, hint: string, context: ErrorContext = {}) {
    super(message)
    this.name = "SiteSnapError"
    this.code = code
    this.hint = hint
    this.context = context
  }

  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint, ...this.context }
  }
}
