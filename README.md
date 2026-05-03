# web-portfolio

ウェブサイトのスクリーンショット(デスクトップ + モバイル)を一括キャプチャして、ローカルに保管・閲覧するためのツール。**ポートフォリオ用のサイト集めを目的**として設計。

- 📁 データはJSON + PNGファイル(DB不要)
- 🤖 Claude Code / Codex などのAIエージェントから1コマンドで実行可能
- 🖼 ローカルビューワー(pan/zoom/検索)付き
- 🌐 別プロジェクトのAstroサイト等から `meta.json` を読み込んで公開可能

---

## Quick Start

### 1. 初期セットアップ
```bash
npm install
npx playwright install chromium
```

### 2. サイトを丸ごとキャプチャ
sitemap.xml(またはsitemap_index.xml)のURLを渡すと、全ページを自動取得します。
```bash
node cli.mjs site https://example.com/sitemap.xml
```

### 3. 単一ページだけキャプチャ
```bash
node cli.mjs page https://example.com/about
```

### 4. ビューワーを起動
```bash
node cli.mjs view
# → http://localhost:3000/viewer/ をブラウザで開く
```

---

## コマンド一覧

| コマンド | 用途 |
|---|---|
| `node cli.mjs site <sitemap-url>` | sitemapから全URL展開 → 全ページキャプチャ |
| `node cli.mjs page <url>` | 単一ページのみキャプチャ |
| `node cli.mjs list` | キャプチャ済みサイト一覧 |
| `node cli.mjs view [--port 3000]` | ローカルビューワー起動 |
| `node cli.mjs retry <domain>` | 失敗したページのみ再取得 |
| `node cli.mjs help` | ヘルプ表示 |

`npm run capture-site …` / `npm run view` のようにnpm script経由でも実行可能。

---

## 出力構造

```
sites/
├── index.json                  # 全サイトのサマリ
└── <domain>/
    ├── meta.json               # ページ一覧 + 画像パス + タイトル
    ├── desktop/<slug>.png      # デスクトップ版スクショ
    └── mobile/<slug>.png       # モバイル版スクショ
```

### meta.json のスキーマ
```json
{
  "domain": "example.com",
  "source": "https://example.com/sitemap.xml",
  "captured_at": "2026-05-01T12:00:00Z",
  "pages": [
    {
      "url": "https://example.com/",
      "slug": "index",
      "title": "ページタイトル",
      "desktop": "desktop/index.png",
      "mobile": "mobile/index.png",
      "captured_at": "2026-05-01T12:00:00Z",
      "desktop_error": null,
      "mobile_error": null
    }
  ]
}
```

---

## 設定変更

`src/config.mjs` でデフォルト値を調整できます:
- `viewports.desktop` … デスクトップのビューポートサイズ
- `viewports.mobile` … モバイルのデバイス名 (Playwright `devices` 参照)
- `concurrency` … 並列キャプチャ数(デフォルト3)
- `navigationTimeout` … ページ読み込みタイムアウト(ms)

---

## AI Agent からの使い方

Claude Code や Codex から自然言語で呼び出せます。

**会話例:**
> 「このサイトを保存して: https://example.com/sitemap.xml」
> → AIが自動で `node cli.mjs site https://example.com/sitemap.xml` を実行

**前提:** AIエージェントは本リポジトリのルートで動作していること。

**典型フロー:**
1. ユーザー: 「○○のサイト集めて」
2. AI: sitemap URLを推測 or 確認 → `node cli.mjs site <url>`
3. AI: `node cli.mjs list` で結果確認
4. AI: 失敗があれば `node cli.mjs retry <domain>`

---

## 公開ポートフォリオサイトへの統合

別リポジトリ(Astro等)から `sites/<domain>/meta.json` を読み込んで動的にページ生成する想定。
画像パスは meta.json 内が `desktop/foo.png` 形式の相対パスなので、配信時のbaseURLと組み合わせて使ってください。

例: Astroの `getStaticPaths` で `meta.json` を読み、各ページを静的生成。

---

## 制限・注意

- **スクショ画像はGit管理外**(`.gitignore`)。ローカルで生成・保管します
- **ログイン必須サイト**は現状未対応(今後 `storageState` で対応可)
- **JavaScriptを大量に使うSPA**は `networkidle` で安定するまで待ちますが、撮り逃しがあれば `retry` で再取得を
