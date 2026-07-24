---
name: sitesnap
description: AIエージェントが単一URL、sitemap、URLリストからWebサイトをdesktop/mobile PNGとmanifest.jsonへ永続収集し、失敗分を再取得するためのCLI。参考サイト、公開サイト、ポートフォリオ素材のarchiveで使う。開発中UIの品質検証やresponsive caseにはshimonを使う。
---

# sitesnap Skill

## Use when

- ユーザーがWebサイトを参考資料・ポートフォリオ素材として保存したい
- sitemap全体をdesktop/mobileで一括収集したい
- 複数URLを同じschemaのarchiveへ保存したい
- 以前失敗したcaptureだけ再取得したい

開発中UIの検証、health check、要素計測、responsive case、任意DOM状態の証拠取得には使わない。その用途は`shimon`。

## Invoke

```bash
sitesnap capture https://example.com/about
sitesnap capture --sitemap https://example.com/sitemap.xml --limit 20
sitesnap capture --input urls.txt --concurrency 3 --min-interval 250
sitesnap retry example.com --wait-ms 1000 --force-visible
sitesnap list
```

stdoutは常にJSON。`--json`は不要だが付けてもよい。進捗はstderr。

## Required loop

1. URL、`--sitemap`、`--input`から入力を1つ選ぶ。
2. localhost/private targetは意図を確認した場合だけ`--allow-private`を付ける。
3. JSONの`success`、`status`、`summary`、`archives[]`を読む。
4. `manifest`と`run_artifact`の絶対パスをユーザーへ返す。
5. 非nullの`run_artifact`があるcapture失敗だけ対象domainを`retry`する。artifactが無い場合やmanifest/schema errorは修復または別`--out`へ分岐する。

## Output semantics

- `complete`: exit 0
- `partial` / `failed`: exit 1。ただしstdout JSONと成功済み成果物は残る
- `manifest.json`: archiveの累積状態
- `runs/latest.json`: 直近runだけの状態
- `index.json`: 正常な`archives[]`と読めない`errors[]`。errorがあれば`list`は非ゼロ終了
- desktop: 1440×900 full-page
- mobile: Playwright iPhone 15 full-page

## Auth

```bash
sitesnap login https://app.example.com/login -o auth.json
sitesnap capture https://app.example.com/dashboard --storage-state auth.json
sitesnap capture https://staging.example.com/ --header "Authorization: Bearer TOKEN"
SITESNAP_HTTP_CREDENTIALS='user:pass' sitesnap capture --sitemap https://staging.example.com/sitemap.xml
```

- `login`はユーザー本人に実行してもらう。
- storage state、token、passwordを読み上げたり報告へ貼らない。
- header/Basicはtarget originだけに送られる。認証付きsitemapのpageも同一originに限定されるため、複数originは実行を分ける。

## Recovery

- `PRIVATE_URL_BLOCKED`: 意図したprivate targetのみ`--allow-private`
- `SITEMAP_NOT_XML`: 通常ページなら`capture <url>`
- `BROWSER_LAUNCH_FAILED`: `npx playwright install chromium`
- `MANIFEST_NOT_FOUND`: `list`でdomain確認
- `MANIFEST_INVALID` / `MANIFEST_SCHEMA_UNSUPPORTED`: 既存fileを触らず、新しい`--out`または修復を提案
- blank/lazy content: `retry <domain> --force-visible --wait-ms 1000`

大規模収集は最初に`--limit`で試し、本番では控えめな`--concurrency`と`--min-interval`を使う。
