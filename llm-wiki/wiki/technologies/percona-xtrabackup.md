# Percona XtraBackup — candidate

**DATA-PLANE CANDIDATE (pending admission)** — the backup tool used to take the physical
backup in Phase 1. Not UPM source.
Source: [sources/percona-xtrabackup](sources/percona-xtrabackup.md).

## What it is (exact identities)

Percona XtraBackup `8.4.0-6.1`.

- `percona/percona-xtrabackup:8.4.0-6.1` —
  amd64 `d135aadaae9e2f947cb2002f982f7b4c6e177b1c7e3d543ef7795aea999feedd`,
  arm64 `fcf2b3fc20cfbfa6d47ec60cecd881f915beacdae838f994dda984baea825293`.

## Status

- **Candidate, admission pending.** License classification is **PENDING** — upstream GitHub
  SPDX is `NOASSERTION`, actual license is Oracle's licensing terms.
- XtraBackup is an external tool; UPM does not package or vendor it. Phase 1 uses it to
  produce a physical backup, then restores to a **different** namespace / cluster.

## Upstream

<https://github.com/percona/percona-xtrabackup> — version `8.4.0-6.1`; **SPDX PENDING**
(Oracle LIUM; GitHub SPDX = NOASSERTION).
