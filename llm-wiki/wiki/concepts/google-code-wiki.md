# Google Code Wiki — concept

**META-TOOL** — an auxiliary understanding aid for public GitHub repos. Source:
[sources/google-code-wiki](sources/google-code-wiki.md).

## What it is

Google Code Wiki uses Gemini to scan a **public GitHub** repository and generate an
always-updated wiki: overview, modules, architecture/class/sequence diagrams. You can also
chat with the repo using the wiki as context. URL: `https://codewiki.google/github.com/{owner}/{repo}`.

## How we use it

- **Orientation only.** It helps an agent or human get the shape of an unfamiliar upstream
  repo quickly.
- It is **not** a facts / pin / license source. The version pin and the license come from
  the repo itself (`package.json`/manifest, `LICENSE`), never from the generated page.

## Limits

- Public repos only. Private repos are "Coming Soon" via a Gemini CLI extension; that is a
  waitlist, not an installable tool this round.
- Only GitHub today.
- Generated content is served by Google; we link and cite, we don't redistribute it.

## Notes

- Use it for a first read of an upstream repo, then confirm every fact from the
  first-hand source and record it in this wiki.
