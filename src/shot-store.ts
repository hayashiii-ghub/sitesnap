import { existsSync } from "node:fs"
import { readdir, rm, stat } from "node:fs/promises"
import path from "node:path"

// shot は sites/<host>/shots/ に保存され meta.json を持たない使い捨て領域。
// このモジュールはその shots/ の列挙と掃除だけを担い、アーカイブ
// (desktop/ mobile/ meta.json) には一切触れない。

export interface ShotHostSummary {
  host: string
  dir: string
  files: number
  bytes: number
  latest_mtime: string | null
}

export interface ShotFileInfo {
  host: string
  file: string
  bytes: number
  mtime: string
}

export interface PruneOptions {
  // 特定ホスト (例: "localhost_3000", "_file") だけを対象にする
  host?: string | null
  // 指定日数より古い (mtime) ファイルだけを対象にする
  olderThanDays?: number | null
  // 消さずに対象一覧だけ返す
  dryRun?: boolean
  // 経過判定の基準時刻 (ms)。主にテスト用。既定は現在時刻
  now?: number
}

export interface PruneResult {
  removed: ShotFileInfo[]
  bytes: number
  dry_run: boolean
}

// sitesDir 直下の各ホストの shots/*.png を列挙する (host 指定で絞り込み)
async function collectShotFiles(sitesDir: string, host?: string | null): Promise<ShotFileInfo[]> {
  if (!existsSync(sitesDir)) return []
  const entries = await readdir(sitesDir, { withFileTypes: true })
  const out: ShotFileInfo[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (host && e.name !== host) continue
    const shotsDir = path.join(sitesDir, e.name, "shots")
    if (!existsSync(shotsDir)) continue
    const files = await readdir(shotsDir, { withFileTypes: true })
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".png")) continue
      const fp = path.join(shotsDir, f.name)
      const st = await stat(fp)
      out.push({ host: e.name, file: fp, bytes: st.size, mtime: st.mtime.toISOString() })
    }
  }
  return out
}

export async function listShots(sitesDir: string): Promise<ShotHostSummary[]> {
  const files = await collectShotFiles(sitesDir)
  const byHost = new Map<string, ShotFileInfo[]>()
  for (const f of files) {
    const list = byHost.get(f.host) ?? []
    list.push(f)
    byHost.set(f.host, list)
  }
  const summaries: ShotHostSummary[] = []
  for (const [host, list] of byHost) {
    const latest = list.reduce<string | null>(
      (acc, f) => (acc === null || f.mtime > acc ? f.mtime : acc),
      null
    )
    summaries.push({
      host,
      dir: path.join(sitesDir, host, "shots"),
      files: list.length,
      bytes: list.reduce((sum, f) => sum + f.bytes, 0),
      latest_mtime: latest,
    })
  }
  summaries.sort((a, b) => a.host.localeCompare(b.host))
  return summaries
}

export async function pruneShots(sitesDir: string, opts: PruneOptions = {}): Promise<PruneResult> {
  const dryRun = opts.dryRun || false
  let targets = await collectShotFiles(sitesDir, opts.host)

  if (opts.olderThanDays != null) {
    const now = opts.now ?? Date.now()
    const cutoff = now - opts.olderThanDays * 86400000
    targets = targets.filter((f) => Date.parse(f.mtime) < cutoff)
  }

  if (!dryRun) {
    for (const f of targets) {
      await rm(f.file, { force: true })
    }
  }

  return {
    removed: targets,
    bytes: targets.reduce((sum, f) => sum + f.bytes, 0),
    dry_run: dryRun,
  }
}
