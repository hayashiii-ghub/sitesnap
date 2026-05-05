# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes
- **Runtime is now Bun (≥1.3) instead of Node.js.** Users must install Bun before installing sitesnap. The `preinstall` script will fail with a clear message if Bun is not on PATH. Install via `brew install oven-sh/bun/bun` or `curl -fsSL https://bun.sh/install | bash`.
- `bin` now points to `cli.ts` (was `cli.mjs`). Bun executes TypeScript directly; no compilation step is required.

### Changed
- All source files migrated from `.mjs` to `.ts`. Type annotations are minimal at this stage; the codebase is essentially renamed JavaScript and can be progressively typed.
- Test runner switched from `node --test` (invoked as `npm test`) to `bun test`. Tests still use the `node:test` API, which Bun's compatibility layer handles natively. The single incompatibility encountered was `mock.fn`; affected tests now use plain async functions (call tracking was already manual via push).
- Package manager switched from pnpm to bun (`bun.lock` replaces `pnpm-lock.yaml`).
- `engines` field updated from `node >= 22` to `bun >= 1.3`.
- CI workflow (`.github/workflows/ci.yml`) ported to `oven-sh/setup-bun@v2`, `bun install --frozen-lockfile`, `bun test`, `bun cli.ts ...`.
- README and AGENTS.md updated to reflect Bun-based install and development workflow.

### Added
- `tsconfig.json` for editor support (no compilation; Bun runs `.ts` directly).
- `preinstall` script that errors clearly if Bun is missing on the user's machine.

### Migration notes for existing users
- Uninstall the old version (`npm uninstall -g @hayashiii/sitesnap`), install Bun, then reinstall (`bun install -g @hayashiii/sitesnap`).
- Captured output (`sites/<domain>/...` and `meta.json` schema) is unchanged and remains backward-compatible.
- All CLI commands and flags are unchanged.

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
