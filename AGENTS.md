# sitesnap — AI Agent Guide

## Purpose

`@hayashiii/sitesnap` collects remote websites into persistent desktop/mobile screenshot archives. It is not a development-loop UI verifier. Use `shimon` for project-defined UI cases, responsive checks, health checks, and implementation evidence.

## Commands

```bash
sitesnap capture <url>
sitesnap capture --sitemap <url>
sitesnap capture --input <file|->
sitesnap retry <domain>
sitesnap list
sitesnap login <url> -o auth.json
```

All operational output is JSON on stdout. Progress is stderr. `--json` is optional and accepted for compatibility.

## Agent workflow

1. Choose exactly one input: page URL, sitemap URL, or newline-delimited URL list.
2. For large sitemaps, explore with `--limit`; for full collection, keep `--concurrency` modest and add `--min-interval`.
3. Parse `success`, `status`, and `archives[]` from stdout.
4. Report each absolute `manifest` and `run_artifact` path.
5. Retry only capture failures with a non-null `run_artifact`, adjusting `--wait-ms`, `--pre-scroll`, or `--force-visible`. A null artifact or manifest/schema error requires repair or a new `--out`.

## Important behavior

- Every URL gets a full-page desktop `1440×900` capture and a Playwright `iPhone 15` capture.
- Exit 0 means `complete`. `partial` and `failed` exit 1 but still return structured JSON and any completed archives.
- HTTP 400+ is a failed capture.
- Multi-host DNS validation, capture, and persistence are isolated per host.
- `manifest.json` is cumulative; `runs/latest.json` describes only the latest run.
- Never edit, delete, or replace a corrupt/unsupported manifest automatically. sitesnap preserves it and reports an error.
- `index.json` keeps valid `archives[]` and unreadable `errors[]`; `list` exits non-zero when errors remain.

## Private and authenticated targets

- Public HTTP(S) is the default. Use `--allow-private` only when the user intentionally supplied a localhost/private target.
- `--header` and `--http-credentials` are origin-scoped. Do not split secrets across multiple origins in one invocation.
- An authenticated sitemap must list pages on its own origin; split cross-origin page collection into separate unauthenticated or origin-specific runs.
- Ask the user to perform `sitesnap login`; do not request their password. Treat the resulting storage state as a secret and ensure it is gitignored.
- Never echo header values, Basic credentials, or storage-state contents in reports.

## Recovery

| Error/status | Action |
|---|---|
| `PRIVATE_URL_BLOCKED` | Confirm the internal target is intentional, then add `--allow-private` |
| `URL_RESOLUTION_FAILED` | Check DNS and URL spelling |
| `SITEMAP_NOT_XML` | Use `capture <url>` for a normal HTML page |
| `SITEMAP_FETCH_FAILED` | Check auth, network, redirects, and robots.txt |
| `BROWSER_LAUNCH_FAILED` | Run `npx playwright install chromium` |
| `MANIFEST_NOT_FOUND` | Run `list`; collect the domain before retrying |
| `MANIFEST_INVALID` / `MANIFEST_SCHEMA_UNSUPPORTED` | Preserve the file and ask for archive repair or a new `--out` |
| `STORAGE_STATE_*` | Ask the user to recreate state with `login` |

## Out of scope

Do not use sitesnap for local UI checks, selector measurements, accessibility gates, arbitrary DOM interactions, `file://` mocks, or disposable one-off screenshots. Those responsibilities belong to shimon or a browser-capable development agent.
