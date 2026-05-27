import path from "node:path"
import type { CaptureOptions } from "./capture.ts"
import { DEFAULTS } from "./config.ts"

export const HELP = `
sitesnap — ウェブサイトのスクリーンショットを一括キャプチャするCLI

使い方:
  sitesnap site <sitemap-url>     sitemapから全ページをキャプチャ
  sitesnap page <url>              1ページだけキャプチャ
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

使用例:
  sitesnap site https://example.com/sitemap.xml --limit 10
  sitesnap site https://example.com/sitemap.xml --exclude '\\?utm_'
  sitesnap site https://example.com/sitemap.xml --concurrency 5 --min-interval 250
  sitesnap site https://example.com/sitemap.xml --strict
  sitesnap site http://localhost:8080/sitemap.xml --allow-private
`

export interface CliContext {
  sub: string | undefined
  args: string[]
  json: boolean
  strict: boolean
  agentTask: boolean
  outDir: string
  captureOptions: CaptureOptions
  limit: number | null
  exclude: RegExp | null
  minInterval: number | null
}

export function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliContext {
  const sub = argv[0]
  const json = argv.includes("--json")
  const forceVisible = argv.includes("--force-visible")
  const strict = argv.includes("--strict")
  const allowPrivate = argv.includes("--allow-private")
  const agentTask = argv.includes("--agent-task")

  let outDir = env.SITESNAP_OUT || DEFAULTS.sitesDir
  let limit: number | null = null
  let exclude: RegExp | null = null
  let concurrency: number | null = null
  let minInterval: number | null = null
  let waitMs: number | null = null
  let preScroll: "full-page" | "none" | null = null

  const flagSet = new Set(["--json", "--force-visible", "--strict", "--allow-private", "--agent-task"])
  const valueFlags = new Set([
    "--out",
    "--limit",
    "--exclude",
    "--concurrency",
    "--min-interval",
    "--wait-ms",
    "--pre-scroll",
  ])
  const args: string[] = []
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!
    if (flagSet.has(a)) continue
    if (valueFlags.has(a)) {
      const v = argv[++i]
      if (v === undefined) {
        throw new Error(`${a} に値が指定されていません`)
      }
      if (a === "--out") outDir = v
      else if (a === "--limit") limit = Number(v)
      else if (a === "--exclude") {
        try {
          exclude = new RegExp(v)
        } catch (e) {
          throw new Error(`--exclude の正規表現が不正です: ${(e as Error).message}`)
        }
      } else if (a === "--concurrency") concurrency = Number(v)
      else if (a === "--min-interval") minInterval = Number(v)
      else if (a === "--wait-ms") waitMs = Number(v)
      else if (a === "--pre-scroll") {
        if (v !== "full-page" && v !== "none") {
          throw new Error("--pre-scroll は full-page または none を指定してください")
        }
        preScroll = v
      }
      continue
    }
    args.push(a)
  }
  outDir = path.resolve(outDir)

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
    limit,
    exclude,
    minInterval,
  }
}
