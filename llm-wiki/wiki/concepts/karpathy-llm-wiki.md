# Karpathy LLM Wiki — concept

**META-TOOL** — the knowledge-management paradigm this wiki follows. Source:
[sources/karpathy-llm-wiki](sources/karpathy-llm-wiki.md).

## The idea

Don't re-read the source on every query. An LLM **compiles and maintains** a persistent,
interlinked Markdown wiki. Knowledge accumulates instead of being re-discovered and then
dropped.

## The three layers

- `raw/` — immutable sources (papers, docs, repos, clippings). Never mutated.
- `wiki/` — LLM-written, human-read pages (entity, concept, overview, cross-refs).
- `schema` — `AGENTS.md` with ingest / query / lint rules.

## The three operations

- **Ingest** — read a new source → update 10–15 pages (summary, entity, concept, index,
  log).
- **Query** — ask the wiki; good answers saved back.
- **Lint** — contradictions, staleness, orphan pages, missing cross-refs, missing sources.

## Nav files

- `index.md` — table of contents + one-line summary.
- `log.md` — timeline `## [date] ingest | query | lint | title`.

## How UPM applies it

- `llm-wiki/raw/` = immutable source records (in UPM, **content-addressed**: filename ==
  SHA-256 of the record bytes).
- `llm-wiki/wiki/` = LLM-written derived pages.
- `llm-wiki/AGENTS.md` = the schema.
- The **separate** `docs/` Nimbus site is the human-facing docs platform; it is not the
  wiki and not the same object.

## Notes

- Obsidian-as-IDE is a habit, not a requirement — the wiki is just Markdown in git.
- No official v2; the gist is canonical.
