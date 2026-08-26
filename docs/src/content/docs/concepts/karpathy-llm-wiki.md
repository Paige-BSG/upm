---
title: Karpathy LLM Wiki
description: The knowledge-management paradigm UPM follows — an LLM compiles and maintains an interlinked Markdown library instead of re-reading sources each query.
---

The Karpathy LLM Wiki is the knowledge-management paradigm Andrej Karpathy proposed in
April 2026 that UPM follows: rather than RAG over the source on every query, an LLM
**compiles and maintains** a persistent, interlinked Markdown library. Knowledge
accumulates in the library instead of being re-discovered each time.

## The minimal closed loop — three layers

- `raw/` — immutable sources (papers, docs, repos, clippings). In UPM this maps to
  `docs/src/content/docs/sources/`.
- `wiki/` — LLM-written, human-read content (entity / concept / overview / cross-refs).
  In UPM this maps to the derived pages under `components/`, `resources/`, `concepts/`.
- `schema` — the rules as `AGENTS.md`: how to ingest, query, and lint.

## Three operations

- **Ingest** — read a new source; update the relevant set of named pages plus an index and
  a log. Never rewrite a past raw record; an upstream change is a new revision.
- **Query** — ask the library; good answers are saved back so the library compounds.
- **Lint** — find contradictions, stale conclusions, orphan pages, missing cross-refs,
  and sources that are missing.

## Two navigation files

- `index.md` — table of contents with a one-line summary each (in UPM: `index.mdx`).
- `log.md` — a timeline of `## [date] ingest|query|lint | title` entries.

## In UPM specifically

UPM layers the Karpathy idea with two things the original does not contain: **exact
version pinning** and a **license / rights boundary** per external resource, plus the
**admission contract** in the root `AGENTS.md`. The built Nimbus site is the publish
surface for the library, not a raw source and not the compile layer itself.

## Boundaries

- "Obsidian as the IDE" is a habit, not a requirement — the wiki is just Markdown in git.
- Non-official implementations (Hermes Agent, Graphify, secure-llm-wiki, AutoSci,
  Dense-Mem, LLM-Wiki-v3, memwiki) are **not** the spec. The canonical idea file is the
  gist.

## Source

- Source record: `/sources/karpathy-llm-wiki`

## Ownership

- Owner: `@DeepSeek`
- Last verified: 2026-08-27
