# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-07-24

### Added
- One collection entry point: `capture <url>`, `capture --sitemap <url>`, or `capture --input <file|->`.
- Schema-v1 cumulative `manifest.json`, per-run `runs/latest.json`, and root `index.json` artifacts.
- Multi-host URL-list collection with independent per-host archives and partial-failure reporting.
- Archive index errors are isolated per directory, so valid archives remain listable beside corrupt or future-schema manifests.
- Deterministic full-page desktop (1440×900) and mobile (Playwright iPhone 15) captures.
- `retry <domain>` now retries only failed desktop/mobile captures from the manifest.

### Changed
- Repositioned sitesnap as an AI-agent-first website collection/archive tool. Development-loop UI verification belongs to shimon.
- Operational commands always emit JSON to stdout; `--json` remains an accepted compatibility no-op.
- Capture failure is strict by default: `partial` and `failed` exit non-zero while preserving completed artifacts.
- File names use a readable slug plus a 64-bit SHA-256 prefix to distinguish query and URL variants.
- CI, release, and package smoke tests verify the v1 command and artifact contract.
- **Release gate no longer breaks on npm 12.** `pack:smoke` accepts both historical `npm pack --json` response shapes.

### Removed
- Removed the 0.x `site`, `page`, `shot`, `check`, `inspect`, `doctor`, `clean`, and `open` commands.
- Removed `meta.json`, disposable shot storage, UI health checks, DOM inspection, diagnosis files, broad mobile profiles, and the `axe-core` runtime dependency.

### Security
- DNS-aware SSRF protection now covers redirects, recursive sitemaps, browser subresources, and WebSockets, including special-use IPv4/IPv6 ranges.
- Header and HTTP Basic credentials are restricted to one target origin and never forwarded cross-origin.
- Authenticated sitemaps reject cross-origin page targets before browser work, and `login` saves storage state with mode `0600`.
- Archive and manifest artifact paths are containment-checked.
- Corrupt and unsupported manifests fail closed and are never silently overwritten.
- Run artifacts redact header and Basic credential values.

### Migration
- `site <sitemap>` becomes `capture --sitemap <sitemap>`; `page <url>` becomes `capture <url>`.
- v1 uses `manifest.json` instead of `meta.json`. Re-collect into a new output directory rather than mixing 0.x and 1.x archives.
- CI and release pin the same npm major (`npm@^12`) so publishing behavior is tested before tag release.

## [0.7.0] - 2026-07-16

### Added
- **Authenticated captures.** Three new flags, shared by `site` / `page` / `shot` / `inspect` / `check` / `retry`:
  - `--storage-state <file>` loads a Playwright storage state JSON (cookies + localStorage) into the browser context. Invalid or missing files fail fast with the new structured errors `STORAGE_STATE_NOT_FOUND` / `STORAGE_STATE_INVALID`.
  - `--header "Name: value"` (repeatable) sends extra headers on every request — Bearer tokens, fixed cookies, proxy auth. Also applied to sitemap and title fetches.
  - `--http-credentials <user:pass>` answers HTTP Basic auth challenges; also settable via the `SITESNAP_HTTP_CREDENTIALS` env var to keep credentials out of shell history. Sitemap/title fetches send the matching `Authorization: Basic` header.
- **`sitesnap login <url>`**: opens a headed browser so a human can log in (forms, SSO); pressing Enter in the terminal saves the session to a storage state file (`-o <path>`, default `./sitesnap-state.json`) ready for `--storage-state`.

### Fixed
- **Navigation no longer gambles on `networkidle`.** Sites with continuous ad/analytics traffic (news and media sites) never produce the 500ms network gap Playwright's `waitUntil: "networkidle"` requires, so `site` / `page` / `shot` / `inspect` / `check` timed out on them at random (observed: 500+ requests in the 20s after `load` on one media homepage). Navigation now completes on `load`, then waits for `networkidle` as a best effort capped at 10s (`networkIdleTimeout`) — quiet pages behave exactly as before, busy pages proceed to capture instead of failing.

### Security
- Run artifacts (`options.json`) redact header values and HTTP credentials as `<redacted>` so secrets never land in captured archives.

## [0.6.5] - 2026-07-07

