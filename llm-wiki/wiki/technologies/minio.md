# MinIO — candidate

**DATA-PLANE CANDIDATE (pending admission)** — the object store the Phase 1 backup lands
in. Test stage only, never distributed with UPM.
Source: [sources/minio](sources/minio.md).

## What it is

MinIO `RELEASE.2025-10-15T17-29-55Z`. Image digest **PENDING**.

## Why candidate (not admitted)

The exact image digest is still being verified against first-party sources.

## Boundary with UPM

MinIO is a **replaceable test S3** stand-in for any S3-compatible backend in the restore
validation. It is never bundled with UPM as a distributed dependency.

## Upstream

<https://github.com/minio/minio> — AGPL-3.0; release `RELEASE.2025-10-15T17-29-55Z`.
