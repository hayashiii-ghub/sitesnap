import path from "node:path"
import type { CaptureOptions } from "./capture.ts"
import { DEFAULTS, shotCacheDir } from "./config.ts"
import { SiteSnapError } from "./errors.ts"
import { parseViewport, type Viewport } from "./shot.ts"

export const HELP = `
sitesnap — ウェブサイトのスクリーンショットを一括キャプチャするCLI

使い方:
  sitesnap site <sitemap-url>     sitemapから全ページをキャプチャ
  sitesnap page <url>              1ページだけキャプチャ
  sitesnap shot <url>              開発検証用の単発スクリーンショット
  sitesnap inspect <url>           要素の computed style / 寸法 / overflow を JSON で取得
  sitesnap check <url>             横はみ出し/consoleエラー/失敗リクエスト/a11y の合否レポート
  sitesnap list                    キャプチャ済みサイト一覧 (--shots で shot を列挙)
  sitesnap clean [host]            溜まった shot を削除 (アーカイブには触れない)
  sitesnap open <domain>           Finderでサイトのフォルダを開く
  sitesnap retry <domain>          失敗したページのみ再取得
  sitesnap doctor <run-dir>        キャプチャ結果を診断し、再取得案を表示
  sitesnap help                    このヘルプを表示
  sitesnap --version               バージョン番号を表示

グローバルフラグ:
  -h, --help                            ヘルプを表示（サブコマンドの後ろでも可）
  --json                                JSON形式でstdout出力（進捗はstderr）
  --force-visible                       スクロール連動アニメで隠れた要素を強制表示
                                        (AOS / wow.js / Framer Motion(motion/react) の
                                         whileInView 等対策。スクショが真っ白な時に使用)
  --out <dir>                           出力先ディレクトリ（site/page のデフォルト: ./sites/）
                                        shot は未指定なら OS キャッシュに出す（cwd を汚さない）
                                        SITESNAP_OUT 環境変数でも指定可
  --limit <N>                           site: 最初の N 件のURLのみキャプチャ（--exclude適用後）
                                        inspect: 一致要素を N 件まで取得（デフォルト 10）
  --exclude <regex>                     この正規表現にマッチするURLをスキップ
  --concurrency <N>                     並列ワーカー数を上書き（デフォルト 3）
  --wait-ms <ms>                        スクリーンショット前に追加で待機
  --pre-scroll <full-page|none>         スクリーンショット前の自動スクロール設定
  --agent-task                          doctor実行時にagent向け調査ファイルを生成
  --min-interval <ms>                   同一ホストへの最小間隔(ms、デフォルト 0 で無効)
  --strict                              1ページでも失敗したら非ゼロ終了（CI向け）
  --allow-private                       localhost/プライベートIPへのアクセスを許可

shot / inspect / check 用フラグ:
  --vp <WxH>                            ビューポートサイズ（デフォルト 1440x900）
  --device <name>                       Playwrightデバイス名（例: "iPhone 13"）
  --selector <css>                      対象要素のCSSセレクタ（inspectでは必須）
  --settle <ms>                         アニメ凍結せず指定ms待ってから実行
  --full                                フルページ撮影（shotのみ。デフォルトはビューポートのみ）
  --props <p1,p2>                       inspectで追加取得するCSSプロパティ（カンマ区切り）

shot の撮影前インタラクション / 状態指定:
  --click <css>                         撮影前にクリック（繰り返し可。CSSタブ切替/details展開など）
  --eval <js>                           撮影前に任意JSを実行（clickで書けない状態の逃げ道）
  --label <name>                        出力ファイル名に付ける状態ラベル（状態違いの撮り分け）
  --allow-file                          file:// のローカルHTMLを直撮りする（shotのみ）
  -o, --out-file <path>                 撮った1枚を指定パスへ直接書き出す（shotのみ）
                                        親ディレクトリは自動作成。--json の file もこのパスを返す
                                        （--out とは併用不可）

list / clean 用フラグ:
  --shots                               list で shot をホスト別に列挙 (既定はキャッシュ領域。--out で project 配下に変更可)
  --older-than <days>                   clean で指定日数より古い shot だけ削除
  --dry-run                             clean で削除せず対象だけ表示

使用例:
  sitesnap shot http://localhost:3000/about --allow-private --json
  sitesnap shot https://example.com/ --selector "footer" --json
  sitesnap shot https://example.com/ --device "iPhone 13" --settle 1500 --json
  sitesnap shot http://localhost:3000/ --allow-private --click ".tab-user" --label user --json
  sitesnap shot file:///tmp/mock.html --allow-file --click "summary" --label open --json
  sitesnap shot file:///tmp/mock.html --allow-file --full -o ./public/og.png --json
  sitesnap shot http://localhost:3000/ --allow-private --full --pre-scroll full-page --force-visible --settle 800 --json
  sitesnap list --shots --json
  sitesnap clean --older-than 7 --dry-run --json
  sitesnap clean localhost_3000
  sitesnap inspect https://example.com/ --selector ".cta" --props "letter-spacing" --json
  sitesnap check http://localhost:3000/ --allow-private --strict --json
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
  props: string[] | null
  label: string | null
  clicks: string[]
  evalJs: string | null
}

export interface CliContext {
  sub: string | undefined
  args: string[]
  json: boolean
  strict: boolean
  agentTask: boolean
  outDir: string
  // --out もしくは SITESNAP_OUT が明示されたか。shot は未指定ならキャッシュへ出す
  outDirExplicit: boolean
  // shot / list --shots / clean が共有する shot の保存先。
  // --out / SITESNAP_OUT 明示時は outDir、未指定なら OS キャッシュ。
  // (site/page のアーカイブ outDir とは別。撮影・列挙・掃除はここで一致させる)
  shotDir: string
  // shot で撮った1枚をこのパスへ直接書き出す (--out-file)。未指定は null
  outFile: string | null
  captureOptions: CaptureOptions
  shotOptions: ShotCliOptions
  limit: number | null
  exclude: RegExp | null
  minInterval: number | null
  dryRun: boolean
  olderThan: number | null
  shots: boolean
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
  inspect: 1,
  check: 1,
  list: 0,
  open: 1,
  retry: 1,
  doctor: 1,
  clean: 1,
}

const usageArgBySubcommand: Record<string, string> = {
  site: " <sitemap-url>",
  page: " <url>",
  shot: " <url>",
  inspect: " <url>",
  check: " <url>",
  open: " <domain>",
  retry: " <domain>",
  doctor: " <run-dir>",
  clean: " [host]",
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
  const allowFile = argv.includes("--allow-file")
  const agentTask = argv.includes("--agent-task")
  const full = argv.includes("--full")
  const dryRun = argv.includes("--dry-run")
  const shots = argv.includes("--shots")

  const envOutGiven = Boolean(env.SITESNAP_OUT)
  let outDir = env.SITESNAP_OUT || DEFAULTS.sitesDir
  let outFlagGiven = false
  let outFile: string | null = null
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
  let props: string[] | null = null
  let label: string | null = null
  let evalJs: string | null = null
  let olderThan: number | null = null
  const clicks: string[] = []

  const flagSet = new Set([
    "--json",
    "--force-visible",
    "--strict",
    "--allow-private",
    "--allow-file",
    "--agent-task",
    "--full",
    "--dry-run",
    "--shots",
  ])
  const valueFlags = new Set([
    "--out",
    "--out-file",
    "-o",
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
    "--props",
    "--label",
    "--click",
    "--eval",
    "--older-than",
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
      if (a === "--out") {
        outDir = v
        outFlagGiven = true
      } else if (a === "--out-file" || a === "-o") outFile = v
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
      else if (a === "--props") props = v.split(",").map((p) => p.trim()).filter(Boolean)
      else if (a === "--label") label = v
      else if (a === "--click") clicks.push(v)
      else if (a === "--eval") evalJs = v
      else if (a === "--older-than") olderThan = parseNonNegativeInteger(v, a)
      continue
    }
    if (a.startsWith("-")) {
      throw invalidOption(`未知のオプションです: ${a}`)
    }
    args.push(a)
  }
  outDir = path.resolve(outDir)
  if (outFile !== null) outFile = path.resolve(outFile)
  const outDirExplicit = outFlagGiven || envOutGiven
  const shotDir = outDirExplicit ? outDir : shotCacheDir(env)
  validatePositionalArity(sub, args)

  if (outFile !== null && sub !== "shot") {
    throw invalidOption("--out-file は shot コマンドでのみ使用できます", "単一ファイル出力は sitesnap shot で指定してください。")
  }
  if (outFile !== null && outFlagGiven) {
    throw invalidOption("--out と --out-file は同時に指定できません", "出力先ディレクトリか出力ファイルのどちらか一方で指定してください。")
  }

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
    outDirExplicit,
    shotDir,
    outFile,
    captureOptions: {
      forceVisible,
      outDir,
      allowPrivate,
      allowFile,
      concurrency: concurrency ?? undefined,
      waitMs: waitMs ?? undefined,
      preScroll: preScroll ?? undefined,
    },
    shotOptions: { vp, device, selector, settleMs, full, props, label, clicks, evalJs },
    limit,
    exclude,
    minInterval,
    dryRun,
    olderThan,
    shots,
  }
}
