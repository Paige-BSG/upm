# Nimbus Docs — component

**META-TOOL** — the docs framework used to build UPM's public docs site. Not UPM product
tech stack. Source: [sources/nimbus-docs](sources/nimbus-docs.md).

## Why we use it

- Human-first docs with a clean sidebar/TOC, and agent-friendly output out of the box
  (`/llms.txt`, `/llms-full.txt`, per-page `.md`). It fits both a human reader and an agent
  reading the docs.
- Content tree = URL = sidebar; pages require `title` frontmatter. Simple to extend.

## The interface we actually use

- `@cloudflare/nimbus-docs` (integration) pinned **exact** because 0.x may change the
  surface.
- `nimbus.json` records scaffold provenance — committed, not ignored.
- `pnpm run build` / `typecheck` / `lint:docs` for the checks that exist today.
- `docs/src/content/docs/` is the content tree; `docs/src/pages/index.astro` supplies `/`.

## Explicitly not used

- No Cloudflare zone / AI Search / MCP wiring this round.
- No `wrangler deploy`.

## Risks / notes

- 0.x — breaking changes possible; keep the version pin fresh on upgrade.
- `site` is treated as an origin (drops any path), so a project-site prefix like `/upm`
  is not reflected in generated URLs yet. Update when the real deploy origin is fixed.

## Upgrade trigger

A new Nimbus release that fixes a bug or adds a needed feature; checked via
`pnpm exec nimbus-docs outdated` and reviewed with `nimbus-docs diff`.
