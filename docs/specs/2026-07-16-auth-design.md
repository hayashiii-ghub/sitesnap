# Authentication design (sitesnap 1.x)

sitesnap supports Playwright storage state, fixed headers, HTTP Basic credentials, and an interactive `login` command for collection-only captures.

## Mechanisms

| Scheme | Interface | Secret location |
|---|---|---|
| HTTP Basic | `--http-credentials user:pass` | argv or `SITESNAP_HTTP_CREDENTIALS` |
| Token / fixed header | `--header "Authorization: Bearer TOKEN"` | argv |
| Form / SSO | `login` then `--storage-state <file>` | Playwright storage-state file |

## Origin boundary

Headers and HTTP Basic credentials are restricted to exactly one target origin.

- Sitemap fetches send credentials only to the root sitemap origin.
- Cross-origin child sitemaps and redirects receive no credential headers.
- An authenticated sitemap that resolves to page URLs on another origin is rejected before browser capture.
- Browser routing removes custom credential headers from cross-origin subresources.
- Playwright HTTP credentials include an explicit origin.
- Authenticated URL-list captures containing multiple origins are rejected and must be split.

This is a product invariant, not a best-effort convention.

## Why login remains interactive

The headed browser lets a human complete passwords, SSO, 2FA, passkeys, and bot checks without placing credentials in agent context or CLI configuration. The agent should ask the user to run `login`, wait for completion, and then reference the resulting state path.

## Secret handling

- Never paste passwords or tokens into agent conversation.
- Prefer `SITESNAP_HTTP_CREDENTIALS` over argv when shell-history exposure matters.
- Treat storage state as the login session itself; `login` writes it with mode `0600`, but it must still be gitignored and kept outside archives.
- `runs/latest.json` records storage-state paths but redacts header values and Basic username/password.
- Invalid `--header` errors never echo the supplied value.

## Network safety

All authenticated network targets still pass the normal URL policy. DNS answers, redirects, recursive sitemap targets, browser requests, and WebSockets are rejected when they resolve to private or special-use ranges unless the user explicitly supplies `--allow-private`.
