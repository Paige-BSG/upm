# MinIO — source summary

**DATA-PLANE CANDIDATE** — the object store the Phase 1 backup lands in. Used as a
replaceable test S3, never distributed with UPM.

- Raw record: `llm-wiki/raw/sources/minio/5c01b3f34c25782451bd311f06a37dec07d5ffb587b42f4288778442c271f7ad.json` (AGPL-3.0).
- Derived page: [technologies/minio](technologies/minio.md).
- Upstream: <https://github.com/minio/minio>.

## What it is

MinIO, release `RELEASE.2025-10-15T17-29-55Z`.

## Notes / status

- **Candidate, admission pending.** Image digest still being verified.
- The is a **test-stage** object store only — a replaceable stand-in for any S3-compatible
  backend in the restore validation, and never bundled with UPM as a distributed
  dependency.
