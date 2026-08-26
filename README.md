# UPM

UPM is an open-source project. Its core artifact is an **LLM wiki**: a pinned, license-aware
library for the external resources and open-source components UPM's repositories reference.

## What's here

- `AGENTS.md` — the knowledge contract: the three operations (ingest / query / lint) and the
  admission requirements for any external resource or component.
- `docs/` — the wiki. `docs/src/content/docs/` is simultaneously the Karpathy LLM wiki content
  and the Nimbus content tree; the built site serves humans at `/` and agents via `/llms.txt`
  and per-page `.md`.
- `scripts/wiki_check.py` — fail-closed validator for the admission contract.
- `LICENSE` — Apache-2.0.

## The wiki

Every admitted dependency has an immutable source record (`docs/src/content/docs/sources/`) and a
derived page under `components/`, `resources/`, or `concepts/` with a backlink to its source, plus
an index and an append-only log.

## Build

From `docs/`:

- `pnpm install`
- `pnpm run build` — static site plus `/llms.txt`, `/llms-full.txt`, and per-page `.md` in `dist/`
- `pnpm run typecheck` — `astro check`
- `pnpm run lint:docs` — `nimbus-docs lint`

From the repo root: `python3 scripts/wiki_check.py .` validates the admission contract.
