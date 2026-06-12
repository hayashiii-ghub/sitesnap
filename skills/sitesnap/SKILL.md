---
name: sitesnap
description: Webサイトのスクリーンショット（デスクトップ + モバイル）を一括キャプチャする CLI ツール。sitemap対応・ポートフォリオ収集向け。
---

# sitesnap Skill

## When to use this skill

- ユーザーがWebサイトのスクリーンショットを撮りたいと言ったとき
- ポートフォリオ用のサイト収集
- sitemap.xml から全ページを一括キャプチャしたいとき
- キャプチャ失敗の診断や再取得方針を出したいとき
- **開発中のサイトの検証**（特定ビューポート・特定要素・アニメ完了後の状態を撮りたいとき → `shot`）
- **レイアウトの数値検証**（computed style・寸法・はみ出し量を確認したいとき → `inspect`。スクショ目視より確実）

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

### 要素の数値検証（`inspect`）
```bash
# computed style・boundingBox・テキスト・はみ出し量を JSON で取得
sitesnap inspect http://localhost:3000/ --selector ".cta" --allow-private --json
# 追加プロパティ指定
sitesnap inspect http://localhost:3000/ --selector "h1" --props "letter-spacing" --allow-private --json
```
マッチ 0 件はエラーではなく `count: 0`（不在の検証にも使える）。`overflow.x > 0` なら内容がはみ出している。

### キャプチャ済み一覧
```bash
sitesnap list --json
```

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

## Best practices

- AIエージェントから実行するときは必ず `--json` を付ける
- 結果報告では `out_dir` と `run_dir` を絶対パスで伝える
- 失敗時は `errors` を読み、推測だけで再実行しない
- 大量取得では `--concurrency` と `--min-interval` を控えめにする
- `doctor --agent-task` は調査ファイル生成のみで、外部agentやWebwrightは同梱しない

詳細は `AGENTS.md` を参照。
