> 🇯🇵 [日本語版](./README.md)

# @hayashiii/sitesnap

[![npm version](https://img.shields.io/npm/v/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![npm downloads](https://img.shields.io/npm/dm/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/@hayashiii/sitesnap.svg)](https://nodejs.org)

AI-friendly CLI for capturing website screenshots (desktop + mobile) with sitemap support and per-domain organization. Built for **portfolio reference collection**.

- 📁 Plain JSON + PNG output (no database)
- 🤖 Designed for AI agents (Claude Code / Codex) — ships with a Claude Code skill
- 📡 `--json` flag for structured stdout, parseable by any agent
- 🌐 `meta.json` schema designed for static site generators (Astro/Next/etc.)

---

## Install

```bash
# global install (recommended)
npm install -g @hayashiii/sitesnap
# or: pnpm add -g @hayashiii/sitesnap
# or: yarn global add @hayashiii/sitesnap

# install Playwright's Chromium browser (one-time)
npx playwright install chromium
```

Requires **Node.js 22+**.

---

## Quick Start

```bash
# capture an entire site from its sitemap
sitesnap site https://example.com/sitemap.xml

# capture a single page
sitesnap page https://example.com/about

# list what you've captured so far
sitesnap list

# open a captured site's folder in Finder (macOS)
sitesnap open example.com
```

---

## Commands

| Command | Description |
|---|---|
| `sitesnap site <sitemap-url>` | Expand sitemap → capture every URL |
| `sitesnap page <url>` | Capture a single page |
| `sitesnap list` | List captured sites |
| `sitesnap open <domain>` | Open the site's folder in Finder |
| `sitesnap retry <domain>` | Re-capture pages that failed previously |
| `sitesnap help` | Show help |

### Global flags

| Flag | Purpose |
|---|---|
| `--json` | Machine-readable JSON output to stdout (progress logs go to stderr). AI-agent friendly. |
| `--force-visible` | Force-show elements hidden by scroll-reveal libraries (AOS, wow.js, etc.). **Use when screenshots come out blank.** |
| `--out <dir>` | Output directory (default: `./sites/` in current working dir). Also configurable via `SITESNAP_OUT` env var. |
| `--limit <N>` | Capture at most N URLs (sitemap order, after `--exclude`). |
| `--exclude <regex>` | Skip URLs matching this regular expression (e.g., `'\?utm_'`). |
| `--concurrency <N>` | Override worker count (default 3). |
| `--min-interval <ms>` | Minimum delay between requests to the same host (default: 0, disabled). |
| `--strict` | Exit with non-zero status if any page failed to capture (CI-friendly). |
| `--allow-private` | Allow loopback / RFC1918 / link-local hosts (default refused). |

```bash
sitesnap list --json
# → [{ "domain": "...", "pages": 45, ... }]

sitesnap site https://example.com/sitemap.xml --force-visible --out ~/captures
```

### Animation handling (enabled by default)

The capturer applies the following on every shot:

- Sets `prefers-reduced-motion: reduce` on the browser context (sites that respect this skip animations entirely).
- Injects CSS that shrinks all `animation` / `transition` durations to `0.001s`.
- Waits for `document.fonts.ready` and all `<img>` elements to finish loading.

If a site still produces blank screenshots (typically scroll-reveal libraries like AOS), pass `--force-visible` to aggressively unhide those elements.

---

## Output structure

```
sites/                              (or wherever --out points)
├── index.json                      summary across all sites
└── <domain>/
    ├── meta.json                   page list + titles + image paths
    ├── desktop/<slug>.png          desktop screenshots
    └── mobile/<slug>.png           mobile screenshots
```

### `meta.json` schema

```json
{
  "domain": "example.com",
  "source": "https://example.com/sitemap.xml",
  "captured_at": "2026-05-01T12:00:00Z",
  "pages": [
    {
      "url": "https://example.com/",
      "slug": "index",
      "title": "Example",
      "desktop": "desktop/index.png",
      "mobile": "mobile/index.png",
      "captured_at": "2026-05-01T12:00:00Z",
      "desktop_error": null,
      "mobile_error": null
    }
  ]
}
```

---

## AI Agent integration

### Claude Code

This package ships with a skill at `.claude/skills/sitesnap/SKILL.md` (in the source repo). Drop the same skill file into a project's `.claude/skills/` to enable native invocation:

> User: "Capture this site for me: https://example.com/sitemap.xml"
> Claude Code automatically runs `sitesnap site …`

### Codex CLI / other shell-capable agents

Codex CLI automatically reads your project's `AGENTS.md`. Append the snippet below to enable natural-language invocation:

````markdown
## Using sitesnap to capture websites

The `sitesnap` CLI is available in this repo.

- `sitesnap site <sitemap-url> --json` — capture every page in a sitemap
- `sitesnap page <url> --json` — capture a single page
- `sitesnap list --json` — list previously captured sites

Output is JSON to stdout, progress logs to stderr. Exits non-zero on failure.
````

Other agents that don't use `AGENTS.md` can paste the same snippet into their system prompt or instructions.

---

## Configuration

Defaults live in `src/config.mjs` (in the source repo). When using as a globally-installed CLI, you can fork the package or contribute upstream to adjust:

- `viewports.desktop` — desktop viewport (width × height, deviceScaleFactor)
- `viewports.mobile` — Playwright device preset name (e.g. `"iPhone 13"`)
- `concurrency` — parallel capture workers (default: 3)
- `navigationTimeout` — page load timeout in ms (default: 45000)

---

## Integrating into your portfolio site

The output is designed to be consumed by a static site generator. For Astro:

```ts
// src/pages/portfolio/[domain]/[slug].astro
import meta from '../../../path/to/sites/example.com/meta.json';

export function getStaticPaths() {
  return meta.pages.map(p => ({
    params: { domain: meta.domain, slug: p.slug },
    props: { page: p, domain: meta.domain }
  }));
}
```

Image paths in `meta.json` are relative (`desktop/<slug>.png`), so combine with your asset baseURL.

---

## Limitations

### Security

- By default, requests to `localhost`, `127.x`, `10.x`, `192.168.x`, `172.16-31.x`, and `169.254.x` (link-local) are **refused** (SSRF protection). Use `--allow-private` to override for internal/staging environments.
- Only `http://` and `https://` schemes are accepted (rejects `file://`, `ftp://`, `data:`).
- All HTTP requests send `sitesnap/<version> (+<homepage>)` as the User-Agent.
- Cyclic and deeply-nested sitemapindex files (max depth 5 by default) are detected and rejected.

### Other notes

- **Screenshots are not pushed to git** by default — you should `.gitignore` the image folders. The `meta.json` files are small and tracking them is recommended.
- **Login-protected pages are not yet supported** — Playwright's `storageState` integration is on the roadmap.
- **Heavy SPAs** are waited on with `networkidle` + scroll, but if pages slip through, use `sitesnap retry <domain>` to re-capture only failed ones.

---

## License

MIT © 2026 Hayashi

---

## Links

- [GitHub repository](https://github.com/hayashiii-ghub/sitesnap)
- [Issues](https://github.com/hayashiii-ghub/sitesnap/issues)
- [npm](https://www.npmjs.com/package/@hayashiii/sitesnap)
