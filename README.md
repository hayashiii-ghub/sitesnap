# web-portfolio

ウェブサイトのスクリーンショット(デスクトップ + モバイル)を一括キャプチャして、ローカルに保管するCLIツール。**ポートフォリオ用のサイト集めを目的**として設計。

- 📁 データはJSON + PNGファイル(DB不要)
- 🤖 Claude Code / Codex などのAIエージェントから1コマンドで実行可能
- 📡 `--json` フラグで構造化出力 → エージェントが結果をパース可能
- 🌐 別プロジェクト(Astro等)から `meta.json` を読み込んで公開ポートフォリオに統合

---

## Quick Start

```bash
# 1. 依存インストール
npm install
npx playwright install chromium

# 2. グローバルコマンドとして使えるようにする(推奨)
npm link
# → これで `web-portfolio <command>` がどこからでも叩ける

# 3. 試しに1サイト撮ってみる
web-portfolio site https://example.com/sitemap.xml
```

`npm link` を使わない場合は `node cli.mjs <command>` で代用可能。

---

## コマンド一覧

| コマンド | 用途 |
|---|---|
| `web-portfolio site <sitemap-url>` | sitemapから全URL展開 → 全ページキャプチャ |
| `web-portfolio page <url>` | 単一ページのみキャプチャ |
| `web-portfolio list` | キャプチャ済みサイト一覧 |
| `web-portfolio open <domain>` | Finderでサイトのフォルダを開く |
| `web-portfolio retry <domain>` | 失敗したページのみ再取得 |
| `web-portfolio help` | ヘルプ表示 |

### グローバルフラグ

| フラグ | 用途 |
|---|---|
| `--json` | 構造化JSON出力(stdoutにJSON、進捗ログはstderr)。AIエージェントから扱いやすい |
| `--force-visible` | スクロール連動アニメで隠れた要素を強制表示。**スクショが真っ白な時に使う**(AOS, wow.js 等対策) |

```bash
web-portfolio list --json
# → [{ "domain": "...", "pages": 45, ... }]

web-portfolio site https://example.com/sitemap.xml --force-visible
# アニメーションで真っ白になるサイトに有効
```

### アニメーション対策(デフォルトで有効)

Playwrightブラウザコンテキストに以下を自動適用しています:
- `prefers-reduced-motion: reduce` の送信(まともなサイトはこれでアニメ無効化)
- 全要素の `animation/transition` を 0.001s に短縮するCSS注入
- フォント・画像のロード完了を待ってから撮影

それでも真っ白なら `--force-visible` を試してください。

---

## 出力構造

```
sites/
├── index.json                  全サイトのサマリ
└── <domain>/
    ├── meta.json               ページ一覧 + 画像パス + タイトル
    ├── desktop/<slug>.png      デスクトップ版スクショ
    └── mobile/<slug>.png       モバイル版スクショ
```

### `meta.json` のスキーマ
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

### Claude Code
本リポジトリには `.claude/skills/web-portfolio/SKILL.md` を同梱。Claude Code がこのスキルを自動的に認識し、ユーザーが「このサイト保存して: https://...」のように依頼すれば適切なコマンドを実行します。

### Codex / その他のシェル実行可能なAIエージェント
プロンプトに以下を含めるか、リポジトリのREADME.mdを読ませる:

> このプロジェクトには `web-portfolio` CLIがある。
> - `web-portfolio site <sitemap-url>` でサイト全体
> - `web-portfolio page <url>` で単一ページ
> - `--json` で構造化出力
> 詳細は README.md / .claude/skills/web-portfolio/SKILL.md 参照

---

## 公開ポートフォリオサイトへの統合

別リポジトリ(Astro等)から `sites/<domain>/meta.json` を読み込んで動的にページ生成する想定。
画像パスは meta.json 内が `desktop/foo.png` 形式の相対パスなので、配信時のbaseURLと組み合わせて使ってください。

例: Astroの `getStaticPaths` で `meta.json` を読み、各ページを静的生成。

---

## 動作確認(quick check)

撮影した画像をブラウザで見たい時は、Finderで開くのが手っ取り早い:
```bash
web-portfolio open example.com
```

複数サイトをパン/ズームで一覧したい等の高度なビューワーが必要になったら、別途Astro側で実装する想定(本リポジトリには含めない)。

---

## 制限・注意

- **スクショ画像はGit管理外**(`.gitignore`)。ローカルで生成・保管します
- **ログイン必須サイト**は現状未対応(今後 `storageState` で対応可)
- **JavaScriptを大量に使うSPA**は `networkidle` で安定するまで待ちますが、撮り逃しがあれば `retry` で再取得を
