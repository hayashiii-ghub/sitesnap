---
name: sitesnap
description: Webサイトのスクリーンショット（デスクトップ + モバイル）を一括キャプチャする CLI ツール。sitemap対応・ポートフォリオ収集向け。
---

# sitesnap Skill

## When to use this skill

- ユーザーがWebサイトのスクリーンショットを撮りたいと言ったとき
- ポートフォリオ用のサイト収集
- sitemap.xml から全ページを一括キャプチャしたいとき

## How to invoke

1. ユーザーの URL がサイトマップか単一ページか判別
2. `sitesnap site <sitemap-url> --json` または `sitesnap page <url> --json` を実行
3. JSON出力の `success` を確認、`captured_pages` 等を結果として報告

## Examples

### Sitemap から全ページ
```bash
sitesnap site https://example.com/sitemap.xml --json
```

### 単一ページ
```bash
sitesnap page https://example.com/about --json
```

### キャプチャ済み一覧
```bash
sitesnap list --json
```

## Error recovery

- `INVALID_URL` → URLの形式（http:// or https://）を確認
- `PRIVATE_URL_BLOCKED` → `--allow-private` を提案
- `BROWSER_LAUNCH_FAILED` → `bunx playwright install chromium` を提案
- `SITEMAP_NOT_XML` → 単一ページ用 `sitesnap page` を提案

詳細は `AGENTS.md` を参照。
