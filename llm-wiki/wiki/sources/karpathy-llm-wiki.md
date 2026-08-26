# Karpathy LLM Wiki — source summary

**META-TOOL** — the knowledge-management paradigm this wiki follows. Not UPM tech stack.

- Raw record: `llm-wiki/raw/sources/karpathy-llm-wiki/1dd84386fd4e9cdece15e364540ba7aff977f30978a33a968572e4a510079f77.json` (no license stated).
- Derived page: [concepts/karpathy-llm-wiki](concepts/karpathy-llm-wiki.md).
- Upstream: <https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f> — the
  canonical idea file (revision ac46de1a...).

## What it is

Andrej Karpathy's April 2026 proposal: instead of re-reading (RAG-ing) a source on every
query, an LLM **compiles and maintains** a persistent, interlinked Markdown wiki. Knowledge
accumulates. Layers: `raw/` (immutable sources) · `wiki/` (LLM-written) · `schema`
(AGENTS.md). Three operations: ingest / query / lint. Two nav files: `index.md` + `log.md`.

## Notes

- No versioned release; the gist is canonical. No official v2. Community implementations
  (Hermes, Graphify, ...) are not the spec.
- This wiki applies the paradigm, replacing the "single merged tree" of the earlier
  version with a standalone `llm-wiki/` + a separate Nimbus docs site.
