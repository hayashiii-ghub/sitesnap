> 🇬🇧 [English](./README.en.md)

# @hayashiii/sitesnap

[![npm version](https://img.shields.io/npm/v/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

sitesnapは、Webサイトをデスクトップとモバイルのスクリーンショットとして収集し、あとから再取得できるアーカイブにまとめるPlaywright CLIです。

URLを渡すと、PNGだけでなく、収集結果を記録した`manifest.json`と直近の実行記録も保存します。
公開サイトの記録、参考サイトの収集、ポートフォリオ素材の保存に使います。

```text
URL / sitemap / URL一覧
          ↓
       sitesnap
          ↓
デスクトップPNG、モバイルPNG + manifest.json + runs/latest.json
```

## まず使う

Node.js 22以上が必要です。

```bash
npm install -g @hayashiii/sitesnap
npx playwright install chromium

sitesnap capture https://example.com/about
```

取得結果は既定で`./sites`へ保存されます。

```text
sites/
├── index.json
└── example.com/
    ├── manifest.json
    ├── screenshots/
    │   ├── desktop/
    │   └── mobile/
    └── runs/latest.json
```

コマンドの結果はJSONとしてstdoutへ、進捗はstderrへ出力されます。
AIエージェントはstdoutの`success`、`status`、`archives[]`を読めます。

## sitesnapとshimonの違い

sitesnapは「サイトを集めて残す」ためのツールです。
開発中のUIを検証するツールではありません。

| やりたいこと | 使うツール |
|---|---|
| 公開サイトや参考サイトをまとめて保存する | `sitesnap` |
| sitemapを定期的に収集する | `sitesnap` |
| 失敗したページだけ再取得する | `sitesnap` |
| 開発中UIのレスポンシブや状態を検証する | [`shimon`](https://github.com/hayashiii-ghub/shimon) |
| overflow、console error、a11yを確認する | [`shimon`](https://github.com/hayashiii-ghub/shimon) |

sitesnap 0.xにあった`shot`、`check`、`inspect`、`doctor`、`clean`、`open`は1.0で削除しました。

## 収集方法

### 1ページ

```bash
sitesnap capture https://example.com/about
```

### sitemap

```bash
sitesnap capture --sitemap https://example.com/sitemap.xml
```

sitemap indexと子sitemapも再帰的に展開します。
大きなsitemapは、最初に`--limit`で少数ページを試してください。

```bash
sitesnap capture --sitemap https://example.com/sitemap.xml --limit 20
```

### URL一覧

`--input`は、空行と`#`から始まるコメントを無視します。
複数ホストを含められます。

```bash
sitesnap capture --input urls.txt
printf '%s\n' https://a.example/ https://b.example/ | sitesnap capture --input -
```

## コマンド

| コマンド | 用途 |
|---|---|
| `sitesnap capture <url>` | 1ページをデスクトップとモバイルで収集 |
| `sitesnap capture --sitemap <url>` | sitemap内のページを収集 |
| `sitesnap capture --input <file\|->` | 改行区切りのURLを収集 |
| `sitesnap retry <domain>` | 失敗している取得だけ再実行 |
| `sitesnap list` | アーカイブ一覧をJSONで取得 |
| `sitesnap login <url>` | ブラウザでログインしてstorage stateを保存 |

`capture`では、URL、`--sitemap`、`--input`のいずれか1つを指定します。

## 取得条件とオプション

各URLは固定の2条件でフルページ撮影します。

- デスクトップ：`1440 × 900`
- モバイル：Playwright `iPhone 15`

| フラグ | 既定値 | 説明 |
|---|---:|---|
| `--out <dir>` | `./sites` | アーカイブの保存先。`SITESNAP_OUT`でも指定可能 |
| `--limit <N>` | なし | 絞り込み後の先頭N URLだけ収集 |
| `--exclude <regex>` | なし | 正規表現に一致するURLを除外 |
| `--concurrency <N>` | `3` | 同時取得数 |
| `--min-interval <ms>` | `0` | 同一ホストへの最小アクセス間隔 |
| `--wait-ms <ms>` | `0` | 撮影前の追加待機時間 |
| `--pre-scroll <full-page\|none>` | `full-page` | lazy-load用の事前スクロール |
| `--force-visible` | off | scroll reveal要素を強制表示 |
| `--allow-private` | off | localhostとprivate networkを許可 |

`--limit`と`--exclude`は`capture`だけで使用できます。

## 結果の読み方

実行結果の`status`は3種類です。

| status | 意味 | exit code |
|---|---|---:|
| `complete` | すべて成功 | `0` |
| `partial` | 成功と失敗が混在 | `1` |
| `failed` | すべて失敗、または安全に保存できない | `1` |

エージェントが最初に読むフィールドは次のとおりです。

```json
{
  "success": true,
  "schema_version": 1,
  "command": "capture",
  "status": "complete",
  "archives": [
    {
      "domain": "example.com",
      "manifest": "/absolute/path/sites/example.com/manifest.json",
      "run_artifact": "/absolute/path/sites/example.com/runs/latest.json"
    }
  ]
}
```

`manifest.json`はアーカイブの累積状態です。
再実行しても既存ページを保持し、入力元を`sources`へ記録します。
`runs/latest.json`は直近1回の実行結果、`index.json`は全アーカイブの一覧です。

HTTP 400以上も失敗として扱います。
複数ホストを入力した場合は、ホストごとに検証、取得、保存を分離するため、1ホストの失敗で後続ホストを捨てません。
壊れたmanifestや未知のschemaは上書きしません。

## 失敗したページを再取得する

```bash
sitesnap retry example.com
```

`retry`は`manifest.json`で失敗しているデスクトップまたはモバイル取得だけを再実行します。
`run_artifact`が`null`の場合や、`MANIFEST_INVALID`、`MANIFEST_SCHEMA_UNSUPPORTED`の場合は再取得せず、manifestを修復するか別の`--out`を指定してください。

## ログインが必要なサイト

フォーム、SSO、2要素認証がある場合は、人間がブラウザでログインしてstorage stateを保存します。

```bash
sitesnap login https://app.example.com/login -o auth.json
sitesnap capture https://app.example.com/dashboard --storage-state auth.json
```

Header認証とHTTP Basic認証も使用できます。

```bash
sitesnap capture https://staging.example.com/ --header "Authorization: Bearer TOKEN"
SITESNAP_HTTP_CREDENTIALS='user:pass' sitesnap capture --sitemap https://staging.example.com/sitemap.xml
```

追加headerとHTTP Basic認証は対象originだけに送信します。
cross-originの子sitemap、redirect、subresourceへは転送しません。
認証付きで複数originを収集する場合は、originごとに実行を分けてください。

storage stateはログインセッションそのものです。
保存ファイルを`.gitignore`へ追加し、共有しないでください。

## セキュリティ

- `http:`と`https:`だけを許可
- DNS解決後を含め、loopback、private、link-local、特殊用途IPを既定で拒否
- sitemapのredirect、子sitemap、ブラウザのsubresource、WebSocketにも同じポリシーを適用
- アーカイブとmanifestのパスが保存先の外へ出ることを拒否
- 未知または破損したmanifestを上書きせずに保全

`--allow-private`は、意図した内部サイトにだけ使用してください。

## 0.xからの移行

```text
site <sitemap>  → capture --sitemap <sitemap>
page <url>      → capture <url>
retry <domain>  → retry <domain>
list            → list
```

1.xは`meta.json`の代わりにschema v1の`manifest.json`を使用します。
0.xのアーカイブへ上書きせず、別の`--out`へ収集し直してください。

## 開発

```bash
bun install
bun run typecheck
bun test
bun run build
bun run pack:smoke
```

package versionと一致する`v1.0.0`形式のtagをpushすると、検証後にnpmへ公開します。
