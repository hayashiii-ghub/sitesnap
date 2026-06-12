import path from "node:path"
import type { CaptureOptions } from "./capture.ts"
import { DEFAULTS } from "./config.ts"
import { SiteSnapError } from "./errors.ts"
import { parseViewport, type Viewport } from "./shot.ts"

export const HELP = `
sitesnap — ウェブサイトのスクリーンショットを一括キャプチャするCLI

使い方:
  sitesnap site <sitemap-url>     sitemapから全ページをキャプチャ
  sitesnap page <url>              1ページだけキャプチャ
  sitesnap shot <url>              開発検証用の単発スクリーンショット
  sitesnap list                    キャプチャ済みサイト一覧
  sitesnap open <domain>           Finderでサイトのフォルダを開く
  sitesnap retry <domain>          失敗したページのみ再取得
  sitesnap doctor <run-dir>        キャプチャ結果を診断し、再取得案を表示
  sitesnap help                    このヘルプを表示
  sitesnap --version               バージョン番号を表示

グローバルフラグ:
  --json                                JSON形式でstdout出力（進捗はstderr）
  --force-visible                       スクロール連動アニメで隠れた要素を強制表示
                                        (AOS, wow.js 等対策。スクショが真っ白な時に使用)
  --out <dir>                           出力先ディレクトリ（デフォルト: ./sites/）
                                        SITESNAP_OUT 環境変数でも指定可
  --limit <N>                           最初の N 件のURLのみキャプチャ（--exclude適用後）
  --exclude <regex>                     この正規表現にマッチするURLをスキップ
  --concurrency <N>                     並列ワーカー数を上書き（デフォルト 3）
  --wait-ms <ms>                        スクリーンショット前に追加で待機
  --pre-scroll <full-page|none>         スクリーンショット前の自動スクロール設定
  --agent-task                          doctor実行時にagent向け調査ファイルを生成
  --min-interval <ms>                   同一ホストへの最小間隔(ms、デフォルト 0 で無効)
  --strict                              1ページでも失敗したら非ゼロ終了（CI向け）
  --allow-private                       localhost/プライベートIPへのアクセスを許可

shot 専用フラグ:
  --vp <WxH>                            ビューポートサイズ（デフォルト 1440x900）
  --device <name>                       Playwrightデバイス名（例: "iPhone 13"）
  --selector <css>                      指定要素だけ撮影
  --settle <ms>                         アニメ凍結せず指定ms待ってから撮影
  --full                                フルページ撮影（デフォルトはビューポートのみ）

使用例:
  sitesnap shot http://localhost:3000/about --allow-private --json
  sitesnap shot https://example.com/ --selector "footer" --json
  sitesnap shot https://example.com/ --device "iPhone 13" --settle 1500 --json
  sitesnap site https://example.com/sitemap.xml --limit 10
  sitesnap site https://example.com/sitemap.xml --exclude '\\?utm_'
  sitesnap site https://example.com/sitemap.xml --concurrency 5 --min-interval 250
  sitesnap site https://example.com/sitemap.xml --strict
  sitesnap site http://localhost:8080/sitemap.xml --allow-private
`

export interface ShotCliOptions {
  vp: Viewport | null
  device: string | null
  selector: string | null
  settleMs: number | null
  full: boolean
}

export interface CliContext {
  sub: string | undefined
  args: string[]
  json: boolean
  strict: boolean
  agentTask: boolean
  outDir: string
  captureOptions: CaptureOptions
  shotOptions: ShotCliOptions
  limit: number | null
  exclude: RegExp | null
  minInterval: number | null
}

function invalidOption(message: string, hint = "sitesnap help で利用可能なオプションを確認してください。"): SiteSnapError {
  return new SiteSnapError("INVALID_OPTION", message, hint, {})
}

function parsePositiveInteger(value: string, flag: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw invalidOption(`${flag} には正の整数を指定してください: ${value}`, `${flag} <N> の形式で指定してください。`)
  }
  return n
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw invalidOption(`${flag} には0以上の整数を指定してください: ${value}`, `${flag} <ms> の形式で指定してください。`)
  }
  return n
}

const maxPositionalArgsBySubcommand: Record<string, number> = {
  site: 1,
  page: 1,
  shot: 1,
  list: 0,
  open: 1,
  retry: 1,
  doctor: 1,
}

