# 認証機能の設計メモ (v0.7.0)

`--storage-state` / `--header` / `--http-credentials` / `login` コマンドの設計判断の記録。
使い方は README / SKILL.md / AGENTS.md を参照。ここには「なぜこの形か」だけを書く。

## 方式の対応関係

| 認証方式 | 手段 | シークレットの置き場所 |
|---|---|---|
| HTTP Basic (ステージング等) | `--http-credentials user:pass` | 引数 or `SITESNAP_HTTP_CREDENTIALS` 環境変数 |
| トークン / 固定ヘッダ | `--header "Authorization: Bearer TOKEN"` | 引数 |
| フォームログイン / SSO | `sitesnap login` → `--storage-state <file>` | storage state ファイル |

## なぜ `login` は手動対話式か (自動フォーム送信にしない)

技術的には Playwright でメール/パスワードを自動入力して送信し storageState を保存する
実装は可能。それでも「ヘッドありブラウザを開いて人間がログインし、ターミナルで Enter」
という形にしたのは意図的な判断:

1. **認証情報がツールに一切触れない。** パスワードは人間のブラウザとサイトの間しか
   通らず、CLI 引数 (`ps` で見える)・シェル履歴・エージェントの会話ログのどこにも残らない。
2. **AI エージェント運用と相性がいい。** エージェントにパスワードを渡すべきではない。
   エージェントは `login` コマンドをユーザーに提示して完了を待ち、以降は
   `--storage-state` を付けるだけ。この分業が SKILL.md の前提になっている。
3. **ヘッドあり = bot 検知を踏みにくい。** ヘッドレスは UA (`HeadlessChrome`) 等で
   サイト側から検知できる。invisible reCAPTCHA のようなログイン時 bot 対策は、
   人間が普通のブラウザ画面で操作すればほぼ問題にならない。
4. **SSO・2FA・パスキーにそのまま対応できる。** フォーム自動送信の実装はサイトごとの
   フォーム構造に依存するが、人間が操作する方式はログイン UI が何であっても動く。

## 認証情報の取り扱いルール

- パスワード・トークンを **AI エージェントとの会話に貼らない**(ログに残る)
- CLI 引数のシークレットはシェル履歴・`ps` に残る。Basic 認証は環境変数
  `SITESNAP_HTTP_CREDENTIALS` を推奨
- storage state ファイルは**ログインセッションそのもの**。`.gitignore` に追加し、
  `sites/` などコミット・アーカイブされる場所に置かない
- run 成果物 (`options.json`) はヘッダ値・認証情報を `<redacted>` で記録する
  (`redactAuthOptions`)。storage state は**パスのみ**記録し中身は書かない
- セッション期限切れ (401/403 に戻る) は `login` のやり直しで復旧する

## 将来の拡張判断: 無人自動ログイン

cron 等の無人運用でセッション切れを自動復旧したくなった場合のみ、
環境変数渡し (`SITESNAP_LOGIN_EMAIL` / `SITESNAP_LOGIN_PASSWORD` 等) の
ヘッドレス自動フォーム送信を**別コマンドとして**追加する。判断基準:

- 一発撮り・たまの手動更新 → 現状の手動 `login` で足りる (追加しない)
- 定期実行でセッション切れが運用ボトルネック → 追加を検討

その場合もパスワードを argv に乗せない (env のみ)、bot 検知・2FA があるサイトでは
成立しない場合があることをドキュメントに明記する。

## networkidle を待たない話 (同時期の関連修正)

広告・アナリティクスが常時通信するサイト (実測: あるメディアサイトで load 後 20 秒間に
501 リクエスト) では `waitUntil: "networkidle"` が確率的にタイムアウトする。
ナビゲーションは `load` で完了とし、networkidle は `networkIdleTimeout` (既定 10s)
を上限とするベストエフォート待ちに格下げした (`gotoAndSettle`)。
静かなページは従来どおり idle まで待ってから撮るので挙動は変わらない。
