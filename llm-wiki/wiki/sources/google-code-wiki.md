# Google Code Wiki — source summary

**META-TOOL** — an auxiliary understanding aid for public repos. Not a pin/license facts
source, and not UPM tech stack.

- Raw record: `llm-wiki/raw/sources/google-code-wiki/8874579792b7622eee4b35f566ec723bb2d0e847fcd68ab2fa3fa681ae6676e0.json` (Google service).
- Derived page: [concepts/google-code-wiki](concepts/google-code-wiki.md).
- Upstream: <https://codewiki.google/> — announcement
  <https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/>.

## What it is

Google Code Wiki auto-generates and continuously updates a structured wiki for **public
GitHub** repositories (overview, modules, architecture/class/sequence diagrams) and lets
you chat using the wiki as context. Private repos are "Coming Soon".

## Notes

- Useful to orient quickly in an unfamiliar upstream repo, but it is generated, not
  authoritative. It is never the source for version pins or licenses.
- The announcement page is dynamic (no ETag/Last-Modified on this fetch); the record
  stores a timezone-aware `retrievedAt` and its digest is per-fetch.
- No downloadable first-party artifact this round; the raw record stores the announcement
  page fingerprint only.
