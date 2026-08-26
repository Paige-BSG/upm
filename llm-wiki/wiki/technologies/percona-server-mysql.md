# Percona Server for MySQL — candidate

**DATA-PLANE CANDIDATE (pending admission)** — the engine the Phase 1 backup/restore
slice backs up and restores. Not UPM source.
Source: [sources/percona-server-mysql](sources/percona-server-mysql.md).

## What it is

Percona Server for MySQL `8.4.10-10.1`. Image `percona/percona-server:8.4.10-10.1`
(amd64 `d24391...`, arm64 `70f6c4...`).

## Why candidate (not admitted)

License classification is **pending** — upstream GitHub SPDX is `NOASSERTION`, and the
actual license is Oracle's licensing terms, not yet classified. Admission is also pending
confirmation of the exact image digests.

## Boundary with UPM

The engine is external; UPM does not ship a MySQL build. It is the thing Phase 1
validates backup/restore against.

## Upstream

<https://github.com/percona/percona-server> — version `8.4.10-10.1`; **SPDX PENDING**
(Oracle LIUM; GitHub SPDX = NOASSERTION).
