# UPM LLM Wiki — index

The agent knowledge base of every external resource and open-source component UPM's
repositories reference. Each entry is pinned and license-aware. The authority is the
immutable source record under `raw/sources/`.

> **Scope note.** All entries today are **META-TOOL** — the tools used to build and
> document UPM. They are not UPM's product tech stack. Product-stack components
> (Kubernetes operators, CRDs, Helm/package charts, datastore engines) are ingested in
> a later phase.

## Current records

| Resource | Kind | Category | Source record |
|---|---|---|---|
| [Nimbus Docs](components/nimbus-docs.md) | docs-framework | components | `raw/sources/nimbus-docs` |
| [Karpathy LLM Wiki](concepts/karpathy-llm-wiki.md) | idea-gist | concepts | `raw/sources/karpathy-llm-wiki` |
| [Google Code Wiki](concepts/google-code-wiki.md) | service-announcement | concepts | `raw/sources/google-code-wiki` |

## Reading route

- `sources/` — a derived summary per source record.
- `components/` — distributable / executable external components (frameworks, tools).
- `concepts/` — recurring concepts and paradigms.
- `technologies/` — product tech-stack technologies (future).
- `comparisons/` — side-by-side comparisons (future).
- `decisions/` — held decisions (future).
- `log.md` — append-only ingest / query / lint timeline.

## Contract

See `../AGENTS.md` for the three operations and the content-addressing and license rules.
Every claim in this wiki traces to a source record; source records are immutable.
