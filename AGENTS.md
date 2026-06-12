# sitesnap - AI Agent Guide

## What is sitesnap

`@hayashiii/sitesnap` is a CLI tool for capturing screenshots of websites (desktop + mobile) with sitemap support. It is designed to be invoked by AI agents (Claude Code, Codex, etc.) for portfolio reference collection and site archive workflows.

## When to use

- The user asks to capture screenshots of a website
- The user wants to archive a website's pages as PNG images
- The user references a sitemap.xml for batch capture
- A captured run failed and the user wants retry guidance or an agent handoff task
- You are iterating on a site under development and need a screenshot of a specific viewport, element, or post-animation state (`shot`)
- You need to verify layout numerically — computed styles, bounding boxes, text, overflow amounts (`inspect`)

## Quick Reference

```bash
sitesnap site <sitemap-url>           # Capture all pages from sitemap
sitesnap page <url>                   # Capture single page
sitesnap shot <url>                   # One-off dev-loop screenshot
sitesnap inspect <url>                # Element style/box/text/overflow as JSON
sitesnap list                         # List captured sites
sitesnap open <domain>                # Open site folder in Finder
sitesnap retry <domain>               # Retry failed pages
sitesnap help                         # Help
sitesnap --version                    # Version
```

Always pass `--json` when invoked by an agent for structured output.

## Input formats

- HTTP/HTTPS URLs (publicly accessible)
- Use `--allow-private` for localhost/private IPs
- `sitesnap site` expects sitemap XML; use `sitesnap page` for ordinary HTML pages

## Capture options

```bash
sitesnap site https://example.com/sitemap.xml \
  --concurrency 3 \
  --min-interval 250 \
  --json
```

- Use `--out <dir>` when captures should be written outside `./sites/`.
- Use `--force-visible` when screenshots are blank because content is hidden by scroll-reveal animations.
- Use `--limit <N>` during exploration before capturing a large sitemap.
- Use `--exclude <regex>` to skip tracking URLs or irrelevant page groups.
- Use `--wait-ms <ms>` and `--pre-scroll <full-page|none>` when a retry needs different screenshot timing.
- Use `--strict` in CI when any failed page should fail the command.

## Dev-loop screenshots (`shot`)

Use `shot` instead of `page` while developing a site. It captures viewport-only by default (AI-readable, unlike a 9000px-tall full-page PNG), returns the absolute file path directly in JSON, and never touches meta.json.

```bash
sitesnap shot http://localhost:3000/about --allow-private --json          # above-the-fold at 1440x900
sitesnap shot http://localhost:3000/ --selector "footer" --allow-private --json   # one element only
sitesnap shot https://example.com/ --device "iPhone 13" --json            # device emulation
sitesnap shot https://example.com/ --settle 1500 --json                   # wait for entrance animations, no freezing
sitesnap shot https://example.com/ --full --json                          # classic full-page
```

- `--vp <WxH>` sets the viewport (default 1440x900); mutually exclusive with `--device`.
- `--selector` and `--full` are mutually exclusive.
- By default animations are frozen (same as `page`); `--settle <ms>` disables freezing and waits instead — use it to capture the final state after entrance animations.
- Output goes to `sites/<host>/shots/` and is overwritten on each run; localhost is split per port (`localhost_3000/`).
- Read `file` from the JSON output — it is the absolute path to the PNG.

## Numeric element checks (`inspect`)

Prefer `inspect` over eyeballing screenshots when a check is numeric: computed styles, bounding boxes, text content, overflow amounts.

```bash
sitesnap inspect http://localhost:3000/ --selector ".cta" --allow-private --json
sitesnap inspect http://localhost:3000/ --selector "h1" --props "letter-spacing,text-transform" --allow-private --json
sitesnap inspect https://example.com/ --selector "img" --limit 20 --json   # up to N matches (default 10)
```