### Added
- **`--mobile-profile broad`**: capture each page on three mobile devices — `iPhone 17` (default, still at `mobile/<slug>.png`), `iPhone SE (3rd gen)` (`mobile/iphone-se-3rd-gen/<slug>.png`), and `Pixel 10` (`mobile/pixel-10/<slug>.png`). When used, `meta.json` gains a `mobile_variants` map (including the default device) while the existing `mobile` field stays unchanged.

### Changed
- **Default mobile device for `site` / `page` is now `iPhone 17`** (was `iPhone 13`). Output paths and the `mobile` / `mobile_path` JSON fields are unchanged.
- **`--concurrency` now limits all capture tasks** (URL × viewport/device), not per-mode URL batches. Example: 10 URLs with `--mobile-profile broad` queues 40 tasks (10 desktop + 30 mobile) and runs up to `--concurrency` at a time.
- **Playwright dependency bumped to 1.61.1** so `iPhone 17` and `Pixel 10` device descriptors resolve at runtime.

## [0.6.4] - 2026-06-22

### Fixed
- **`retry` now honors `--min-interval`.** Only `site` applied the per-host rate limiter; `retry` silently ignored the flag and re-fetched failed pages with no spacing. Both commands now share the limiter resolved once in argument parsing.

## [0.6.3] - 2026-06-22

### Fixed
- **`list --shots` and `clean` now look where `shot` actually writes.** Since 0.6.2 `shot` defaults to the OS cache dir, but `list --shots` / `clean` still scanned `./sites/`, so by default the documented capture → `list --shots` → `clean` housekeeping loop silently found nothing. All three now share one resolved shot directory (cache by default, or `--out` / `SITESNAP_OUT` when set).

### Changed
- **Command failures now emit the structured error envelope.** Missing arguments and the `open` / `retry` / `doctor` not-found cases previously printed a bare line to stderr; they now flow through the same `{ success: false, error: { code, ... } }` path as other errors, so `--json` consumers get a parseable result (`INVALID_OPTION`, `DOMAIN_NOT_FOUND`, `META_NOT_FOUND`, `RUN_DIR_NOT_FOUND`).
- `list --json` output is now compact (single line), matching every other command (was pretty-printed).

### Removed
- Dropped three `ErrorCode`s that were never thrown (`PAGE_LOAD_FAILED`, `SCREENSHOT_FAILED`, `OUTPUT_DIR_NOT_WRITABLE`) and removed them from the agent-facing error tables; per-page capture failures are reported in the success envelope's `errors[]`, not thrown.

