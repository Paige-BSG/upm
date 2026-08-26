---
title: Nimbus Docs
description: The framework UPM's LLM wiki is built on — edit MDX, lint docs, build a static agent-friendly site.
---

Nimbus Docs is the docs framework UPM's wiki site is built on. It turns a Markdown/MDX
content tree into a static site that is friendly to both humans and agents: it lints
the prose and MDX, builds per-page Markdown copies, and emits `/llms.txt` and
`/llms-full.txt`.

## Why UPM uses it

- `docs/src/content/docs/` is **both** the Karpathy LLM wiki and the Nimbus content tree —
  one directory, no parallel `wiki/` to drift. The Nimbus directory structure *is* the URL
  and the sidebar, so a single source of truth serves humans and agents.
- It emits `/llms.txt`, per-page Markdown, and a search index, giving agents a clean,
  low-token entry point at deploy time.
- `nimbus.json` records the scaffold provenance (scaffold version, template tag, content
  hashes), which we commit, so the site is reproducible.

## Real integration surface

- Runtime: `@cloudflare/nimbus-docs@0.11.0` (Astro integration) in `docs/package.json`.
- Content schema: `docs/src/content.config.ts` registers `docsCollection()` and
  `partialsCollection()`; doc pages require `title`.
- Commands: `pnpm run build`, `pnpm run typecheck` (`astro check`), `pnpm run lint:docs`
  (`nimbus-docs lint`).

## Deliberately not used

- Not used to author wiki content (we write the pages directly).
- No `wrangler deploy` / Cloudflare zone config this round — the canonical site URL in
  `astro.config.ts` is a placeholder.

## Compatibility / security / privacy / distribution / upgrade risk

- `0.x` — the integration surface may change between releases, so all versions are pinned
  exact (no floating `^` / `~`).
- The package is the only new runtime dependency set; it is committed and the lockfile is
  checked in.
- Distribution: upstream is MIT; we keep the content tree and summary, not a fork of
  upstream docs.

## Upgrade trigger

A new `@cloudflare/nimbus-docs` or `@cloudflare/create-nimbus-docs` release. Bump the exact
pin in `docs/package.json`, update `docs/nimbus.json`, and re-run build/typecheck/lint.

## Source

- Source record: `/sources/nimbus-docs`

## Ownership

- Owner: `@DeepSeek`
- Last verified: 2026-08-27
