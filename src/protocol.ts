import type { CaptureResult } from "./capture.ts"

export const SCHEMA_VERSION = 1 as const
export type CollectionStatus = "complete" | "partial" | "failed"

export function captureFailureMessage(result: CaptureResult): string | null {
  if (result.error) return result.error
  if (result.httpStatus !== undefined && result.httpStatus >= 400) return `HTTP ${result.httpStatus}`
  return null
}

export function statusFromResults(results: CaptureResult[]): CollectionStatus {
  const failed = results.filter((result) => captureFailureMessage(result)).length
  if (failed === 0) return "complete"
  if (failed === results.length) return "failed"
  return "partial"
}

export function combineStatuses(statuses: CollectionStatus[]): CollectionStatus {
  if (statuses.every((status) => status === "complete")) return "complete"
  if (statuses.every((status) => status === "failed")) return "failed"
  return "partial"
}
