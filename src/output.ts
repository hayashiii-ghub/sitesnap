import { SiteSnapError } from "./errors"

export type OutputFormat = "json" | "text"

export function formatSuccess(data: Record<string, unknown>, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify({ success: true, ...data })
  }
  // text
  const lines: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const v of value) lines.push(`  - ${v}`)
    } else {
      lines.push(`${key}: ${value}`)
    }
  }
  return lines.join("\n")
}

export function formatError(err: unknown, format: OutputFormat): string {
  if (err instanceof SiteSnapError) {
    if (format === "json") {
      return JSON.stringify({ success: false, error: err.toJSON() })
    }
    return `[${err.code}] ${err.message}\n  hint: ${err.hint}`
  }

  const message = err instanceof Error ? err.message : String(err)
  if (format === "json") {
    return JSON.stringify({
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message,
        hint: "予期しないエラーです。詳細を確認してください。",
      },
    })
  }
  return `[UNKNOWN_ERROR] ${message}`
}
