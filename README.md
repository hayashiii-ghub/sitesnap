> 🇯🇵 [日本語版](./README.ja.md)

# @hayashiii/web-portfolio

AI-friendly CLI for capturing website screenshots (desktop + mobile) with sitemap support and per-domain organization. Built for **portfolio reference collection**.

- 📁 Plain JSON + PNG output (no database)
- 🤖 Designed for AI agents (Claude Code / Codex) — ships with a Claude Code skill
- 📡 `--json` flag for structured stdout, parseable by any agent
- 🌐 `meta.json` schema designed for static site generators (Astro/Next/etc.)

---

## Install

```bash
# global install (recommended)
npm install -g @hayashiii/web-portfolio
# or: pnpm add -g @hayashiii/web-portfolio
# or: yarn global add @hayashiii/web-portfolio

# install Playwright's Chromium browser (one-time)
npx playwright install chromium
```

Requires **Node.js 18+**.

---

## Quick Start

```bash
# capture an entire site from its sitemap
web-portfolio site https://example.com/sitemap.xml

# capture a single page
web-portfolio page https://example.com/about

# list what you've captured so far
web-portfolio list

# open a captured site's folder in Finder (macOS)
web-portfolio open example.com
```

---

## Commands

| Command | Description |
|---|---|
| `web-portfolio site <sitemap-url>` | Expand sitemap → capture every URL |
| `web-portfolio page <url>` | Capture a single page |
| `web-portfolio list` | List captured sites |
| `web-portfolio open <domain>` | Open the site's folder in Finder |
| `web-portfolio retry <domain>` | Re-capture pages that failed previously |
| `web-portfolio help` | Show help |

### Global flags

| Flag | Description |
|---|---|
| `--json` | Output structured JSON to stdout (progress logs go to stderr). Easy for AI agents to parse. |
| `--force-visible` | Force-show elements hidden by scroll-reveal libraries (AOS, wow.js, etc.). Use when screenshots come out blank. |
| `--out <dir>` | Output directory (default: `./sites/` in current working dir). Also configurable via `WEB_PORTFOLIO_OUT` env var. |

```bash
web-portfolio list --json
# → [{ "domain": "...", "pages": 45, ... }]

web-portfolio site https://example.com/sitemap.xml --force-visible --out ~/captures
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

This package ships with a skill at `.claude/skills/web-portfolio/SKILL.md` (in the source repo). Drop the same skill file into a project's `.claude/skills/` to enable native invocation:

> User: "Capture this site for me: https://example.com/sitemap.xml"
> Claude Code automatically runs `web-portfolio site …`

### Codex / other shell-capable agents

Tell the agent the CLI exists and what it does — the `--json` flag returns easily-parseable output. Example prompt fragment:

> The `web-portfolio` CLI is available. Use `web-portfolio site <sitemap-url> --json` to capture an entire site, or `web-portfolio page <url> --json` for a single page. Output is JSON to stdout, progress logs to stderr.

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

- **Screenshots are not pushed to git** by default — you should `.gitignore` the image folders. The `meta.json` files are small and tracking them is recommended.
- **Login-protected pages are not yet supported** — Playwright's `storageState` integration is on the roadmap.
- **Heavy SPAs** are waited on with `networkidle` + scroll, but if pages slip through, use `web-portfolio retry <domain>` to re-capture only failed ones.

---

## License

MIT © 2026 Hayashi

---

## Links

- [GitHub repository](https://github.com/hayashiii-ghub/web-portfolio)
- [Issues](https://github.com/hayashiii-ghub/web-portfolio/issues)
- [npm](https://www.npmjs.com/package/@hayashiii/web-portfolio)
