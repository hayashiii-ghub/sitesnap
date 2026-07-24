> 🇯🇵 [日本語](./README.md)

# @hayashiii/sitesnap

[![npm version](https://img.shields.io/npm/v/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Playwright CLI for AI agents to collect websites into reproducible desktop/mobile evidence archives.

## Scope

sitesnap 1.x only collects and archives sites. Use [`shimon`](https://github.com/hayashiii-ghub/shimon) for development-loop UI cases, responsive verification, health checks, and task evidence.

The 0.x `shot`, `check`, `inspect`, `doctor`, `clean`, and `open` commands were removed in 1.0.

## Install

```bash
npm install -g @hayashiii/sitesnap
npx playwright install chromium
```

Node.js 22+ is required.

## Quick start

```bash
sitesnap capture https://example.com/about
sitesnap capture --sitemap https://example.com/sitemap.xml
sitesnap capture --input urls.txt
printf '%s\n' https://a.example/ https://b.example/ | sitesnap capture --input -
sitesnap retry example.com
sitesnap list
```

Operational commands always emit JSON to stdout and progress to stderr. `--json` remains an accepted no-op.

## Commands

| Command | Purpose |
|---|---|
| `sitesnap capture <url>` | Collect one page at desktop and mobile sizes |
| `sitesnap capture --sitemap <url>` | Recursively expand and collect a sitemap |
| `sitesnap capture --input <file\|->` | Collect newline-delimited URLs; ignores blanks and `#` comments |
| `sitesnap retry <domain>` | Retry only failed captures in the manifest |
| `sitesnap list` | Return the archive index as JSON |
| `sitesnap login <url>` | Save an interactive Playwright storage state |

Exactly one capture input is required: positional URL, `--sitemap`, or `--input`.

## Capture options

| Flag | Default | Description |
|---|---:|---|
| `--out <dir>` | `./sites` | Archive root; also `SITESNAP_OUT` |
| `--limit <N>` | none | Keep the first N filtered URLs (`capture` only) |
| `--exclude <regex>` | none | Exclude matching URLs (`capture` only) |
| `--concurrency <N>` | `3` | Concurrent desktop/mobile captures |
| `--min-interval <ms>` | `0` | Minimum interval per host |
| `--wait-ms <ms>` | `0` | Additional wait before screenshots |
| `--pre-scroll <full-page\|none>` | `full-page` | Pre-scroll for lazy-loaded content |
| `--force-visible` | off | Force scroll-reveal elements visible |
| `--allow-private` | off | Explicitly allow localhost/private networks |

Every URL is captured as a full page at desktop `1440×900` and Playwright `iPhone 15` mobile settings.

## Archive format

```text
sites/
├── index.json
└── example.com/
    ├── manifest.json
    ├── screenshots/{desktop,mobile}/<slug>--<hash>.png
    └── runs/latest.json
```

`manifest.json` is cumulative and retains prior pages and source history. `runs/latest.json` describes only the latest run. `index.json` separates readable `archives[]` from unreadable archive `errors[]`. All use `schema_version: 1`.

Statuses are `complete`, `partial`, or `failed`. Only `complete` exits 0. HTTP 400+ counts as failure. Multi-host DNS validation, capture, and persistence are isolated per host. Corrupt or unsupported manifests are preserved and isolated in index `errors[]`; `list` still returns valid archives but exits non-zero when the index has errors.

Retry only when an archive reports a capture failure and provides a `run_artifact`. A null run artifact or `MANIFEST_INVALID` / `MANIFEST_SCHEMA_UNSUPPORTED` requires archive repair or a new `--out`, not another retry.

## Authentication

```bash
sitesnap login https://app.example.com/login -o auth.json
sitesnap capture https://app.example.com/dashboard --storage-state auth.json
sitesnap capture https://staging.example.com/ --header "Authorization: Bearer TOKEN"
SITESNAP_HTTP_CREDENTIALS='user:pass' sitesnap capture --sitemap https://staging.example.com/sitemap.xml
```

Headers and HTTP Basic credentials are sent only to the target origin, never to cross-origin child sitemaps, redirects, or subresources. An authenticated sitemap that lists pages on another origin is rejected before browser work. Split authenticated multi-origin work into one invocation per origin. `login` saves storage state with mode `0600`; still treat it as a secret and gitignore it. Run artifacts redact header and Basic credential values.

## Security

- Allows only HTTP(S).
- Rejects loopback, private, link-local, and special-use addresses after DNS resolution by default.
- Applies the policy to redirects, child sitemaps, browser subresources, and WebSockets.
- Prevents archive and manifest paths from escaping their roots.
- Fails closed on corrupt or unknown manifest schemas.

Use `--allow-private` only for an intended internal target.

## Migration from 0.x

```text
site <sitemap>  → capture --sitemap <sitemap>
page <url>      → capture <url>
retry <domain>  → retry <domain>
list            → list
```

1.x replaces `meta.json` with schema-v1 `manifest.json`. Re-collect into a new output directory instead of writing over a 0.x archive.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
bun run pack:smoke
```