const usageArgBySubcommand: Record<string, string> = {
  site: " <sitemap-url>",
  page: " <url>",
  shot: " <url>",
  open: " <domain>",
  retry: " <domain>",
  doctor: " <run-dir>",
}

function validatePositionalArity(sub: string | undefined, args: string[]): void {
  if (!sub) return
  const maxArgs = maxPositionalArgsBySubcommand[sub]
  if (maxArgs === undefined || args.length <= maxArgs) return

  const extra = args.slice(maxArgs).join(" ")
  const usageArg = usageArgBySubcommand[sub] || ""
  throw invalidOption(
    `${sub} コマンドの引数が多すぎます: ${extra}`,
    `sitesnap ${sub}${usageArg} の形式で指定してください。`
  )
}

export function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliContext {
  const sub = argv[0]
  const json = argv.includes("--json")
  const forceVisible = argv.includes("--force-visible")
  const strict = argv.includes("--strict")
  const allowPrivate = argv.includes("--allow-private")
  const agentTask = argv.includes("--agent-task")
  const full = argv.includes("--full")

  let outDir = env.SITESNAP_OUT || DEFAULTS.sitesDir
  let limit: number | null = null
  let exclude: RegExp | null = null
  let concurrency: number | null = null
  let minInterval: number | null = null
  let waitMs: number | null = null
  let preScroll: "full-page" | "none" | null = null
  let vp: Viewport | null = null
  let device: string | null = null
  let selector: string | null = null
  let settleMs: number | null = null

  const flagSet = new Set([
    "--json",
    "--force-visible",
    "--strict",
    "--allow-private",
    "--agent-task",
    "--full",
  ])
  const valueFlags = new Set([
    "--out",
    "--limit",
    "--exclude",
    "--concurrency",
    "--min-interval",
    "--wait-ms",
    "--pre-scroll",
    "--vp",
    "--device",
    "--selector",
    "--settle",
  ])
  const args: string[] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!
    if (flagSet.has(a)) continue
    if (valueFlags.has(a)) {
      const v = argv[++i]
      if (v === undefined) {
        throw invalidOption(`${a} に値が指定されていません`, `${a} <value> の形式で指定してください。`)
      }
      if (a === "--out") outDir = v
      else if (a === "--limit") limit = parsePositiveInteger(v, a)
      else if (a === "--exclude") {
        try {
          exclude = new RegExp(v)
        } catch (e) {
          throw invalidOption(`--exclude の正規表現が不正です: ${(e as Error).message}`, "--exclude <regex> の形式で指定してください。")
        }
      } else if (a === "--concurrency") concurrency = parsePositiveInteger(v, a)
      else if (a === "--min-interval") minInterval = parseNonNegativeInteger(v, a)
      else if (a === "--wait-ms") waitMs = parseNonNegativeInteger(v, a)
      else if (a === "--pre-scroll") {
        if (v !== "full-page" && v !== "none") {
          throw invalidOption("--pre-scroll は full-page または none を指定してください", "--pre-scroll <full-page|none> の形式で指定してください。")
        }
        preScroll = v
      } else if (a === "--vp") vp = parseViewport(v)
      else if (a === "--device") device = v
      else if (a === "--selector") selector = v
      else if (a === "--settle") settleMs = parseNonNegativeInteger(v, a)
      continue
    }
    if (a.startsWith("-")) {
      throw invalidOption(`未知のオプションです: ${a}`)
    }
    args.push(a)
  }
  outDir = path.resolve(outDir)
  validatePositionalArity(sub, args)

  if (vp && device) {
    throw invalidOption("--vp と --device は同時に指定できません", "ビューポートはどちらか一方で指定してください。")
  }
  if (selector && full) {
    throw invalidOption("--selector と --full は同時に指定できません", "要素撮影とフルページ撮影はどちらか一方で指定してください。")
  }

  return {
    sub,
    args,
    json,
    strict,
    agentTask,
    outDir,
    captureOptions: {
      forceVisible,
      outDir,
      allowPrivate,
      concurrency: concurrency ?? undefined,
      waitMs: waitMs ?? undefined,
      preScroll: preScroll ?? undefined,
    },
    shotOptions: { vp, device, selector, settleMs, full },
    limit,
    exclude,
    minInterval,
  }
}
