# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-05-27

### Added
- **`sitesnap doctor <run-dir>`**: diagnose a capture run from `runs/latest/result.json`, summarizing failed captures, blank-looking screenshots, timeouts, and HTTP errors.
- **Agent handoff files**: `sitesnap doctor <run-dir> --agent-task` now generates `diagnosis.md`, `agent-task.md`, and `suggested-sitesnap.config.json` for Codex, Claude Code, Webwright, or other browser-capable agents.
- **Run artifacts**: `site`, `page`, and `retry` now write `runs/latest/result.json` and `runs/latest/options.json` so failed runs can be inspected after capture.
- **Capture tuning flags**: added `--wait-ms <ms>` and `--pre-scroll <full-page|none>` for retrying pages that need extra wait time or custom pre-screenshot scrolling.

### Notes
- Webwright, LLM API keys, Python, and agent runtimes are not bundled with sitesnap. Agent-assisted diagnosis is opt-in via generated handoff files.
- Config auto-loading is not included in this release; `suggested-sitesnap.config.json` is an agent/human review artifact for now.

## [0.3.0] - 2026-05-07

### Changed
- **TypeScript migration**: all modules migrated from `.mjs` to `.ts` (Bun for development + Node.js-compatible ESM bundle for distribution).
- **bin**: switched from `cli.mjs` to `dist/cli.js` (bundled by `bun build`).
- **Test runner**: switched from `node:test` to `bun test`.

### Added
- **Structured errors**: introduced the `SiteSnapError` class and `ErrorCode` type. Every thrown exception now carries `code` + `message` + `hint` + `context`.
- **Unified `--json` output schema**: aligned with `@hayashiii/pdfmint` — `{ success, ... }` for success and `{ success: false, error: { code, ... } }` for failure.
- **AGENTS.md rewritten**: now an AI-agent-facing usage guide (was repository contributor guide before).
- **`skills/sitesnap/SKILL.md`**: relocated and unified with the same template as pdfmint.

### Migration
- Existing users can upgrade via `npm install -g @hayashiii/sitesnap@latest`.
- The CLI command API is unchanged (`sitesnap site / page / list / open / retry` all behave the same).

## [0.2.1] - 2026-05-04

### Added
- `--version` / `-v` flag: print the installed version and exit.
- Friendly Japanese error when `site` is given an HTML URL instead of a sitemap; suggests using `page` or checking `/robots.txt` for the actual sitemap path.

### Changed
- All user-facing CLI text (errors, help, progress messages) is now in Japanese to match the Japanese-default README. Worker progress lines (`[desktop] 1/3 ok URL`) keep the English status codes for at-a-glance readability.

### Notes for downstream scripts
This release changes log/error string formats. Scripts that grep stdout/stderr for English keywords like "Done:", "Found", or "Refusing to fetch" need to update to the Japanese equivalents (or use `--json` for stable structured output, which is unaffected).

## [0.2.0] - 2026-05-04

### Breaking Changes
- Captures targeting **private/loopback hosts** (localhost, 127.x, 10.x, 192.168.x, 172.16-31.x, 169.254.x, IPv6 link-local/unique-local) are now refused by default. If you were previously using sitesnap against staging/internal sites, append `--allow-private` to your existing commands.
- Non-`http`/`https` URLs (`file://`, `ftp://`, `data:`) are rejected outright with no opt-in.

### Security
- **SSRF prevention**: `expandSitemap` and `captureUrls` now refuse loopback / RFC1918 / link-local IPs and `localhost`. Use `--allow-private` to opt in.
- **Protocol whitelist**: only `http://` and `https://` URLs are accepted (rejects `file://`, `ftp://`, `data:`).
- **Sitemap recursion guard**: cyclic `sitemapindex` references are detected and skipped; nesting capped at depth 5.
- **Identifiable User-Agent**: all outbound requests now send `sitesnap/<version> (+<homepage>)` instead of Node default / generic `Mozilla/5.0`.
- **Slugify hardening**: `..` sequences and leading/trailing punctuation are neutralized to prevent surprising filenames.

### Added
- `--limit <N>`: cap captures to the first N URLs (after exclusion).
- `--exclude <regex>`: skip URLs matching the given regular expression.
- `--concurrency <N>`: override the worker count from the CLI.
- `--min-interval <ms>`: minimum spacing between requests to the same host.
- `--strict`: exit non-zero if any page fails to capture (CI-friendly).
- `--allow-private`: opt in to private/loopback hosts.
- Cross-origin warning when sitemap URLs span multiple hostnames.

### Changed
- Test suite added using the built-in `node:test` runner. Run with `npm test`.
- Internal: extracted `src/url-guard.mjs` and `src/rate-limit.mjs`.

## [0.1.4] - 2026-05-04

### Added
- Hint message after capture suggesting `--force-visible` flag when screenshots may be blank (helps users discover the flag without making it default).

## [0.1.3] - 2026-05-04

### Changed
- **Bumped minimum Node.js version to 22** (was 18). Node 18 reached end-of-life in 2025-04; Node 22 is the current Active LTS.
- CI workflow now runs on Node 22.

## [0.1.2] - 2026-05-04

### Added
- Cross-platform support for `sitesnap open` command (Linux: `xdg-open`, Windows: `explorer`).
- README badges (npm version, downloads, license, Node version requirement).
- `CHANGELOG.md` (this file).
- GitHub Actions CI workflow (smoke tests on push / pull request).

### Changed
- GitHub repository metadata: description, homepage URL, and topics for discoverability.

## [0.1.1] - 2026-05-04

### Changed
- Updated `package.json` URLs (`homepage`, `repository`, `bugs`) to point to the renamed GitHub repository (`hayashiii-ghub/sitesnap`).

## [0.1.0] - 2026-05-04

### Added
- Initial public release as `@hayashiii/sitesnap`.
- CLI entry point (`sitesnap`) with subcommands: `site`, `page`, `list`, `open`, `retry`, `help`.
- Sitemap auto-expansion (handles `sitemapindex` recursively).
- Per-domain output structure (`sites/<domain>/{desktop,mobile}/<slug>.png` plus `meta.json`).
- `--json` global flag for structured stdout output (progress logs to stderr).
- `--force-visible` global flag to override scroll-reveal libraries (AOS, wow.js, etc.) that produce blank screenshots.
- `--out <dir>` global flag and `SITESNAP_OUT` environment variable for custom output directories.
- Animation-handling defaults: `prefers-reduced-motion: reduce`, CSS animation/transition shrinkage, font/image readiness waits.
- Bilingual README (English + Japanese).
- Claude Code skill at `.claude/skills/sitesnap/SKILL.md` for native AI invocation.
- MIT License.
