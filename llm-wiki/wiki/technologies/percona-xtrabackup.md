# Percona XtraBackup — candidate

**DATA-PLANE CANDIDATE (pending admission)** — the backup tool used to take the physical
backup in Phase 1. Not UPM source.
Source: [sources/percona-xtrabackup](sources/percona-xtrabackup.md).

## What it is

Percona XtraBackup `8.4.0-6.1`. Image `percona/percona-xtrabackup:8.4.0-6.1`
(amd64 `d135aa...`, arm64 `fcf2b3...`).

## Why candidate (not admitted)

License classification is **pending** — upstream GitHub SPDX is `NOASSERTION`; the actual
license is Oracle's licensing terms. Admission pending confirmation of the exact image
digests.

## Boundary with UPM

XtraBackup is an external tool; UPM does not package or vendor it. Phase 1 uses it to
produce a physical backup, then restores to a **different** namespace / cluster.

## Upstream

<https://github.com/percona/percona-xtrabackup> — version `8.4.0-6.1`; **SPDX PENDING**
(Oracle LIUM; GitHub SPDX = NOASSERTION).
