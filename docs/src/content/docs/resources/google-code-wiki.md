---
title: Google Code Wiki
description: What Google Code Wiki is, how to use it for an upstream repo, and where it is deliberately not authoritative.
---

Google Code Wiki is Google's public-preview (2025-11-13) service that turns a **public
GitHub repository** into a continuously updated, structured wiki. Gemini scans the
codebase, regenerates the docs after each change, and answers questions from that wiki.

## What it produces per repo

- Overview of the repository's purpose.
- Module-by-module explanations.
- Auto-generated architecture, class, and sequence diagrams.
- Structured API references and usage guides derived from how the code is used internally.
- Bidirectional hyperlinks: every section points to the exact files, classes, and functions.
- A Gemini chat that answers questions using the **updated wiki** as context, not the raw code.

## How UPM uses it

- **Orient fast in an unfamiliar upstream repo.** Open
  `https://codewiki.google/github.com/{owner}/{repo}` to get a map of a dependency before
  reading its source.
- Keep the URL in a source record as a secondary pointer behind the primary repo/docs URL.

## Deliberately not authoritative

For an admitted dependency, Code Wiki is **not** the source of truth. UPM reads the
real version pin and license from the repo itself; Code Wiki is an AI-generated
understanding layer that evolves on its own. Treat it as a reading aid, never as the
evidence for a claim in the wiki.

## Status / limits

- Public repositories only, free, no registration.
- Private repos: "Coming Soon" via a Gemini CLI extension (waitlist, **not** installed this round).
- No first-party offline export; unofficial tools exist but are not Google products and are not used here.

## Source

- Source record: `/sources/google-code-wiki`

## Ownership

- Owner: `@DeepSeek`
- Last verified: 2026-08-27
