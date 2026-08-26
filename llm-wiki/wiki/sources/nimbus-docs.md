# Nimbus Docs — source summary

**META-TOOL** — the docs framework this project uses. Not UPM tech stack.

- Raw record: `llm-wiki/raw/sources/nimbus-docs/43d4c809ead73db9a8277fe2616ca701f5e85a30dc665036876bad90716192af.json` (MIT).
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
- No unlicensed body copy; the license is MIT from upstream.
