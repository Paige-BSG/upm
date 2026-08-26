---
title: Wiki log
description: Append-only ingest / query / lint timeline for the UPM LLM wiki.
---

Append-only history of wiki operations. Each line is `## [date] op | title`.

## 2026-08-27 ingest | Nimbus Docs

- Added source record `/sources/nimbus-docs` (repo, docs site, scaffold 0.6.6 /
  templates-v0.6.6 / integration 0.11.0, MIT).
- Added derived page `/components/nimbus-docs` and cross-link from the source record.

## 2026-08-27 ingest | Karpathy LLM Wiki gist

- Added source record `/sources/karpathy-llm-wiki` (canonical gist, no versioned release).
- Added derived page `/concepts/karpathy-llm-wiki` and cross-link from the source record.

## 2026-08-27 ingest | Google Code Wiki

- Added source record `/sources/google-code-wiki` (codewiki.google, 2025-11-13 public
  preview, auxiliary understanding layer — not a facts source).
- Added derived page `/resources/google-code-wiki` and cross-link from the source record.

## 2026-08-27 lint | Full admission pass on first three ingests

- Verified each ingest has a source record, a derived page, a cross-link, and a log entry;
  no empty-template completion.
