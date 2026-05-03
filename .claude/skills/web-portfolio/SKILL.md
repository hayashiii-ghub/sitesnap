---
name: web-portfolio
description: ウェブサイトのスクリーンショット(デスクトップ+モバイル)を一括キャプチャしてローカルに保管するCLIツール。ユーザーが「このサイト保存して」「このページ撮って」「ポートフォリオ用に集めて」など、サイト・ページの記録を依頼した時に使用。
---

# web-portfolio スキル

ウェブサイトのスクリーンショットをキャプチャし、`sites/<domain>/` 配下に保管するCLIツール。

## いつ使うか

ユーザーが以下のいずれかを依頼した時:
- 「このサイト保存して: https://...」「このページ撮って: https://...」
- 「ポートフォリオ用にこのサイトのキャプチャを集めて」
- 「sitemap全部スクショ撮って」
- 「失敗してるページだけ撮り直して」
- 「キャプチャ済みのサイト一覧見せて」

## 前提

このスキルは **本リポジトリ(web-portfolio)のルートで実行されること** を想定。`npm install` と `npx playwright install chromium` が完了している必要があります。

## コマンド

### グローバルフラグ
- `--json` … 構造化出力(stdoutにJSON、進捗ログはstderr)
- `--force-visible` … スクロール連動アニメーションで隠れている要素を強制表示。**スクショが真っ白になる場合に使う**(AOS, wow.js等のライブラリ対策)。

### 1. サイト全体をキャプチャ
URLが sitemap (例: `/sitemap.xml`, `/sitemap_index.xml`) を指している場合:
```bash
node cli.mjs site <sitemap-url> --json
```
出力: `{ domain, source, pages, captured_pages, errors[] }`

### 2. 単一ページをキャプチャ
通常のページURLの場合:
```bash
node cli.mjs page <url> --json
```
出力: `{ domain, url, desktop, mobile, errors[] }`

### 3. キャプチャ済みサイト一覧
```bash
node cli.mjs list --json
```
出力: `[{ domain, source, captured_at, pages, captured_pages }, ...]`

### 4. 失敗ページの再取得
```bash
node cli.mjs retry <domain> --json
```
出力: `{ domain, retried, still_failing }`

### 5. Finderでスクショフォルダを開く
```bash
node cli.mjs open <domain>
```

## 判断基準

ユーザーが渡したURLが `sitemap` か単一ページかの判別:
- URL末尾が `.xml` → ほぼ確実に sitemap → `site` コマンド
- URLパスに `/sitemap` を含む → sitemap の可能性大 → `site` コマンド
- それ以外 → 単一ページ → `page` コマンド
- 迷ったら、まず `<origin>/sitemap.xml` の存在を確認(curl -sI)してから決める

## 出力データの場所

```
sites/
├── index.json                  全サイトのサマリ
└── <domain>/
    ├── meta.json               ページ一覧 + タイトル + 画像パス
    ├── desktop/<slug>.png
    └── mobile/<slug>.png
```

`meta.json` のスキーマは README.md 参照。

## エラーハンドリング

- `errors[]` が空でなければ、対象URLを retry 候補としてユーザーに報告
- `still_failing > 0` の場合は、サイト側の問題(Cloudflareブロック、認証必須等)の可能性をユーザーに伝える
- **撮ったスクショが真っ白 / 一部空白**の場合 → `--force-visible` を付けて再キャプチャを提案

## 注意

- スクリーンショットPNGは `.gitignore` でGit管理外。**コミットしない**
- `meta.json` と `sites/index.json` は管理対象。データの履歴として残す
- ログイン必須サイトは現状未対応(将来 `storageState` で対応可)
