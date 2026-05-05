# AGENTS.md — sitesnap repository contributor guide

AIエージェント(Claude Code、Codex CLI、Aider など)が sitesnap リポジトリのコードに手を加える際の指針。

エンドユーザーが sitesnap を**使う**方法は [README.md](./README.md) を参照。本ファイルはこのコードベースを**開発する側**のためのもの。

---

## プロジェクト概要

- npm パッケージ名: `@hayashiii/sitesnap`
- 目的: Web サイトのスクリーンショットを一括キャプチャする CLI(デスクトップ + モバイル)
- ランタイム: **Bun 1.3+**(v0.3 で Node.js から移行)
- 言語: TypeScript(Bun が `.ts` を直接実行するためコンパイル不要)
- ライセンス: MIT
- 主要依存: Playwright、fast-xml-parser

## ファイル構成

| ファイル | 責任 |
|---|---|
| `cli.ts` | エントリーポイント、argv パース、サブコマンド振り分け |
| `src/sitemap.ts` | sitemap.xml の取得・解析(再帰ガード、URL検証、UA設定) |
| `src/capture.ts` | Playwright でのスクリーンショット撮影、cross-origin 警告、rate limiter 統合 |
| `src/meta.ts` | meta.json と index.json の生成、ページタイトル取得 |
| `src/url-guard.ts` | SSRF 対策(プライベート IP・非 http スキーム拒否) |
| `src/rate-limit.ts` | 同一ホストへの最小間隔制御 |
| `src/config.ts` | `VERSION`、`USER_AGENT`、デフォルト値 |
| `tests/*.test.ts` | `node:test` API のユニット/統合テスト(Bun の互換ランナーで実行) |
| `tsconfig.json` | エディタ向けの最小 TS 設定(noEmit、Bun が実行を担当) |
| `docs/plans/` | 実装計画(機能ごとに 1 ファイル) |
| `docs/specs/` | ブレインストーミング後の設計仕様 |

## 開発コマンド

```bash
# 依存インストール
bun install

# テスト実行(必ず全件パス確認)
bun test

# 開発時の動作確認
bun cli.ts help
bun cli.ts --version
bun cli.ts site <sitemap-url> --limit 3

# npm publish 前の最終チェック
npm pack --dry-run
```

## コーディング方針

- **コメントは「why が非自明」な時のみ書く**。「what」を書かない(コードが自明に語る)
- **新規依存パッケージを増やさない**。今ある 2 つ(Playwright、fast-xml-parser)で済ませる
- **TDD**: 失敗テスト → 実装 → パス確認 → コミットの順
- **ファイルの単一責任**: `src/` の各モジュールはこれを守る。新機能で巨大化させない
- **コミットプレフィックス**: `feat:`、`fix:`、`chore:`、`docs:`、`test:`、`i18n:`、`refactor:` を使う
- **ユーザー向け文字列は日本語**(v0.2.1〜)。技術ログ(`[desktop] 1/3 ok`)は英語のまま視認性優先
- **エラーメッセージはアクション可能**: 何が起きたか + どう直せるか をワンセットで

## やってはいけないこと

- `node_modules/`、`sites/`、`note-draft.md` をコミットしない(全て `.gitignore` 対象)
- `main` ブランチで直接作業しない。`feat/v0.x.y` ブランチを切ってマージする
- `npm publish` を AI エージェントが実行しない。**ユーザーが手動で行う**
- 既存テストの正規表現マッチを無断で緩めない(バグを隠す可能性がある)
- npm pack に含めるべきでないファイル(plans、specs、tests、docs)を `package.json` の `files` 配列に追加しない
- Bun を前提としたコード(`bun:test` 専用 API、`Bun.serve()` 等)に移行する場合は事前に相談する。現状は意図的に `node:test` を使い、Bun の互換性に頼っている

## リリース手順

1. `feat/v0.x.y` ブランチを切る
2. 実装 + 関連テストを追加
3. `bun test` で全件パス確認
4. `CHANGELOG.md` に新バージョンエントリ追加(`[Breaking Changes]` を含む場合は明記)
5. `package.json` の `version` を更新
6. `npm pack --dry-run` で配布ファイル(`cli.ts`、`src/`、`README*`、`CHANGELOG.md`、`LICENSE`)が正しく含まれていることを確認
7. main にマージしてプッシュ
8. `git tag v0.x.y && git push origin v0.x.y`
9. ユーザーが `npm publish --access public` を手動実行

## セキュリティ

- SSRF 対策: `src/url-guard.ts` の `assertPublicUrl()` を**必ず**外部 URL のフェッチ前に呼ぶ。新しい fetch コードを書くときも同様
- ユーザー入力(URL)を直接 `path.join()` に渡さない。`slugify()` を経由する
- `--allow-private` フラグでガードを無効化する場合のみ、プライベート IP へのアクセスを許可

## 参考リンク

- npm: https://www.npmjs.com/package/@hayashiii/sitesnap
- GitHub: https://github.com/hayashiii-ghub/sitesnap
- Issue: https://github.com/hayashiii-ghub/sitesnap/issues
