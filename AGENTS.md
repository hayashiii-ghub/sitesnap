# AGENTS.md — sitesnap repository contributor guide

AIエージェント(Claude Code、Codex CLI、Aider など)が sitesnap リポジトリのコードに手を加える際の指針。

エンドユーザーが sitesnap を**使う**方法は [README.md](./README.md) を参照。本ファイルはこのコードベースを**開発する側**のためのもの。

---

## プロジェクト概要

- npm パッケージ名: `@hayashiii/sitesnap`
- 目的: Web サイトのスクリーンショットを一括キャプチャする CLI(デスクトップ + モバイル)
- ランタイム: Node.js 22+
- ライセンス: MIT
- 主要依存: Playwright、fast-xml-parser

## ファイル構成

| ファイル | 責任 |
|---|---|
| `cli.mjs` | エントリーポイント、argv パース、サブコマンド振り分け |
| `src/sitemap.mjs` | sitemap.xml の取得・解析(再帰ガード、URL検証、UA設定) |
| `src/capture.mjs` | Playwright でのスクリーンショット撮影、cross-origin 警告、rate limiter 統合 |
| `src/meta.mjs` | meta.json と index.json の生成、ページタイトル取得 |
| `src/url-guard.mjs` | SSRF 対策(プライベート IP・非 http スキーム拒否) |
| `src/rate-limit.mjs` | 同一ホストへの最小間隔制御 |
| `src/config.mjs` | `VERSION`、`USER_AGENT`、デフォルト値 |
| `tests/*.test.mjs` | Node.js 標準テストランナー(`node:test`)を使ったユニット/統合テスト |
| `docs/plans/` | 実装計画(機能ごとに 1 ファイル) |
| `docs/specs/` | ブレインストーミング後の設計仕様 |

## 開発コマンド

```bash
# テスト実行(必ず全件パス確認)
npm test

# 開発時の動作確認
node cli.mjs help
node cli.mjs --version
node cli.mjs site <sitemap-url> --limit 3

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

## リリース手順

1. `feat/v0.x.y` ブランチを切る
2. 実装 + 関連テストを追加
3. `npm test` で全件パス確認
4. `CHANGELOG.md` に新バージョンエントリ追加(`[Breaking Changes]` を含む場合は明記)
5. `package.json` の `version` を更新
6. main にマージしてプッシュ
7. `git tag v0.x.y && git push origin v0.x.y`
8. ユーザーが `npm publish --access public` を手動実行

## セキュリティ

- SSRF 対策: `src/url-guard.mjs` の `assertPublicUrl()` を**必ず**外部 URL のフェッチ前に呼ぶ。新しい fetch コードを書くときも同様
- ユーザー入力(URL)を直接 `path.join()` に渡さない。`slugify()` を経由する
- `--allow-private` フラグでガードを無効化する場合のみ、プライベート IP へのアクセスを許可

## 過去の検討事項

### Bunランタイムへの移行(2026-05-05、見送り)

学習目的でBunへの全面移行を実験。3段階(パッケージマネージャ・ランタイム・TypeScript化)を全て成功させたが、配布形態が変わる(ユーザーにBun事前インストールを要求する)割にエンドユーザーへの機能的メリットが薄かったため、mainには取り込まず実験ブランチとして保管した。

- ブランチ: [`experiment-bun`](https://github.com/hayashiii-ghub/sitesnap/tree/experiment-bun)
- 詳細記録: [`docs/specs/2026-05-05-bun-experiment.md`](https://github.com/hayashiii-ghub/sitesnap/blob/experiment-bun/docs/specs/2026-05-05-bun-experiment.md) (実験ブランチ上)
- 結論: 機能改善目的なら不要。Bun学習が動機なら良い題材だった

## 参考リンク

- npm: https://www.npmjs.com/package/@hayashiii/sitesnap
- GitHub: https://github.com/hayashiii-ghub/sitesnap
- Issue: https://github.com/hayashiii-ghub/sitesnap/issues