### Docs
- Finished the 0.6.2 shot-cache story across `README` / `README.en` / `AGENTS.md` / `SKILL.md` and `--help` (shot default location, `-o/--out-file`), and filled doc gaps (`run_dir`, `created_at`, `--limit`'s inspect meaning, `clean`/`doctor` in the quick reference).

## [0.6.2] - 2026-06-22

### Added
- **`shot -o, --out-file <path>`**: write the single screenshot directly to an exact path (parent directories are created), and `--json` returns that path as `file`. An agent's "capture and place it here" is now one command instead of capture → read JSON → `cp`. Mutually exclusive with `--out`; `shot` only.
- **`--help` / `-h` after a subcommand**: `sitesnap shot --help` (and any other subcommand) now prints help and exits 0 instead of failing as an unknown option.

### Changed
- **`shot` no longer writes into the current directory by default.** Without `--out` / `--out-file` / `SITESNAP_OUT`, shots now go to an OS cache directory (`$XDG_CACHE_HOME/sitesnap`, else `~/.cache/sitesnap`) instead of `./sites/`, so running `shot` inside an unrelated git repo no longer creates a stray, un-gitignored `sites/`. The `site`/`page` archives are unchanged (still `./sites/`); pass `--out <dir>` to restore the previous shot location.
- `file://` shot filenames are now basename-based instead of encoding the full absolute path (e.g. `dashboard-mockup.html--1440x900--full.png` rather than `Users_home_..._dashboard-mockup.html--...`).
- Documented that `--force-visible` also fixes Framer Motion (`motion/react`) `whileInView` reveals, with a `--pre-scroll full-page --force-visible --settle <ms>` recipe in the README/AGENTS docs.

## [0.6.1] - 2026-06-18

### Changed
- **Repositioned the docs and package metadata** to lead with the AI dev loop (`shot` → `check` → `inspect` and pre-shot `--click`/`--eval`/`--label`/`--allow-file`), with sitemap bulk capture and portfolio collection as secondary uses. Rewrote the README/README.en opening and Quick Start, the `package.json` description and keywords (npm discoverability), and the agent-facing `AGENTS.md` and `skills/sitesnap/SKILL.md` (the skill description drives when an agent selects the tool). Docs and metadata only — no behavior change.

## [0.6.0] - 2026-06-18

### Added
- **`shot` pre-shot interaction**: `--click <css>` (repeatable), `--eval <js>`, and `--label <name>` let you set DOM state — CSS radio tabs, `<details>` toggles — before the capture and keep state variants in separate files (without `--label`, variants of the same url/viewport overwrite each other).
- **`shot --allow-file`**: capture local HTML mocks over `file://` with no dev server. Gated opt-in; `shot` only (site/page/check/inspect still reject `file://`). Those shots go under `_file/`.
- **`sitesnap clean [host]`**: delete accumulated shots under `sites/<host>/shots/`, with `--older-than <days>` and `--dry-run`. Only ever touches `shots/` — never the `site`/`page` archives (`desktop/`, `mobile/`, `meta.json`). No interactive prompt, so agents can automate it.
- **`sitesnap list --shots`**: list shots per host (file count, total bytes, latest mtime) so you can see what has accumulated.
- `shot` JSON now includes `created_at` (ISO) for staleness checks.

### Changed
- `--click` on a present-but-unactionable element (e.g. `display:none`) now surfaces as `INTERACTION_FAILED` with a hint instead of a raw Playwright timeout.

## [0.5.0] - 2026-06-13

### Fixed
- **Desktop captures now honor the configured 1440×900 viewport.** Viewport options were spread at the top level of `browser.newContext()`, so Playwright silently fell back to its 1280×720 default. Regression-tested against actual PNG dimensions.

### Added
- **`sitesnap check <url>`**: one-shot page health gate — horizontal overflow (with offending elements), console errors, failed requests (network failures + HTTP >= 400), and axe-core accessibility violations as a pass/fail JSON report. Default is report-only (exit 0); `--strict` exits non-zero on failure for CI use. Adds `axe-core` as a runtime dependency.
- **`sitesnap inspect <url> --selector <css>`**: numeric element checks for AI verification loops — computed styles (default set + `--props`), bounding boxes, text, and overflow amounts (`scrollWidth - clientWidth`) as JSON. Zero matches returns `count: 0` instead of an error. Shares `--vp` / `--device` / `--settle` with `shot`.
- **`sitesnap shot <url>`**: one-off dev-loop screenshot command. Captures viewport-only by default (AI-readable), supports `--vp <WxH>`, `--device <name>`, `--selector <css>` (element-only), `--settle <ms>` (wait for entrance animations instead of freezing them), and `--full`. Returns the absolute PNG path in JSON, never touches meta.json, and splits localhost output per port (`localhost_3000/`).
- `page --json` now returns `desktop_path` / `mobile_path` with absolute paths to the captured images, so agents no longer need to read `meta.json` to locate files.
- Added `pack:smoke` to verify npm package contents and the installed `sitesnap --version` command before publishing.
- Added CI verification for the npm package smoke test.
- Added README JSON output examples and development instructions aligned with `@hayashiii/pdfmint`.
- Added validation for numeric CLI flags before command execution.

### Changed
- Expanded `AGENTS.md` and `skills/sitesnap/SKILL.md` with clearer AI-agent invocation, retry, diagnosis, and recovery guidance.
- Aligned README flag tables with the `@hayashiii/pdfmint` format by documenting defaults and descriptions.
- Refactored command handlers to return structured command results instead of writing directly to process state.
- Refactored the capture pipeline into target resolution, directory preparation, worker execution, and injectable progress logging.
- Aligned subcommand argument validation with `@hayashiii/pdfmint` by rejecting extra positional arguments before command execution.

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
