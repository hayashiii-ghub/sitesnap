import { SiteSnapError } from "./errors.ts"

export function formatSuccess(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, ...data })
}

export function formatError(error: unknown): string {
  if (error instanceof SiteSnapError) return JSON.stringify({ success: false, error: error.toJSON() })
  return JSON.stringify({
    success: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: error instanceof Error ? error.message : String(error),
      hint: "予期しないエラーです。詳細を確認してください。",
    },
  })
}
