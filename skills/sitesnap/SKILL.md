---
name: sitesnap
description: AIエージェント/開発者がローカルUIを撮って・測って・直すための Playwright スクリーンショット CLI。shot(単発撮影)→check(overflow/console/a11y 合否)→inspect(要素の数値検証)の開発ループが主用途。撮影前の --click/--eval/--label でCSSタブや details の状態違いも撮り分け、--allow-file で file:// モックを直撮り。sitemap 一括キャプチャやポートフォリオ収集にも使える。
---

# sitesnap Skill

## When to use this skill

- **開発中のサイトの検証**（特定ビューポート・特定要素・アニメ完了後の状態を撮りたいとき → `shot`）
- **ページの健全性ゲート**（横はみ出し・consoleエラー・失敗リクエスト・a11y をまとめて合否判定 → `check`）
- **レイアウトの数値検証**（computed style・寸法・はみ出し量を確認したいとき → `inspect`。スクショ目視より確実）
- **撮影前の状態指定**（CSSラジオタブや `<details>` の開閉を `--click`/`--eval` で。`file://` モックは `--allow-file` で直撮り → `shot`）
- ユーザーがWebサイトのスクリーンショットを撮りたい / sitemap.xml から全ページを一括キャプチャ / ポートフォリオ用に収集したいとき（`site` / `page`）
- キャプチャ失敗の診断や再取得方針を出したいとき（`doctor`）

## How to invoke

1. ユーザーの URL がサイトマップか単一ページか判別
2. 出力先を指定する必要があれば `--out <dir>` を付ける
3. sitemapなら `sitesnap site <sitemap-url> --json`、単一ページなら `sitesnap page <url> --json`、開発検証ループなら `sitesnap shot <url> --json` を実行
4. localhost / private IP なら、ユーザーの意図を確認して `--allow-private` を付ける
5. 白紙・lazy load・scroll reveal が疑われる場合は `--force-visible` を付けて再実行
6. 大きなsitemapは最初に `--limit <N>` で小さく試す
7. JSON出力の `success`、`captured_pages`、`errors`、`run_dir` を確認して結果を報告
8. 失敗が残る場合は `sitesnap doctor <run-dir> --json` を実行し、深掘りが必要なら `--agent-task` を付ける

## Examples

### Sitemap から全ページ
```bash
sitesnap site https://example.com/sitemap.xml --json
```

### 単一ページ
```bash
sitesnap page https://example.com/about --json
```

### 開発検証用の単発スクショ（`shot`）
```bash
# ビューポートのみ（デフォルト 1440x900、AIが画像で読める）
sitesnap shot http://localhost:3000/about --allow-private --json
# 要素だけ撮影
sitesnap shot http://localhost:3000/ --selector "footer" --allow-private --json
# 入場アニメ完了後の最終状態（凍結せず1.5秒待つ）
sitesnap shot https://example.com/ --settle 1500 --json
# デバイスエミュレーション / フルページ
sitesnap shot https://example.com/ --device "iPhone 13" --json
sitesnap shot https://example.com/ --full --json
```
JSON の `file` が PNG の絶対パス。meta.json は更新されず `sites/<host>/shots/` に上書き保存。

### 状態を仕込んで撮り分ける（CSSタブ・details・モック）
`shot` は撮影前に DOM 状態を作れる。CSSラジオのタブ切替や `<details>` の開閉など、クリックで状態が変わる UI を**一時コピーを作らずに**撮り分けられる。
```bash
# CSS ラジオタブ: それぞれの状態をクリックで作って別ファイルに保存
sitesnap shot http://localhost:3000/ --allow-private --click ".tab-user"  --label user  --json
sitesnap shot http://localhost:3000/ --allow-private --click ".tab-admin" --label admin --json
# <details> を開いた状態
sitesnap shot http://localhost:3000/ --allow-private --click "summary" --label open --json
# click で書けない状態は --eval（逃げ道。基本は --click を使う）
sitesnap shot http://localhost:3000/ --allow-private --eval "document.documentElement.classList.add('dark')" --label dark --json
# ローカルの静的 HTML モックをサーバ無しで直撮り
sitesnap shot file:///abs/path/mock.html --allow-file --click ".tab-user" --label user --json
```
**`--label` が撮り分けの要**: 付けないと同じ url/vp のバリアントが同名で**上書き**される。状態ごとに必ず `--label` を変える。`--click` は左から順に実行。CSSトランジションを挟む場合は `--settle <ms>` を併用。

