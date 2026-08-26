# UPM LLM Wiki — agent knowledge contract

This is the **agent LLM wiki**: a Karpathy-style knowledge base for channel agents to
understand the tech stack fast. It is a pinned, license-aware library of the external
resources and open-source components UPM's repositories reference.

## Categorisation and important scope boundary

- **Meta-tool knowledge** — the tools used to *build and document* this project (the
  docs framework, the wiki paradigm, the code-understanding aid) live here and are
  labelled **META-TOOL**. They are not UPM's product tech stack.
- **UPM tech stack** — Kubernetes operators, CRDs, Helm/package charts, and datastore
  engines (MySQL, Redis, Kafka, ...) are the product stack. They are ingested in a
  later phase; none exist yet.

This wiki is **not** the public docs site. It collects only **public-safe** technical
knowledge; internal context, credentials, and non-public business info never enter it.

## Layout

```
raw/                      immutable source records
  README.md               what a raw record is
  index.json              id -> raw/sources/<id>/<sha>.json
  assets/                 fetched assets, if any (README.md)
  sources/<id>/<sha>.json canonical JSON, filename == SHA-256(bytes)
wiki/                     LLM-written, human-read derived knowledge
  index.md                table of contents + one-line summary
  log.md                  append-only ingest / query / lint timeline
  sources/                one derived page per source record
  technologies/           product tech-stack technologies (later)
  components/             distributable/external components
  concepts/               recurring concepts and paradigms
  comparisons/            side-by-side comparisons (later)
  decisions/              held decisions (later)
```

## Three operations

**Ingest.** Pick a first-hand source (repo, docs site, service, paper, gist). Fetch it
and record its fingerprint. Add an immutable raw record under `raw/sources/<id>/` —
the filename **must equal the SHA-256 of the record's own canonical JSON bytes**. Write
a derived page (or sum it up in an existing one), link back to the source, update
`index.md`, append to `log.md`.

**Query.** Read `index.md`, then the source record and its derived pages. Cite the
specific source record for every claim. Write analyses back only after human
confirmation.

**Lint.** Fix contradictions, stale conclusions, orphan pages, missing backlinks,
unsourced claims, dead links, and manifest/lockfile pins that disagree.

## Content addressing rules

- A raw record is **immutable**. Do not modify or delete it.
- A change to the same upstream identity is a **new record** (new file name, because the
  content and its hash differ) and a new entry in `index.json` + `log.md`.
- `scripts/check_llm_wiki.py` recomputes every record's filename from its bytes. Run it
  with `--base <git-ref>` to verify that no existing record (present at that ref) was
  modified or deleted — only new records may be added.

## Frozen vs dynamic sources

A source pinned to a single immutable revision (a fixed commit, tag, gist revision,
release) is **frozen** — set `kind` to one of `idea-gist`, `source-repo`, `package`,
`license`, `api-spec`, `spec`, `manifest`, `release`, and no `retrievedAt` is required.

Anything else (web page, doc index, service announcement, vendor site, blog post) is
**dynamic** and must record a timezone-aware `retrievedAt` (ISO-8601 with `Z` or a
`±HH:MM`/`±HHMM` offset) plus an optional `etag` / `lastModified`. `scripts/check_llm_wiki.py`
enforces this per `kind`.

## License / rights rule

Never copy an upstream body into `raw/` unless it is licensed for redistribution. The
default is an **identity record**: the upstream URL, exact revision/commit/digest,
license boundary, fetched date, and a content fingerprint (byte count + SHA-256) — not
the full content. Derived wiki pages summarize and cite; they do not re-publish
third-party text wholesale.
