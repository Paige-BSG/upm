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