### 「完成」前の検証ループ（shot → check）
`shot` で見た目を確認したら、宣言前に `check` で横はみ出し / console エラー / a11y を合否判定する。特にモバイル幅の横はみ出しは目視で見落としやすい。
```bash
sitesnap shot  http://localhost:3000/ --allow-private --device "iPhone 13" --json   # 見た目
sitesnap check http://localhost:3000/ --allow-private --device "iPhone 13" --json   # 数値で合否
```

### 要素の数値検証（`inspect`）
```bash
# computed style・boundingBox・テキスト・はみ出し量を JSON で取得
sitesnap inspect http://localhost:3000/ --selector ".cta" --allow-private --json
# 追加プロパティ指定
sitesnap inspect http://localhost:3000/ --selector "h1" --props "letter-spacing" --allow-private --json
```
マッチ 0 件はエラーではなく `count: 0`（不在の検証にも使える）。`overflow.x > 0` なら内容がはみ出している。

### ページの健全性チェック（`check`）
```bash
# 横はみ出し / consoleエラー / 失敗リクエスト / axe-core a11y の合否レポート
sitesnap check http://localhost:3000/ --allow-private --json
# CI ゲート（不合格で非ゼロ終了）
sitesnap check http://localhost:3000/ --allow-private --strict --json
```
「ページ完成」を宣言する前に流す。`pass: true` は 4 チェック全部合格のときだけ。

### キャプチャ済み一覧
```bash
sitesnap list --json
```

### shot の棚卸しと掃除（`list --shots` / `clean`）
`shot` は `sites/<host>/shots/` に溜まる使い捨て領域。`--label` を増やすほどファイルが残るので、定期的に棚卸し・掃除する。`sites/` は gitignore 済みなので消しても安全。
```bash
# どのホストに何枚・何バイト溜まっているか
sitesnap list --shots --json
# 7日より古い shot を「消さずに」確認 → 問題なければ --dry-run を外す
sitesnap clean --older-than 7 --dry-run --json
sitesnap clean --older-than 7 --json
# 特定ホストだけ全消し
sitesnap clean localhost_3000 --json
```
`clean` は **`shots/` だけ**を対象にし、`site`/`page` のアーカイブ（`desktop/` `mobile/` `meta.json`）には一切触れない。破壊操作なので**まず `--dry-run`** で対象を確認するのが安全。

### サーバーに優しく一括キャプチャ
```bash
sitesnap site https://example.com/sitemap.xml --concurrency 3 --min-interval 250 --json
```

### 失敗ページを再取得
```bash
sitesnap retry example.com --force-visible --wait-ms 1000 --json
```

### キャプチャ結果を診断
```bash
sitesnap doctor sites/example.com/runs/latest --agent-task --json
```

## Error recovery

- `INVALID_URL`: URLの形式（http:// or https://）を確認
- `PRIVATE_URL_BLOCKED`: localhost / private IP を撮る意図がある場合のみ `--allow-private` を付ける
- `BROWSER_LAUNCH_FAILED`: `bunx playwright install chromium` を提案
- `SITEMAP_NOT_XML`: sitemap URLではなくHTMLページなら `sitesnap page` に切り替える
- `SITEMAP_FETCH_FAILED`: URLやネットワーク、robots.txt の sitemap 記載を確認
- `PAGE_LOAD_FAILED`: サイトの可用性、timeout、`--wait-ms` の追加を確認
- `SCREENSHOT_FAILED`: 出力先、ディスク容量、`--force-visible` を確認
- `DOMAIN_NOT_FOUND`: `sitesnap list --json` でキャプチャ済みdomainを確認
- `UNKNOWN_DEVICE`: Playwright のデバイス名（`"iPhone 13"` 等）を確認
- `ELEMENT_NOT_FOUND`: セレクタを確認、または `--settle` で描画完了を待つ
- `INTERACTION_FAILED`: `--click` 対象が無い / `--eval` が例外。セレクタやJSを確認、`--settle` で描画完了を待つ
- `INVALID_URL`（file://）: ローカルHTMLを直撮りするなら `--allow-file` を付ける

## Best practices

- AIエージェントから実行するときは必ず `--json` を付ける
- 結果報告では `out_dir` と `run_dir` を絶対パスで伝える
- 失敗時は `errors` を読み、推測だけで再実行しない
- 大量取得では `--concurrency` と `--min-interval` を控えめにする
- `doctor --agent-task` は調査ファイル生成のみで、外部agentやWebwrightは同梱しない

詳細は `AGENTS.md` を参照。
