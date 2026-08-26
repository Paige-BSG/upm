# MinIO — source summary

**DATA-PLANE CANDIDATE** — the object store the Phase 1 backup lands in. Used as a
replaceable test S3, never distributed with UPM.

- Raw record: `llm-wiki/raw/sources/minio/21b86196790a09e3f957c3de35db83998dedf459cb23cb5e17a87b1e7f13ec66.json` (AGPL-3.0).
- Derived page: [technologies/minio](technologies/minio.md).
- Upstream: <https://github.com/minio/minio>.

## What it is

MinIO, release `RELEASE.2025-10-15T17-29-55Z`.

## Notes / status

- **Candidate, admission pending.** Image digest **PENDING**.
- This is a **test-stage** object store only — a replaceable stand-in for any S3-compatible
  backend in the restore validation, never bundled with UPM as a distributed dependency.
