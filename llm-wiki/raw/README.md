# `llm-wiki/raw/` — immutable source records

This directory holds the raw, immutable source records for the LLM wiki. A record is a
canonical JSON object whose **filename equals the SHA-256 of its own bytes**.

## Read-only

- A record here is **never mutated**. It is the source-of-truth identity for one external
  resource or open-source component.
- To record a change, add a **new** record (its bytes differ, so its hash and filename
  differ) and update `raw/index.json` + `wiki/log.md`.

## Record shape

```json
{
  "id": "unique-slug",
  "kind": "idea-gist | docs-framework | service-announcement | ...",
  "name": "Human-readable name",
  "upstream": "https://...",
  "reference": { "type": "...", "url": "https://...", "revision": "..." },
  "license": "MIT | none-stated | google-service | ...",
  "rights": "what we may do (cite/summarize vs redistribute; never reuse code license for models/fonts)",
  "fetched": "YYYY-MM-DD",
  "integrity": { "bytes": 0, "sha256": "..." },
  "note": "meta-tool | not UPM tech stack | ..."
}
```

`integrity` records the byte count and SHA-256 of the fetched source content — used to
verify against a re-fetch and to avoid embedding a full unlicensed body.

## Frozen vs dynamic sources

- **Frozen** — a source pinned to a single immutable revision (a fixed commit, tag, gist
  revision, release). Its record needs no `retrievedAt`; the revision is the identity.
- **Dynamic** — a page, doc index, service announcement, vendor site, blog post, or
  anything that can change. Its record **must** carry a timezone-aware `retrievedAt`
  (ISO-8601 with `Z` or a `±HH:MM`/`±HHMM` offset). An `etag` / `lastModified` from the
  fetch may be recorded alongside it. The stored digest is for that one retrieval; a
  later change is re-ingested as a new record (new hash, new filename).

## Validation

`python3 scripts/check_llm_wiki.py .` from the repo root recomputes every record
filename and checks it matches. With `--base <git-ref>`, it also rejects any
modification or deletion of records that existed at that ref.

## `index.json`

Aggregates `id -> raw/sources/<id>/<sha>.json`. Add a line when you add a record; never
repoint an id to a modified record of the same revision.
