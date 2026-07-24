> 🇬🇧 [English](./README.en.md)

# @hayashiii/sitesnap

[![npm version](https://img.shields.io/npm/v/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AIエージェントがWebサイトを収集し、再取得可能なdesktop/mobile証拠archiveとして残すためのPlaywright CLIです。

```text
URL / sitemap / URL list
          ↓
       sitesnap
          ↓
manifest.json + desktop/mobile PNG + runs/latest.json
```

## 役割

sitesnap 1.xは「サイトを集めて残す」ことだけを担当します。

| ツール | 担当 |
|---|---|
| `sitesnap` | 公開サイト、参考サイト、ポートフォリオ素材の収集・archive・失敗再取得 |
| [`shimon`](https://github.com/hayashiii-ghub/shimon) | 開発中UIのcase定義、responsive検証、health check、evidence取得 |

0.xにあった `shot` / `check` / `inspect` / `doctor` / `clean` / `open` は1.0で削除しました。開発中のUI品質検証はshimonを使ってください。

## インストール

```bash
npm install -g @hayashiii/sitesnap
npx playwright install chromium
```

Node.js 22以上が必要です。

## Quick start

```bash
# 1ページ
sitesnap capture https://example.com/about

# sitemap / sitemap index
sitesnap capture --sitemap https://example.com/sitemap.xml

# 改行区切りURL（複数host可）
sitesnap capture --input urls.txt
printf '%s\n' https://a.example/ https://b.example/ | sitesnap capture --input -

# 失敗したdesktop/mobile captureだけ再取得
sitesnap retry example.com

# archive一覧
sitesnap list
```

実行コマンドは常にJSONをstdoutへ出し、進捗だけをstderrへ出します。`--json` は互換用のno-opとして受け付けます。

## Commands

| コマンド | 用途 |
|---|---|
| `sitesnap capture <url>` | 単一ページをdesktop/mobileで収集 |
| `sitesnap capture --sitemap <url>` | sitemapを再帰展開して収集 |
| `sitesnap capture --input <file\|->` | 改行区切りURLを収集。空行と`#`コメントは無視 |
| `sitesnap retry <domain>` | manifestで失敗しているcaptureだけ再実行 |
| `sitesnap list` | archive indexをJSONで取得 |
| `sitesnap login <url>` | 人間がログインし、Playwright storage stateを保存 |

`capture`の入力はURL、`--sitemap`、`--input`のいずれか1つです。

## Capture options

| フラグ | 既定 | 説明 |
|---|---:|---|
| `--out <dir>` | `./sites` | archive root。`SITESNAP_OUT`でも指定可能 |
| `--limit <N>` | なし | filter後の先頭N URLだけ収集（captureのみ） |
| `--exclude <regex>` | なし | 一致するURLを除外（captureのみ） |
| `--concurrency <N>` | `3` | desktop/mobile captureの同時実行数 |
| `--min-interval <ms>` | `0` | 同一hostへの最小アクセス間隔 |
| `--wait-ms <ms>` | `0` | screenshot前の追加待機 |
| `--pre-scroll <full-page\|none>` | `full-page` | lazy-load用の事前scroll |
| `--force-visible` | off | scroll reveal要素を強制表示 |
| `--allow-private` | off | localhost/private networkを明示的に許可 |

各URLは固定の2条件で取得します。

- desktop: `1440 × 900`
- mobile: Playwright `iPhone 15`
- screenshot: full page

## Archive format

```text
sites/
├── index.json
└── example.com/
    ├── manifest.json
    ├── screenshots/
    │   ├── desktop/
    │   │   └── about--<hash>.png
    │   └── mobile/
    │       └── about--<hash>.png
    └── runs/
        └── latest.json
```

`manifest.json`はarchiveの累積状態です。再実行しても既存ページを保持し、入力元を`sources`履歴として残します。`runs/latest.json`は直近1回の実行状態です。`index.json`は正常archiveの`archives[]`と、読めないarchiveの`errors[]`を分けて保持します。

```json
{
  "schema_version": 1,
  "domain": "example.com",
  "sources": [{ "kind": "sitemap", "value": "https://example.com/sitemap.xml" }],
  "status": "complete",
  "pages": [
    {
      "url": "https://example.com/about",
      "slug": "about--0123456789abcdef",
      "title": "About",
      "captures": {
        "desktop": {
          "status": "success",
          "path": "screenshots/desktop/about--0123456789abcdef.png",
          "captured_at": "2026-07-24T00:00:00.000Z",
          "http_status": 200,
          "duration_ms": 912,
          "error": null
        },
        "mobile": {
          "status": "success",
          "path": "screenshots/mobile/about--0123456789abcdef.png",
          "captured_at": "2026-07-24T00:00:01.000Z",
          "http_status": 200,
          "duration_ms": 1042,
          "error": null,
          "device": "iPhone 15"
        }
      }
    }
  ]
}
```

### Statusとexit code

- `complete`: 全capture成功、exit 0
- `partial`: 成功と失敗が混在、exit 1
- `failed`: 全失敗またはarchive metadataを安全に更新できない、exit 1

HTTP 400以上も失敗です。複数host入力ではhostごとにDNS検証・収集・保存を独立して行い、1hostの失敗で後続hostを捨てません。壊れたmanifestや未知のschemaは上書きせず、indexの`errors[]`へ隔離します。`list`は正常archiveも返しますが、indexにerrorがあれば非ゼロ終了です。

## Authentication

```bash
# フォーム / SSO: 人間がブラウザでログインしてEnter
sitesnap login https://app.example.com/login -o auth.json
sitesnap capture https://app.example.com/dashboard --storage-state auth.json

# Header / Basic
sitesnap capture https://staging.example.com/ --header "Authorization: Bearer TOKEN"
SITESNAP_HTTP_CREDENTIALS='user:pass' sitesnap capture --sitemap https://staging.example.com/sitemap.xml
```

追加headerとHTTP Basic認証はcapture対象originだけに送られ、cross-originの子sitemap・redirect・subresourceへ転送されません。認証付きsitemapが別originのページを列挙した場合は撮影前に拒否します。複数originへ認証付きで収集する場合はoriginごとに実行を分けてください。

storage stateはログインセッションそのものです。`login`は保存ファイルを`0600`にしますが、必ず`.gitignore`へ追加し、共有しないでください。run artifactではheader値とBasic認証を`<redacted>`にします。

## Security

- `http:` / `https:`のみ許可
- DNS解決後を含め、loopback・private・link-local・特殊用途IPを既定で拒否
- sitemap redirect、子sitemap、browser subresource、WebSocketも同じpolicyで検証
- `--allow-private`は意図した内部targetにだけ使用
- archive pathとmanifest artifact pathのroot逸脱を拒否
- 未知・破損manifestはfail closedで保全

## Agent contract

エージェントは次の順で扱います。

1. `capture`を実行する。
2. stdout JSONの`success`、`status`、`archives[]`を読む。
3. 各archiveの`manifest`と`run_artifact`を成果物として報告する。
4. `run_artifact`があるcapture失敗だけ、内容を読んで`retry <domain>`する。`run_artifact: null`や`MANIFEST_INVALID` / `MANIFEST_SCHEMA_UNSUPPORTED`はretryせず、manifest修復または別`--out`へ分岐する。
5. 大規模sitemapは最初に`--limit`、本番収集は控えめな`--concurrency`と`--min-interval`を使う。

## 0.xからの移行

```text
site <sitemap>  → capture --sitemap <sitemap>
page <url>      → capture <url>
retry <domain>  → retry <domain>
list            → list
```

`meta.json`ではなくschema v1の`manifest.json`を読みます。旧archiveと同じ`--out`へ直接書かず、別directoryで1.0のarchiveを作り直してください。

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
bun run pack:smoke
```

Releaseは`v1.0.0`のようにpackage versionと一致するtagをpushすると、CIと同じgateの後にnpmへpublishされます。
