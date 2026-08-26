---
title: Google Code Wiki — source record
description: Immutable reference for Google's Code Wiki, the generated understanding layer for public GitHub repos.
---

- Name: Google Code Wiki
- Upstream: <https://codewiki.google/> — repo view <https://codewiki.google/github.com/{owner}/{repo}>
- Announcement: Google Developers Blog, 2025-11-13 — public preview (<https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/>)
- Reference: public preview, no versioned release; a repo wiki is requested/claimed at codewiki.google
- License: Google's service; the generated wiki is an auxiliary AI understanding layer — **not** a facts / pin / license source
- Fetched: 2026-08-27
- Rights: served by Google. We link and cite, not redistribute, generated wiki content. Dependency license is read from the repo itself, never from the Code Wiki page.

Google Code Wiki auto-generates and continuously updates a structured wiki for **public
GitHub** repositories. It is an auxiliary understanding layer for UPM — useful to
orient quickly in an unfamiliar upstream repo — and is deliberately not the authority
for version pins or licenses.

## Derived

- `/resources/google-code-wiki` — what it is, how to use it, and its limits.

## Notes

- Unique content per repo is only generated (or requestable) as a wiki; there is no
  downloadable-offline first-party artifact this round.
- Private repos are "Coming Soon" via a Gemini CLI extension (waitlist). Not used this round.
