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
- ⚙️ 構造化エラー(`code` + `hint`)でエージェントが自動リトライしやすい
- 🔧 TypeScript で実装、Bun 開発 / Node.js 22+ 配布のハイブリッド構成
- 🌐 別プロジェクト(Astro等)から `meta.json` を読み込んで公開ポートフォリオに統合可能

---

## インストール

```bash
# Node.js (npm)
npm install -g @hayashiii/sitesnap

# または Bun
bun install -g @hayashiii/sitesnap

# 初回のみ Playwright Chromium を取得
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

# AIエージェント連携(JSON出力)
sitesnap site https://example.com/sitemap.xml --json
```

---

## コマンド

| コマンド | 用途 |
|---|---|
| `sitesnap site <sitemap-url>` | sitemapから全URL展開 → 全ページキャプチャ |
| `sitesnap page <url>` | 単一ページのみキャプチャ |
| `sitesnap list` | キャプチャ済みサイト一覧 |
| `sitesnap open <domain>` | Finderでサイトのフォルダを開く |
| `sitesnap retry <domain>` | 失敗したページのみ再取得 |
| `sitesnap doctor <run-dir>` | キャプチャ結果を診断し、再取得案やagent向け調査票を生成 |
| `sitesnap help` | ヘルプ表示 |

### フラグ

| フラグ | デフォルト | 説明 |
|---|---|---|
| `--json` | off | 構造化JSON出力(stdoutにJSON、進捗ログはstderr) |
| `--force-visible` | off | スクロール連動アニメで隠れた要素を強制表示。**スクショが真っ白な時に使う**(AOS, wow.js 等対策) |
| `--out <dir>` | `./sites/` | 出力先ディレクトリ。`SITESNAP_OUT` 環境変数でも指定可 |
| `--limit <N>` | off | 最初の N 件のURLだけキャプチャ(`--exclude` 適用後の順序) |
| `--exclude <regex>` | off | この正規表現にマッチするURLをスキップ(例: `'\?utm_'`) |
| `--concurrency <N>` | 3 | 並列ワーカー数を上書き |
| `--wait-ms <ms>` | off | スクリーンショット前に追加で待機 |
| `--pre-scroll <full-page\|none>` | `full-page` | スクリーンショット前の自動スクロール設定 |
| `--agent-task` | off | `doctor` 実行時に Codex / Claude Code / Webwright 向け調査ファイルを生成 |
| `--min-interval <ms>` | 0 | 同一ホストへの最小間隔(ms)。サーバーに優しい運用に |
| `--strict` | off | 1ページでも失敗したら非ゼロ終了(CI向け) |
| `--allow-private` | off | localhost/プライベートIPへのアクセスを許可 |

```bash
sitesnap list --json
# → [{ "domain": "...", "pages": 45, ... }]

sitesnap site https://example.com/sitemap.xml --force-visible --out ~/captures
```

## JSON 出力例

単一ページをキャプチャした場合:

```json
{
  "success": true,
  "domain": "example.com",
  "url": "https://example.com/about",
  "desktop": true,
  "mobile": true,
  "desktop_path": "/abs/sites/example.com/desktop/about.png",
  "mobile_path": "/abs/sites/example.com/mobile/about.png",
  "errors": [],
  "out_dir": "/abs/sites",
  "run_dir": "/abs/sites/example.com/runs/latest"
}
```

sitemapからサイト全体をキャプチャした場合:

```json
{
  "success": true,
  "domain": "example.com",
  "source": "https://example.com/sitemap.xml",
  "pages": 10,
  "captured_pages": 9,
  "errors": [{ "url": "https://example.com/missing", "mode": "desktop", "error": "..." }],
  "out_dir": "/abs/sites",
  "run_dir": "/abs/sites/example.com/runs/latest"
}
```

エラー時:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "URLの形式が不正です",
    "hint": "http:// または https:// のURLを指定してください",
    "url": "example.com"
  }
}
```

### Optional: agent-assisted diagnosis

通常のキャプチャ経路にAIやWebwrightは入りません。失敗した時だけ `doctor` を明示的に実行すると、最新runの `result.json` を読み、白紙っぽいスクリーンショットやtimeoutを集計して再取得案を出します。

```bash
sitesnap site https://example.com/sitemap.xml
sitesnap doctor sites/example.com/runs/latest
```

深掘りしたい場合は、任意のagentへ渡す調査票を生成します。Webwrightは同梱せず、ユーザーが使いたいagentに `agent-task.md` を渡す設計です。

```bash
sitesnap doctor sites/example.com/runs/latest --agent-task
# 生成: diagnosis.md, agent-task.md, suggested-sitesnap.config.json
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
    ├── runs/latest/result.json      最新runの診断用サマリ
    ├── runs/latest/options.json     最新runの実行オプション
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

パッケージには `skills/sitesnap/SKILL.md` が同梱されています。`npm install -g @hayashiii/sitesnap` した瞬間から Claude Code が自動認識し、自然言語で呼び出せるようになります:

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

> このリポジトリ自体に手を入れる場合(コントリビューター向け)は、ルートの [AGENTS.md](./AGENTS.md) を参照してください。sitesnap のコードベースを AI エージェントで開発する際の指針が書いてあります。

## 開発

```bash
git clone https://github.com/hayashiii-ghub/sitesnap.git
cd sitesnap
bun install
bun test
bun src/cli.ts list --json  # 直接実行
bun run build               # dist/cli.js 生成
bun run pack:smoke          # npm package の内容と install 後CLIを検証
```

---

## 設定変更(ソースを編集する場合)

`src/config.ts` でデフォルト値を調整できます:

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
- **AIエージェント連携時**: 必ず `--json` を付けてください(進捗ログは stderr、結果 JSON は stdout に分離)

---

## ライセンス

MIT © 2026 Hayashi

---

## リンク

- [GitHubリポジトリ](https://github.com/hayashiii-ghub/sitesnap)
- [Issues](https://github.com/hayashiii-ghub/sitesnap/issues)
- [npm](https://www.npmjs.com/package/@hayashiii/sitesnap)
- [AGENTS.md](./AGENTS.md) — AIエージェント向け仕様書
- [CHANGELOG](./CHANGELOG.md)
