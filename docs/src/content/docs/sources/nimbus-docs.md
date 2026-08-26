---
title: Nimbus Docs — source record
description: Immutable identity, exact version, and license for the Nimbus docs framework.
---

- Name: Nimbus Docs
- Upstream: <https://github.com/cloudflare/nimbus>
- Docs site: <https://nimbus-docs.com/> — LLM entry <https://nimbus-docs.com/llms.txt>
- Reference: scaffolder `@cloudflare/create-nimbus-docs@0.6.6`, templates tag `templates-v0.6.6`; runtime integration `@cloudflare/nimbus-docs@0.11.0`
- License: MIT
- Fetched: 2026-08-27
- Rights: MIT (upstream LICENSE). We do not redistribute upstream docs wholesale; we keep an identity + summary, not the file tree.

Nimbus Docs is the framework UPM's wiki site is built on. The **immutable identity,
pinned version, and license** live here; the derived page holds why we use it and how.

## Derived

- `/components/nimbus-docs` — why and how.

## Notes

- Version is 0.x, so the integration surface may change between releases — pinned exact.
- No official release beyond `@cloudflare/nimbus-docs` this round; `nimbus.json` records
  the scaffold provenance and must be committed.
