# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
