# UPM LLM Wiki — log

Append-only timeline. Each line is `## [date] op | title`.

## 2026-08-27 migrate | First three meta-tool records

Migrated the three initial meta-tool ingests from the old merged `docs/` wiki into this
standalone LLM wiki, as content-addressed identity records:

- `raw/sources/nimbus-docs` — Docs framework (Cloudflare Nimbus), MIT. Derived:
  `components/nimbus-docs`. **META-TOOL**.
- `raw/sources/karpathy-llm-wiki` — Karpathy LLM wiki paradigm gist (revision
  ac46de1ad27f92b28ac95459c782c07f6b8c964a). Derived: `concepts/karpathy-llm-wiki`. **META-TOOL**.
- `raw/sources/google-code-wiki` — Google Code Wiki service announcement. Derived:
  `concepts/google-code-wiki`. **META-TOOL**.

Each record is fingerprint-only (byte count + SHA-256 of the fetched content, no body
copy). No product tech-stack records yet; those are a later phase.

## 2026-08-27 lint | Content-addressing validator introduced

- Added `scripts/check_llm_wiki.py` and verified the three records' filenames equal the
  SHA-256 of their own canonical JSON bytes.
- Verified `raw/index.json` maps each id to its record, and `wiki/index.md` + `wiki/log.md`
  reference all three sources.

## 2026-08-27 refine | Dynamic records carry a timezone-aware retrievedAt

Based on @Sol's review, the validator now separates **frozen** sources (pinned revision,
no `retrievedAt` needed) from **dynamic** sources (web page, doc index, service
announcement, vendor site, blog post), which must carry a timezone-aware `retrievedAt`
and may carry an `etag` / `lastModified`:

- Re-fetched `nimbus-docs` (docs index, ETag `74fd8dd942058fe6c2dbe7604bf67889`) and `google-code-wiki`
  (announcement, no ETag) and re-recorded them with corrected hashes + `retrievedAt`.
- `karpathy-llm-wiki` is frozen (fixed gist revision) and stays without `retrievedAt`.

## 2026-08-27 ingest | KubeBlocks comparison baseline

Added KubeBlocks as a **comparison baseline** using first-party vendor sources, recording
the factual OSS / Enterprise boundary without editorializing the vendor's model:

- `raw/sources/kubeblocks-home` — vendor home (`https://kubeblocks.io/`). Derived:
  `sources/kubeblocks-home`, `comparisons/kubeblocks`.
- `raw/sources/kubeblocks-openshift` — first-party deploy post on OpenShift. Derived:
  `sources/kubeblocks-openshift`, `comparisons/kubeblocks`.
- Both are dynamic records with a timezone-aware `retrievedAt` and an ETag.
- `raw/index.json` now anti-forges: keys equal the record-id set exactly, each value is
  `raw/sources/<id>/<sha>.json`, and each record's `id` equals its parent directory name.

## 2026-08-27 refine | Immutable-history + selector-based frozen

Tightened the machine contract after @Sol's update-revision simulation:

- A `raw/sources/<id>/` directory may now hold **1..N immutable records** (history), not
  one. `raw/index.json` points to exactly one **current** record per id (real file,
  parent id == dir == key); non-current records are still validated, and `--base`
  continues to reject delete/modify of anything present at the ref.
- **Frozen** is no longer a `kind` allowlist. A record is frozen only when it carries a
  machine-verifiable exact immutable selector (`revision` / `commit` / `tag` / `version` /
  `digest` under `reference`, or a top-level `pin`). Without one it is dynamic whatever
  its kind and must carry a timezone-aware `retrievedAt`.
- Added regression tests: old + new revision with index→new must PASS; deleting the old
  record (`--base`) must FAIL; a static `kind` with no exact pin must FAIL.

## 2026-08-27 refine | Immutable pin must be a real selector

Tightened the frozen test after @Sol's last cut (pin typing):

- `ref` is **not** an immutable pin (a branch / `HEAD` ref is mutable).
- `commit` / `revision` / `sha` / `digest` must be a full-length digest — full 40/64-hex,
  or `algo:<hex>` (a short hash never counts).
