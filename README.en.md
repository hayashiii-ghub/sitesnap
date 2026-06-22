> 🇯🇵 [日本語版](./README.md)

# @hayashiii/sitesnap

[![npm version](https://img.shields.io/npm/v/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![npm downloads](https://img.shields.io/npm/dm/@hayashiii/sitesnap.svg)](https://www.npmjs.com/package/@hayashiii/sitesnap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/@hayashiii/sitesnap.svg)](https://nodejs.org)

Playwright-based screenshot CLI for AI agents and developers to **shoot, check, and inspect** local UI in a dev loop. Also does sitemap bulk capture and portfolio reference collection.

- 🔁 **Shoot-and-fix loop**: `shot` (one-off capture) → `check` (overflow / console / a11y pass-fail) → `inspect` (numeric element checks)
- 🎛️ **Pre-shot DOM interaction**: `--click` / `--eval` / `--label` to capture state variants (CSS tabs, `<details>`), `--allow-file` to shoot `file://` mocks directly
- 📡 `--json` on every command + structured errors (`code` + `hint`) — easy for agents to parse and auto-retry
- 🤖 Designed for AI agents (Claude Code / Codex) — ships with a Claude Code skill and AGENTS.md
- 📁 Plain JSON + PNG output (no database); `site`/`page` archive with `meta.json`
- 🌐 `meta.json` schema designed for static site generators (Astro/Next/etc.)
- 🔧 Written in TypeScript, hybrid build (Bun for development / Node.js 22+ for distribution)

---

## Install

```bash
# Node.js (npm)
npm install -g @hayashiii/sitesnap

# or Bun
bun install -g @hayashiii/sitesnap

# one-time Playwright Chromium install
npx playwright install chromium
```

Requires **Node.js 22+**.

---

## Quick Start

```bash
# one-off screenshot of a page you're building (viewport-only, element capture supported)
sitesnap shot http://localhost:3000/ --allow-private --selector "footer" --json

# pass/fail gate: horizontal overflow / console errors / failed requests / a11y
sitesnap check http://localhost:3000/ --allow-private --json

# numeric checks: computed style, box, overflow of an element
sitesnap inspect http://localhost:3000/ --allow-private --selector ".cta" --json

# bulk-archive an entire site from its sitemap (portfolio collection, etc.)
sitesnap site https://example.com/sitemap.xml --json

# list what you've captured so far
sitesnap list
```

---

## Commands

| Command | Description |
|---|---|
| `sitesnap site <sitemap-url>` | Expand sitemap → capture every URL |
| `sitesnap page <url>` | Capture a single page |
| `sitesnap shot <url>` | One-off dev-loop screenshot (viewport, element, or full page) |
| `sitesnap inspect <url>` | Computed style, box, text, and overflow of matching elements as JSON |
| `sitesnap check <url>` | Pass/fail report: horizontal overflow, console errors, failed requests, axe-core a11y |
| `sitesnap list` | List captured sites (`--shots` lists shots instead) |
| `sitesnap clean [host]` | Delete accumulated shots (never touches archives) |
| `sitesnap open <domain>` | Open the site's folder in Finder |
| `sitesnap retry <domain>` | Re-capture pages that failed previously |
| `sitesnap doctor <run-dir>` | Diagnose a capture run and generate retry or agent handoff files |
| `sitesnap help` | Show help |

### Flags

| Flag | Default | Description |
|---|---|---|
| `--json` | off | Machine-readable JSON output to stdout; progress logs go to stderr |
| `--force-visible` | off | Force-show elements hidden by scroll-reveal libraries (AOS, wow.js, Framer Motion's `motion/react` `whileInView`, etc.). **Use when screenshots come out blank.** |
| `--out <dir>` | `./sites/` (cache for shot) | Output directory. Also configurable via `SITESNAP_OUT` env var. With no value, `shot` writes to an OS cache dir instead of cwd (see below) |
| `--limit <N>` | off | site: capture at most N URLs (sitemap order, after `--exclude`); inspect: cap matched elements to N (default 10) |
| `--exclude <regex>` | off | Skip URLs matching this regular expression (e.g., `'\?utm_'`) |
| `--concurrency <N>` | 3 | Override worker count |
| `--wait-ms <ms>` | off | Wait before taking each screenshot |
| `--pre-scroll <full-page\|none>` | `full-page` | Control automatic pre-screenshot scrolling |
| `--agent-task` | off | With `doctor`, generate Codex / Claude Code / Webwright handoff files |
| `--min-interval <ms>` | 0 | Minimum delay between requests to the same host |
| `--strict` | off | Exit with non-zero status if any page failed to capture |
| `--allow-private` | off | Allow loopback / RFC1918 / link-local hosts |

### shot / inspect / check flags

| Flag | Default | Description |
|---|---|---|
| `--vp <WxH>` | `1440x900` | Viewport size |
| `--device <name>` | off | Playwright device name (e.g. `"iPhone 13"`). Mutually exclusive with `--vp` |
| `--selector <css>` | off | Target element CSS selector (element-only capture for shot, required for inspect). Mutually exclusive with `--full` |
| `--settle <ms>` | off | Skip animation freezing and wait before running (observe the post-animation final state) |
| `--full` | off | Capture the full page (shot only; default is viewport-only) |
| `--props <p1,p2>` | off | Extra CSS properties for inspect (comma-separated) |

### Pre-shot interaction / state setup (shot)

Flags for capturing UI that needs a DOM state change before the shot — CSS radio tabs, `<details>` toggles — without making a throwaway copy.

| Flag | Default | Description |
|---|---|---|
| `--click <css>` | off | Click before capture (**repeatable**; CSS tab switch / details expand). Runs left to right |
| `--eval <js>` | off | Run arbitrary JS before capture (escape hatch for states clicks can't express; prefer `--click`) |
| `--label <name>` | off | State label appended to the output filename. **Required when capturing state variants** (otherwise they overwrite under the same name) |
| `--allow-file` | off | Capture local HTML over `file://` (shot only; no server needed) |
| `-o, --out-file <path>` | off | Write the single shot **directly to this path** (shot only). Parent dirs are created, and `--json` `file` returns this path. Mutually exclusive with `--out` |

```bash
# Capture CSS radio tab variants (--label keeps them in separate files)
sitesnap shot http://localhost:3000/ --allow-private --click ".tab-user"  --label user  --json
sitesnap shot http://localhost:3000/ --allow-private --click ".tab-admin" --label admin --json
# Shoot a static local HTML mock with no server
sitesnap shot file:///abs/path/mock.html --allow-file --click "summary" --label open --json
# Drop a single shot straight into another project's public/ (no cp, one command)
sitesnap shot file:///abs/path/mock.html --allow-file --full -o ../my-app/public/og.png --json
# Reliably full-page a Framer Motion (motion/react) whileInView fade-up SPA
sitesnap shot http://localhost:3000/ --allow-private --full --pre-scroll full-page --force-visible --settle 800 --json
```

Unlike the archival `site`/`page` commands, `shot` is a "scratch" tool, so it **does not touch cwd unless you pass `--out` / `--out-file`**. By default it writes to an OS cache dir (`$XDG_CACHE_HOME/sitesnap`, or `~/.cache/sitesnap`), under `<host>/shots/` (per-port for localhost, e.g. `localhost_3000/`; `file://` goes under `_file/`), overwriting in place and never updating meta.json. Pass `--out <dir>` to write under that directory as before, or `-o <path>` to write a single file to that path. `file://` filenames are basename-based rather than the full absolute path. The `site`/`page` archives still default to `./sites/`.

### Listing and cleaning shots

`shots/` is a scratch area that grows as you vary `--label`. It is never auto-deleted, so prune it explicitly. `sites/` is gitignored, so removing shots is safe.

```bash
# Per-host count / total size / latest mtime
sitesnap list --shots --json
# Preview shots older than 7 days, then delete
sitesnap clean --older-than 7 --dry-run --json
sitesnap clean --older-than 7 --json
# Wipe one host's shots
sitesnap clean localhost_3000
```

`clean` only targets `shots/` — it never deletes `site`/`page` archives (`desktop/`, `mobile/`, `meta.json`). There is no interactive prompt (so agents can automate it), so always `--dry-run` first.

```bash
sitesnap list --json
# → [{ "domain": "...", "pages": 45, ... }]

sitesnap site https://example.com/sitemap.xml --force-visible --out ~/captures
```

## JSON output examples

Single-page capture:

```json
{
  "success": true,
  "domain": "example.com",
  "url": "https://example.com/about",
  "desktop": true,
  "mobile": true,
  "desktop_path": "/abs/sites/example.com/desktop/about.png",
  "mobile_path": "/abs/sites/example.com/mobile/about.png",
  "errors": [],
  "out_dir": "/abs/sites",
  "run_dir": "/abs/sites/example.com/runs/latest"
}
```

`shot`:

```json
{
  "success": true,
  "url": "http://localhost:3000/",
  "file": "/abs/.cache/sitesnap/localhost_3000/shots/index--1440x900--sel-footer.png",
  "viewport": { "width": 1440, "height": 900 },
  "device": null,
  "selector": "footer",
  "full": false,
  "settle_ms": null,
  "created_at": "2026-06-22T12:00:00.000Z",
  "title": "Example",
  "http_status": 200,
  "duration_ms": 1234
}
```

`inspect` (numeric checks beat eyeballing screenshots):

```json
{
  "success": true,
  "url": "http://localhost:3000/",
  "selector": ".cta",
  "viewport": { "width": 1440, "height": 900 },
  "count": 1,
  "elements": [
    {
      "box": { "x": 560, "y": 1200, "width": 320, "height": 56 },
      "style": { "color": "rgb(255, 255, 255)", "font-size": "18px", "display": "flex" },
      "text": "Contact us",
      "overflow": { "x": 0, "y": 0 }
    }
  ],
  "title": "Example",
  "http_status": 200,
  "duration_ms": 980
}
```

`check` (add `--strict` for a non-zero exit on failure — CI friendly):

```json
{
  "success": true,
  "url": "http://localhost:3000/",
  "viewport": { "width": 1440, "height": 900 },
  "pass": false,
  "checks": {
    "overflow": { "pass": false, "amount": 560, "offenders": [{ "element": "div.hero", "width": 2000, "right": 2000 }] },
    "console_errors": { "pass": true, "messages": [] },
    "failed_requests": { "pass": false, "requests": [{ "url": "http://localhost:3000/missing.png", "status": 404, "error": null }] },
    "a11y": { "pass": false, "violations": [{ "id": "image-alt", "impact": "critical", "nodes": 1, "targets": ["img"] }] }
  },
  "title": "Example",
  "http_status": 200,
  "duration_ms": 2100
}
```

Sitemap capture:

```json
{
  "success": true,
  "domain": "example.com",
  "source": "https://example.com/sitemap.xml",
  "pages": 10,
  "captured_pages": 9,
  "errors": [{ "url": "https://example.com/missing", "mode": "desktop", "error": "..." }],
  "out_dir": "/abs/sites",
  "run_dir": "/abs/sites/example.com/runs/latest"
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Invalid URL",
    "hint": "Pass an http:// or https:// URL",
    "url": "example.com"
  }
}
```

### Optional: agent-assisted diagnosis

AI agents and Webwright are not part of the normal capture path. When a run fails, call `doctor` explicitly. It reads the latest run's `result.json`, summarizes blank-looking screenshots and timeouts, then prints a retry suggestion.

```bash
sitesnap site https://example.com/sitemap.xml
sitesnap doctor sites/example.com/runs/latest
```

For deeper investigation, generate a task file for your preferred agent. Webwright is not bundled; pass `agent-task.md` to Codex, Claude Code, Webwright, or another browser-capable agent.

```bash
sitesnap doctor sites/example.com/runs/latest --agent-task
# Generates: diagnosis.md, agent-task.md, suggested-sitesnap.config.json
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
    ├── runs/latest/result.json     latest run diagnosis summary
    ├── runs/latest/options.json    latest run options
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

The package ships a skill file at `skills/sitesnap/SKILL.md`. Once you `npm install -g @hayashiii/sitesnap`, Claude Code automatically detects it and lets you invoke the tool with natural language:

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

> If you're contributing changes to sitesnap itself, see [AGENTS.md](./AGENTS.md) at the repo root for agent-oriented contributor guidelines.

## Development

```bash
git clone https://github.com/hayashiii-ghub/sitesnap.git
cd sitesnap
bun install
bun test
bun src/cli.ts list --json  # run directly
bun run build               # generate dist/cli.js
bun run pack:smoke          # verify npm package contents and installed CLI
```

---

## Configuration

Defaults live in `src/config.ts` (in the source repo). When using as a globally-installed CLI, you can fork the package or contribute upstream to adjust:

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
- **AI-agent integration**: always pass `--json` so progress logs stay on stderr and the result JSON stays on stdout.

---

## License

MIT © 2026 Hayashi

---

## Links

- [GitHub repository](https://github.com/hayashiii-ghub/sitesnap)
- [Issues](https://github.com/hayashiii-ghub/sitesnap/issues)
- [npm](https://www.npmjs.com/package/@hayashiii/sitesnap)
- [AGENTS.md](./AGENTS.md) — AI-agent guide
- [CHANGELOG](./CHANGELOG.md)
