> 🇬🇧 [English](./README.en.md)

# @hayashiii/sitesnap

[![npm version](https://img.shields.io/npm/v/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![npm downloads](https://img.shields.io/npm/dm/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/@hayashiii/sitesnap.svg)](https://nodejs.org)

ウェブサイトのスクリーンショット(デスクトップ + モバイル)を一括キャプチャしてローカルに保管する、AIエージェントフレンドリーなCLIツール。**ポートフォリオ用のサイト集めを目的**として設計。

- 📁 データはJSON + PNGファイル(DB不要)
- 🤖 Claude Code / Codex などのAIエージェントから1コマンドで実行可能(Claude Code Skill同梱)
- 📡 `--json` フラグで構造化出力 → エージェントが結果をパース可能
- 🌐 別プロジェクト(Astro等)から `meta.json` を読み込んで公開ポートフォリオに統合可能

---

## インストール

```bash
# グローバルインストール(推奨)
npm install -g @hayashiii/sitesnap
# または: pnpm add -g @hayashiii/sitesnap
# または: yarn global add @hayashiii/sitesnap

# Playwright の Chromium ブラウザを取得(初回のみ)
npx playwright install chromium
```

**Node.js 22以上** が必要です。

---

## Quick Start

```bash
# サイトマップから全ページを一気にキャプチャ
sitesnap site https://example.com/sitemap.xml

# 1ページだけ
sitesnap page https://example.com/about

# キャプチャ済みのサイト一覧
sitesnap list

# サイトのフォルダを Finder で開く(macOS)
sitesnap open example.com
```

---

## コマンド一覧

| コマンド | 用途 |
|---|---|
| `sitesnap site <sitemap-url>` | sitemapから全URL展開 → 全ページキャプチャ |
| `sitesnap page <url>` | 単一ページのみキャプチャ |
| `sitesnap list` | キャプチャ済みサイト一覧 |
| `sitesnap open <domain>` | Finderでサイトのフォルダを開く |
| `sitesnap retry <domain>` | 失敗したページのみ再取得 |
| `sitesnap help` | ヘルプ表示 |

### グローバルフラグ

| フラグ | 用途 |
|---|---|
| `--json` | 構造化JSON出力(stdoutにJSON、進捗ログはstderr)。AIエージェントから扱いやすい |
| `--force-visible` | スクロール連動アニメで隠れた要素を強制表示。**スクショが真っ白な時に使う**(AOS, wow.js 等対策) |
| `--out <dir>` | 出力先ディレクトリ(デフォルト: カレントディレクトリの `./sites/`)。`SITESNAP_OUT` 環境変数でも指定可 |
| `--limit <N>` | 最初の N 件のURLだけキャプチャ(`--exclude` 適用後の順序) |
| `--exclude <regex>` | この正規表現にマッチするURLをスキップ(例: `'\?utm_'`) |
| `--concurrency <N>` | 並列ワーカー数を上書き(デフォルト3) |
| `--min-interval <ms>` | 同一ホストへの最小間隔(ms、デフォルト 0 で無効)。サーバーに優しい運用に |
| `--strict` | 1ページでも失敗したら非ゼロ終了(CIで使う想定) |
| `--allow-private` | localhost/プライベートIPへのアクセスを許可(デフォルトは拒否) |

```bash
sitesnap list --json
# → [{ "domain": "...", "pages": 45, ... }]

sitesnap site https://example.com/sitemap.xml --force-visible --out ~/captures
```

### アニメーション対策(デフォルトで有効)

Playwrightブラウザコンテキストに以下を自動適用しています:
- `prefers-reduced-motion: reduce` の送信(まともなサイトはこれでアニメ無効化)
- 全要素の `animation/transition` を `0.001s` に短縮するCSS注入
- `document.fonts.ready` と全画像のロード完了を待ってから撮影

それでも真っ白なら `--force-visible` を試してください(AOS等のscroll-reveal対策)。

---

## 出力構造

```
sites/                              (--out で変更可)
├── index.json                      全サイトのサマリ
└── <domain>/
    ├── meta.json                   ページ一覧 + 画像パス + タイトル
    ├── desktop/<slug>.png          デスクトップ版スクショ
    └── mobile/<slug>.png           モバイル版スクショ
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

## AI Agent からの使い方

### Claude Code

ソースリポジトリには `.claude/skills/sitesnap/SKILL.md` が同梱されています。同じファイルを自分のプロジェクトの `.claude/skills/` にコピーすればネイティブで呼び出せるようになります:

> ユーザー: 「このサイト保存して: https://example.com/sitemap.xml」
> Claude Code が自動的に `sitesnap site …` を実行

### Codex CLI / その他のシェル実行可能なAIエージェント

Codex CLI はプロジェクト直下の `AGENTS.md` を自動で読み込むので、以下のスニペットをご自分の `AGENTS.md` に追記すれば自然言語で呼び出せるようになります:

````markdown
## sitesnap でWebサイトをキャプチャする

このリポジトリでは `sitesnap` コマンドが利用可能です。

- `sitesnap site <sitemap-url> --json` で sitemap から全ページキャプチャ
- `sitesnap page <url> --json` で単一ページのみキャプチャ
- `sitesnap list --json` でキャプチャ済みサイト一覧

出力は stdout に JSON、進捗ログは stderr。失敗時は非ゼロ終了。
````

`AGENTS.md` を使わない他のエージェントでも、同じスニペットをシステムプロンプトや指示文に貼れば同様に使えます。

---

## 設定変更(ソースを編集する場合)

`src/config.mjs` でデフォルト値を調整できます:

- `viewports.desktop` … デスクトップのビューポートサイズ
- `viewports.mobile` … モバイルのデバイス名 (Playwright `devices` 参照)
- `concurrency` … 並列キャプチャ数(デフォルト3)
- `navigationTimeout` … ページ読み込みタイムアウト(ms)

---

## ポートフォリオサイトへの統合

`meta.json` を静的サイトジェネレーター(Astro等)から読み込む想定で設計しています。Astroの例:

```ts
// src/pages/portfolio/[domain]/[slug].astro
import meta from '../../../path/to/sites/example.com/meta.json';

export function getStaticPaths() {
  return meta.pages.map(p => ({
    params: { domain: meta.domain, slug: p.slug },
    props: { page: p, domain: meta.domain }
  }));
}
```

画像パスは `meta.json` 内で `desktop/<slug>.png` 形式の相対パスなので、配信時のbaseURLと組み合わせて使ってください。

---

## 制限・注意

### セキュリティ

- デフォルトで `localhost` / `127.x` / `10.x` / `192.168.x` / `172.16-31.x` / `169.254.x` (リンクローカル) へのアクセスを**拒否**します(SSRF対策)。社内環境で使う場合は `--allow-private` を付けてください。
- `http://` / `https://` 以外のスキーム(file://, ftp://, data:)は受け付けません。
- HTTPリクエストには `sitesnap/<version> (+<homepage>)` を User-Agent として送信します。
- sitemapindex の循環参照や深いネスト(デフォルト最大5段)は自動で検出して中断します。

### その他の注意

- **スクショ画像はGit管理外推奨**。`meta.json` だけGit管理に乗せるのが基本(画像はサイズ大、生成物として扱う)
- **ログイン必須サイト**は現状未対応(今後 Playwright の `storageState` で対応予定)
- **JavaScriptを大量に使うSPA**は `networkidle` で待機してますが、撮り逃しがあれば `sitesnap retry <domain>` で再取得を

---

## ライセンス

MIT © 2026 Hayashi

---

## リンク

- [GitHubリポジトリ](https://github.com/hayashiii-ghub/sitesnap)
- [Issues](https://github.com/hayashiii-ghub/sitesnap/issues)
- [npm](https://www.npmjs.com/package/@hayashiii/sitesnap)
