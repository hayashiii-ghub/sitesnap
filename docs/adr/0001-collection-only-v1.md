# ADR 0001: sitesnap 1.x is a collection-only archive tool

- Status: Accepted
- Date: 2026-07-24

## Context

sitesnap 0.x accumulated two different products: a development-loop UI verifier (`shot`, `check`, `inspect`) and a persistent website collector (`site`, `page`, sitemap archives). Both used Playwright, but they had different users, lifecycles, output semantics, and quality criteria.

shimon now owns the development-loop problem: project-defined cases, responsive observations, checks, screenshots, and evidence consumed by agents. Keeping the same responsibilities in sitesnap would duplicate contracts and recreate the maintenance weight this redesign is intended to remove.

## Decision

sitesnap 1.x has one responsibility: turn page URLs into durable, retryable desktop/mobile evidence archives.

- One `capture` command accepts a page, sitemap, or URL list.
- One stable schema describes cumulative archives; a separate artifact describes the latest run.
- Captures are deterministic desktop and mobile full-page screenshots.
- Inputs may span hosts, but archives and failures are isolated by host.
- `retry` is driven only by failed manifest entries.
- Operational output is always JSON for agent consumption.
- Human UI conveniences and development assertions are out of scope.

## Boundary

sitesnap does not provide selector inspection, accessibility or console gates, arbitrary pre-capture DOM interactions, pixel diffs, disposable screenshots, local `file://` capture, or project-specific responsive cases. Those belong to shimon or the calling development agent.

## Consequences

- The CLI is intentionally breaking at 1.0; the existing npm package and repository are retained for release continuity.
- 0.x archives are not upgraded in place. New captures produce schema-v1 `manifest.json` files.
- The code and dependency surface shrink substantially.
- Manifest compatibility, failure preservation, source history, SSRF controls, and origin-scoped credentials become product invariants.
