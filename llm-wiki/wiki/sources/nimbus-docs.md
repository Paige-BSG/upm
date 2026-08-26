# Nimbus Docs — source summary

**META-TOOL** — the docs framework this project uses. Not UPM tech stack.

- Raw record: `llm-wiki/raw/sources/nimbus-docs/74fda4f769257ba314e613f0b0c62e4a146137b1afd0550349dd96662197c86f.json` (MIT).
- Derived page: [components/nimbus-docs](components/nimbus-docs.md).
- Upstream: <https://github.com/cloudflare/nimbus>, docs <https://nimbus-docs.com/>.

## What it is

Cloudflare Nimbus is an Astro-based documentation framework. It turns a content tree
(`src/content/docs/`) into a static site with a sidebar and TOC, and it natively serves
agents via `/llms.txt`, `/llms-full.txt`, and per-page `.md`. Version is 0.x; the
integration surface may change, so it is pinned exact.

## Notes

- The raw record stores an identity + the fetched `llms.txt` fingerprint (byte count +
  digest), not the full docs tree (MIT allows redistribution, but we keep it lean).
- The doc index is dynamic, so the record carries a timezone-aware `retrievedAt` plus the
  ETag from that fetch; a later change is re-ingested as a new record (new hash/filename).
- No unlicensed body copy; the license is MIT from upstream.
