# Percona Server for MySQL — candidate

**DATA-PLANE CANDIDATE (pending admission)** — the engine the Phase 1 backup/restore
slice backs up and restores. Not UPM source.
Source: [sources/percona-server-mysql](sources/percona-server-mysql.md).

## What it is (exact identities)

Percona Server for MySQL `8.4.10-10.1`.

- `percona/percona-server:8.4.10-10.1` —
  amd64 `d24391a363426239220c35b9707d6b26ce7522ac27abe55689baebfb48bd9fb3`,
  arm64 `70f6c4d01b5807737cdd423ab32af1feb1d00513b5420a84361773b167aeca87`.

## Status

- **Candidate, admission pending.** License classification is **PENDING** — upstream GitHub
  SPDX is `NOASSERTION`, actual license is Oracle's licensing terms.
- The engine is external; UPM does not ship a MySQL build. It is the thing Phase 1
  validates backup/restore against.

## Upstream

<https://github.com/percona/percona-server> — version `8.4.10-10.1`; **SPDX PENDING**
(Oracle LIUM; GitHub SPDX = NOASSERTION).
