export type ErrorCode =
  | "INVALID_OPTION"
  | "INVALID_URL"
  | "PRIVATE_URL_BLOCKED"
  | "SITEMAP_FETCH_FAILED"
  | "SITEMAP_PARSE_FAILED"
  | "SITEMAP_TOO_DEEP"
  | "SITEMAP_NOT_XML"
  | "BROWSER_LAUNCH_FAILED"
  | "PAGE_LOAD_FAILED"
  | "SCREENSHOT_FAILED"
  | "OUTPUT_DIR_NOT_WRITABLE"
  | "DOMAIN_NOT_FOUND"
  | "META_NOT_FOUND"
  | "UNKNOWN_DEVICE"
  | "ELEMENT_NOT_FOUND"
  | "INTERACTION_FAILED"

export interface ErrorContext {
  url?: string
  domain?: string
  output?: string
  pattern?: string
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
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      ...this.context,
    }
  }
}
