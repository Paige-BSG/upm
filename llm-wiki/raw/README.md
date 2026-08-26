# `llm-wiki/raw/` — immutable source records

This directory holds the raw, immutable source records for the LLM wiki. A record is a
canonical JSON object whose **filename equals the SHA-256 of its own bytes**.

## Read-only

- A record here is **never mutated**. It is the source-of-truth identity for one external
  resource or open-source component.
- A `sources/<id>/` directory holds the full history: **1..N** immutable records. To
  record a change, add a **new** record (its bytes differ, so its hash and filename
  differ) alongside the existing ones; never delete or rewrite an old one.
- `raw/index.json` points to exactly **one** `current` record per id. Non-current records
  stay in the directory and are still validated.

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

- **Frozen** — its record carries a machine-verifiable immutable selector under
  `reference` (or a top-level `pin`): an exact full-length digest (`revision` / `commit`
  / `sha` / `digest` = full 40/64-hex, or `algo:<hex>`) or an exact literal `tag` /
  `version`. The revision is the identity, so no `retrievedAt` is required. `ref` is
  never a pin; mutable sentinels (`latest` / `current` / `stable` / `main` / `master` /
  `HEAD`) and range / wildcard forms are rejected. Decided from the selector, **not**
  from `kind`.
- **Dynamic** — no valid immutable selector, whatever its `kind` (a bare `ref`, a short
  hash, or a sentinel tag/version). It **must** carry a timezone-aware `retrievedAt`
  (ISO-8601 with `Z` or a `±HH:MM`/`±HHMM` offset). An `etag` / `lastModified` from the
  fetch may be recorded alongside it. The stored digest is for that one retrieval; a
  later change is re-ingested as a new record (new hash, new filename).

## Validation

`python3 scripts/check_llm_wiki.py .` from the repo root recomputes every record
filename and checks it matches. With `--base <git-ref>`, it also rejects any
modification or deletion of records that existed at that ref.

## `index.json`

Aggregates `id -> raw/sources/<id>/<sha>.json` — exactly one **current** record per id.
Add a line, or repoint an id to the new revision, when you add a record. The index value
must be a real, validated record in that id's directory; older records stay in the same
directory as immutable history.