- `--selector` is required. Zero matches is NOT an error: you get `count: 0` and an empty `elements` array (useful for asserting absence).
- Each element reports `box` (getBoundingClientRect), `style` (a default set of layout/typography properties plus any `--props`), `text` (first 200 chars), and `overflow` (`scrollWidth - clientWidth` / `scrollHeight - clientHeight`, useful for clipped-content checks).
- `--vp` / `--device` / `--settle` work the same as for `shot`, so you can measure responsive states.

## Diagnosis and agent handoff

Capture commands write run artifacts under `runs/latest/`. When a run fails, inspect it with:

```bash
sitesnap doctor sites/example.com/runs/latest --json
```

For deeper browser investigation, generate files for another agent:

```bash
sitesnap doctor sites/example.com/runs/latest --agent-task --json
```

- `diagnosis.md` summarizes the failed run.
- `agent-task.md` is safe to hand to Codex, Claude Code, Webwright, or another browser-capable agent.
- `suggested-sitesnap.config.json` is a suggestion artifact only; sitesnap does not auto-load it yet.

## Output (`--json`)

### Success (page)
```json
{
  "success": true,
  "domain": "example.com",
  "url": "https://example.com",
  "desktop": true,
  "mobile": true,
  "desktop_path": "/abs/sites/example.com/desktop/index.png",
  "mobile_path": "/abs/sites/example.com/mobile/index.png",
  "errors": [],
  "out_dir": "/abs/sites"
}
```

### Success (site)
```json
{
  "success": true,
  "domain": "example.com",
  "source": "https://example.com/sitemap.xml",
  "pages": 10,
  "captured_pages": 9,
  "errors": [{"url": "...", "mode": "desktop", "error": "..."}],
  "out_dir": "/abs/sites"
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "...",
    "hint": "...",
    "url": "..."
  }
}
```

## Error codes

| Code | Recovery hint |
|---|---|
| `INVALID_URL` | Verify URL format (http:// or https://) |
| `PRIVATE_URL_BLOCKED` | Use `--allow-private` for localhost / private IPs |
| `SITEMAP_FETCH_FAILED` | Check network or URL |
| `SITEMAP_NOT_XML` | URL returned HTML; use `sitesnap page` for single pages |
| `SITEMAP_PARSE_FAILED` | Verify sitemap XML syntax |
| `SITEMAP_TOO_DEEP` | Adjust `maxDepth` or check recursive sitemaps |
| `BROWSER_LAUNCH_FAILED` | Run `bunx playwright install chromium` |
| `PAGE_LOAD_FAILED` | Check site availability or simplify HTML |
| `SCREENSHOT_FAILED` | Check disk space or output dir permissions |
| `OUTPUT_DIR_NOT_WRITABLE` | Verify directory permissions |
| `DOMAIN_NOT_FOUND` | Run `sitesnap list` to see captured domains |
| `META_NOT_FOUND` | Re-run capture for the domain |

## Common tasks

### Capture a site
```bash
sitesnap site https://example.com/sitemap.xml --json
```

### Single page capture
```bash
sitesnap page https://example.com/about --json
```

### Batch with rate limit
```bash
sitesnap site https://example.com/sitemap.xml --concurrency 3 --min-interval 250 --json
```

### Retry failed pages
```bash
sitesnap retry example.com --force-visible --wait-ms 1000 --json
```

### Generate diagnosis files
```bash
sitesnap doctor sites/example.com/runs/latest --agent-task --json
```

## Best practices for AI agents

- **Always use `--json`** for parseable output
- **Default output dir**: `./sites/<domain>/` — use `--out` to override and report absolute paths back to the user
- **For sites with lazy-loaded content**: try `--force-visible`
- **For private/local URLs**: use `--allow-private`
- **On `BROWSER_LAUNCH_FAILED`**: suggest `bunx playwright install chromium`
- **On batch failures**: parse the `errors` array in the result; retry individually with `sitesnap page`
- **For failed runs**: use `sitesnap doctor <run-dir> --json` before guessing a retry strategy
- **For large sitemaps**: start with `--limit` before running a full capture
- **For server-friendly captures**: keep concurrency modest and add `--min-interval`
