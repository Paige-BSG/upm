# UPM LLM Wiki — log

Append-only timeline. Each line is `## [date] op | title`.

## 2026-08-27 migrate | First three meta-tool records

Migrated the three initial meta-tool ingests from the old merged `docs/` wiki into this
standalone LLM wiki, as content-addressed identity records:

- `raw/sources/nimbus-docs` — Docs framework (Cloudflare Nimbus), MIT. Derived:
  `components/nimbus-docs`. **META-TOOL**.
- `raw/sources/karpathy-llm-wiki` — Karpathy LLM wiki paradigm gist (revision
  ac46de1a...). Derived: `concepts/karpathy-llm-wiki`. **META-TOOL**.
- `raw/sources/google-code-wiki` — Google Code Wiki service announcement. Derived:
  `concepts/google-code-wiki`. **META-TOOL**.

Each record is fingerprint-only (byte count + SHA-256 of the fetched content, no body
copy). No product tech-stack records yet; those are a later phase.

## 2026-08-27 lint | Content-addressing validator introduced

- Added `scripts/check_llm_wiki.py` and verified the three records' filenames equal the
  SHA-256 of their own canonical JSON bytes.
- Verified `raw/index.json` maps each id to its record, and `wiki/index.md` + `wiki/log.md`
  reference all three sources.

## 2026-08-27 refine | Dynamic records carry a timezone-aware retrievedAt

Based on @Sol's review, the validator now separates **frozen** sources (pinned revision,
no `retrievedAt` needed) from **dynamic** sources (web page, doc index, service
announcement, vendor site, blog post), which must carry a timezone-aware `retrievedAt`
and may carry an `etag` / `lastModified`:

- Re-fetched `nimbus-docs` (docs index, ETag `74fd8dd9...`) and `google-code-wiki`
  (announcement, no ETag) and re-recorded them with corrected hashes + `retrievedAt`.
- `karpathy-llm-wiki` is frozen (fixed gist revision) and stays without `retrievedAt`.

## 2026-08-27 ingest | KubeBlocks comparison baseline

Added KubeBlocks as a **comparison baseline** using first-party vendor sources, recording
the factual OSS / Enterprise boundary without editorializing the vendor's model:

- `raw/sources/kubeblocks-home` — vendor home (`https://kubeblocks.io/`). Derived:
  `sources/kubeblocks-home`, `comparisons/kubeblocks`.
- `raw/sources/kubeblocks-openshift` — first-party deploy post on OpenShift. Derived:
  `sources/kubeblocks-openshift`, `comparisons/kubeblocks`.
- Both are dynamic records with a timezone-aware `retrievedAt` and an ETag.
- `raw/index.json` now anti-forges: keys equal the record-id set exactly, each value is
  `raw/sources/<id>/<sha>.json`, and each record's `id` equals its parent directory name.

## 2026-08-27 refine | Immutable-history + selector-based frozen

Tightened the machine contract after @Sol's update-revision simulation:

- A `raw/sources/<id>/` directory may now hold **1..N immutable records** (history), not
  one. `raw/index.json` points to exactly one **current** record per id (real file,
  parent id == dir == key); non-current records are still validated, and `--base`
  continues to reject delete/modify of anything present at the ref.
- **Frozen** is no longer a `kind` allowlist. A record is frozen only when it carries a
  machine-verifiable exact immutable selector (`revision` / `commit` / `tag` / `version` /
  `digest` under `reference`, or a top-level `pin`). Without one it is dynamic whatever
  its kind and must carry a timezone-aware `retrievedAt`.
- Added regression tests: old + new revision with index→new must PASS; deleting the old
  record (`--base`) must FAIL; a static `kind` with no exact pin must FAIL.