- `tag` / `version` must be an exact literal; mutable sentinels (`latest` / `current` /
  `stable` / `main` / `master` / `HEAD`) and any range / wildcard form (`1.x`, `>=2`,
  `v1.*`) are rejected.
- Added regression tests for the real measured values: `ref=main`, `version=latest`, and
  `sha=not-a-sha` each FAIL (each is dynamic — missing `retrievedAt`). Existing 7
  scenarios preserved; 10 scenarios total.

## 2026-08-27 ingest | Phase 1 tech-stack records

Phase 1 (BackupProof) brings the first product tech-stack records. Each is a
content-addressed identity record (byte count + SHA-256 of the fetched upstream page, no
body copy). All are frozen via an exact immutable pin:

- `raw/sources/pi-agent` — Pi Agent runtime (`earendil-works/pi`, MIT), tag `v0.84.3`.
  **PRODUCT STACK (ADOPTED)**. Derived: `technologies/pi-agent`.
- `raw/sources/percona-server-mysql-operator` — Percona Server for MySQL Operator
  (Apache-2.0), tag `v1.2.0`, API `ps.percona.com/v1`, non-PXC group-replication.
  **DATA-PLANE CANDIDATE (pending admission)**. Derived: `technologies/percona-server-mysql-operator`.
- `raw/sources/percona-server-mysql` — Percona Server for MySQL `8.4.10-10.1`, **SPDX
  PENDING** (Oracle LIUM). **DATA-PLANE CANDIDATE (pending admission)**. Derived:
  `technologies/percona-server-mysql`.
- `raw/sources/percona-xtrabackup` — Percona XtraBackup `8.4.0-6.1`, **SPDX PENDING**
  (Oracle LIUM). **DATA-PLANE CANDIDATE (pending admission)**. Derived:
  `technologies/percona-xtrabackup`.
- `raw/sources/minio` — MinIO (AGPL-3.0) `RELEASE.2025-10-15T17-29-55Z`. **DATA-PLANE
  CANDIDATE (pending admission)**; test S3 only. Derived: `technologies/minio`.
- `raw/sources/kube-rs` — kube-rs (Apache-2.0) `4.2.0`. **FUTURE** (Rust operator later).
  Derived: `technologies/kube-rs`.

`raw/index.json` now points to all 11 ids; `wiki/index.md` rows and `wiki/sources/<id>.md`
pages added for each new record. Unclosed: MinIO image digest, PS / XtraBackup SPDX.

## 2026-08-27 ingest | Kubernetes Client Node + full-digest refresh

Added the narrow Kubernetes client UPM's Phase 1 deterministic layer drives the external
Percona operator with, as the second **PRODUCT STACK (ADOPTED)** record, and refreshed the
first-hand identities of the existing Phase 1 records per @Sol / @Grok's no-truncation rule:

- `raw/sources/kubernetes-client-node` — `@kubernetes/client-node@2.0.0`, Apache-2.0, gitHead
  `f72cc23ed378cb8e7f09129ee6e55aa531a2b9ba`. **PRODUCT STACK (ADOPTED)**. Derived:
  `technologies/kubernetes-client-node`. K8s compat vs Minikube `1.38.1` and the official
  client-node vs k8s `1.35` pairing remain **PENDING**.
- The 6 existing records are regenerated with full-length digests (no `...` truncation):
  pi-agent's two npm integrities + tag commit + npm gitHead; operator tag commit + CRD
  bytes/blob/sha256 + per-arch operator/percona-server/haproxy/router/orchestrator digests;
  percona-server and percona-xtrabackup per-arch digests (XtraBackup arm64 is exactly
  `fcf2b3fc20cfbfa6d47ec60cecd881f915beacdae838f994dda984baea825293`).
- `raw/index.json` now points to all **12** ids; `wiki/index.md` gains the kubernetes-client-node
  row. Still unclosed: MinIO image digest, PS / XtraBackup SPDX, test-machine arch/compat.
