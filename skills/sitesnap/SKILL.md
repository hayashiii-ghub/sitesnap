---
name: sitesnap
description: AIエージェント/開発者がローカルUIを撮って・測って・直すための Playwright スクリーンショット CLI。shot(単発撮影)→check(overflow/console/a11y 合否)→inspect(要素の数値検証)の開発ループが主用途。撮影前の --click/--eval/--label でCSSタブや details の状態違いも撮り分け、--allow-file で file:// モックを直撮り。認証付きサイトは login / --storage-state / --header / --http-credentials で撮影できる。sitemap 一括キャプチャやポートフォリオ収集にも使える。
---

# sitesnap Skill

## When to use this skill

- **開発中のサイトの検証**（特定ビューポート・特定要素・アニメ完了後の状態を撮りたいとき → `shot`）
- **ページの健全性ゲート**（横はみ出し・consoleエラー・失敗リクエスト・a11y をまとめて合否判定 → `check`）
- **レイアウトの数値検証**（computed style・寸法・はみ出し量を確認したいとき → `inspect`。スクショ目視より確実）
- **撮影前の状態指定**（CSSラジオタブや `<details>` の開閉を `--click`/`--eval` で。`file://` モックは `--allow-file` で直撮り → `shot`）
- ユーザーがWebサイトのスクリーンショットを撮りたい / sitemap.xml から全ページを一括キャプチャ / ポートフォリオ用に収集したいとき（`site` / `page`）
- **ログイン・Basic認証・トークンが必要なページを撮りたいとき**（`login` + `--storage-state` / `--header` / `--http-credentials`。下の「認証が必要なサイト」参照）
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
JSON の `file` が PNG の絶対パス。meta.json は更新されず、既定では OS キャッシュ（`$XDG_CACHE_HOME/sitesnap`、無ければ `~/.cache/sitesnap`）の `<host>/shots/` に上書き保存（`--out <dir>` で project 配下、`-o <path>` で 1 枚を指定パスへ）。

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
# 撮った 1 枚を指定パスへ直接書き出す（OG 画像の生成など）
sitesnap shot file:///abs/path/mock.html --allow-file --full -o ./public/og.png --json
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
`shot` は既定で OS キャッシュ（`$XDG_CACHE_HOME/sitesnap`、無ければ `~/.cache/sitesnap`）の `<host>/shots/` に溜まる使い捨て領域（`--out` 指定時はその project 配下）。`--label` を増やすほどファイルが残るので、定期的に棚卸し・掃除する。`list --shots` / `clean` も同じ保存先を見る。撮影先は repo の外（キャッシュ）か gitignore 済みなので消しても安全。
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

### 認証が必要なサイト（ログイン / Basic認証 / トークン）

まず認証方式を判別する。`shot` の JSON の `http_status` と `title` を見る:

| 症状 | 認証方式 | 使うフラグ |
|---|---|---|
| `http_status: 401` + Basic認証ダイアログ(ステージングでよくある) | HTTP Basic | `--http-credentials user:pass` |
| `http_status: 401/403` で API トークンが手元にある | ヘッダ認証 | `--header "Authorization: Bearer TOKEN"` |
| ログインページにリダイレクトされる(`title` が Login/Sign in 等) | フォーム/SSOログイン | `sitesnap login` → `--storage-state` |

**手順1: Basic認証（ステージング環境など）**
```bash
sitesnap shot https://staging.example.com/ --http-credentials user:pass --json
# シェル履歴に残したくない場合は環境変数で
SITESNAP_HTTP_CREDENTIALS=user:pass sitesnap site https://staging.example.com/sitemap.xml --json
```

**手順2: トークン/固定ヘッダ**（`--header` は繰り返し可。全リクエストに付く）
```bash
sitesnap shot https://api.example.com/dashboard --header "Authorization: Bearer TOKEN" --json
```

**手順3: フォームログイン / SSO（Google ログイン等）**

エージェントは自分でログインできないので、**ユーザーに1度だけ実行してもらう**:
```bash
sitesnap login https://app.example.com/login -o auth.json
# → ブラウザが開く → ユーザーがログイン → ターミナルで Enter → auth.json に保存
```
以降は全コマンド（shot / check / inspect / site / page / retry）で使い回せる:
```bash
sitesnap shot  https://app.example.com/dashboard --storage-state auth.json --json
sitesnap check https://app.example.com/dashboard --storage-state auth.json --json
```

**シークレットの扱い（必ず守る）**:
- `auth.json`(storage state)はログインセッションそのもの。**`.gitignore` に追加**し、`sites/` などコミットされる場所に置かない
- `--header` のトークンや `user:pass` を結果報告・コミットメッセージに書かない
- run 成果物(options.json)にはヘッダ値・認証情報は `<redacted>` で保存される(パスは残る)

**ログインしても 401/403 に戻る場合**: セッション期限切れ。`sitesnap login` をやり直してもらう。

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
- `DOMAIN_NOT_FOUND`: `sitesnap list --json` でキャプチャ済みdomainを確認
- `META_NOT_FOUND`: 先に `sitesnap site` / `page` でキャプチャしてから `retry` する
- `RUN_DIR_NOT_FOUND`: site/page/retry が出力する `runs/latest` を doctor に渡す
- `UNKNOWN_DEVICE`: Playwright のデバイス名（`"iPhone 13"` 等）を確認
- `ELEMENT_NOT_FOUND`: セレクタを確認、または `--settle` で描画完了を待つ
- `INTERACTION_FAILED`: `--click` 対象が無い / `--eval` が例外。セレクタやJSを確認、`--settle` で描画完了を待つ
- `INVALID_URL`（file://）: ローカルHTMLを直撮りするなら `--allow-file` を付ける
- `STORAGE_STATE_NOT_FOUND`: `--storage-state` のパスを確認。無ければ `sitesnap login <url> -o <file>` をユーザーに実行してもらう
- `STORAGE_STATE_INVALID`: storage state が壊れている。`sitesnap login` で作り直す
- `http_status` が 401/403 のまま: 認証方式の判別からやり直す（上の「認証が必要なサイト」の表）。storage state 使用中ならセッション切れの可能性 → `login` をやり直す

## Best practices

- AIエージェントから実行するときは必ず `--json` を付ける
- 結果報告では `out_dir` と `run_dir` を絶対パスで伝える
- 失敗時は `errors` を読み、推測だけで再実行しない
- 大量取得では `--concurrency` と `--min-interval` を控えめにする
- `doctor --agent-task` は調査ファイル生成のみで、外部agentやWebwrightは同梱しない
- `sitesnap login` はユーザーが対話的に実行するコマンド。エージェントはコマンドを提示して完了を待ち、代わりに実行しようとしない
- storage state ファイルやトークンの中身を読み上げたりログに残したりしない

詳細は `AGENTS.md` を参照。
