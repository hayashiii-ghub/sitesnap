# sitesnap - AI Agent Guide

## What is sitesnap

`@hayashiii/sitesnap` is a CLI tool for capturing screenshots of websites (desktop + mobile) with sitemap support. It is designed to be invoked by AI agents (Claude Code, Codex, etc.) for portfolio reference collection and site archive workflows.

## When to use

- The user asks to capture screenshots of a website
- The user wants to archive a website's pages as PNG images
- The user references a sitemap.xml for batch capture

## Quick Reference

```bash
sitesnap site <sitemap-url>           # Capture all pages from sitemap
sitesnap page <url>                   # Capture single page
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

## Output (`--json`)

### Success (page)
```json
{
  "success": true,
  "domain": "example.com",
  "url": "https://example.com",
  "desktop": true,
  "mobile": true,
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

## Best practices for AI agents

- **Always use `--json`** for parseable output
- **Default output dir**: `./sites/<domain>/` — use `--out` to override
- **For sites with lazy-loaded content**: try `--force-visible`
- **For private/local URLs**: use `--allow-private`
- **On `BROWSER_LAUNCH_FAILED`**: suggest `bunx playwright install chromium`
- **On batch failures**: parse the `errors` array in the result; retry individually with `sitesnap page`
