# Percona Server for MySQL Operator — candidate

**DATA-PLANE CANDIDATE (pending admission)** — an external operator UPM's Phase 1
backup/restore slice drives. Not UPM source.
Source: [sources/percona-server-mysql-operator](sources/percona-server-mysql-operator.md).

## What it is

The Percona Server for MySQL operator, non-PXC **group-replication** variant. Tested
against tag `v1.2.0`.

- API group `ps.percona.com/v1` — `PerconaServerMySQL`, `PerconaServerMySQLBackup`,
  `PerconaServerMySQLRestore`.
- Group replication is GA; PS `8.4.10-10.1` is in v1.2.0 compatibility.
- `deploy/crd.yaml` (sha256 `e2a7fe...`), image `percona/percona-server-mysql-operator:1.2.0`
  (amd64 `76deed...`, arm64 `e0dd1e...`).

## Why candidate (not admitted)

The exact CRD / API surface and all image digests are still being verified against
first-party sources before admission into the stack. Do not cite this as UPM source.

## Boundary with UPM

The Operator's Go images are **external** software. UPM's own Phase 1 code is TypeScript
on Node 22, driving this operator through a narrow `@kubernetes/client-node` adapter — it
does not make UPM "a Go project." UPM is not writing the MySQL HA itself.

## Upstream

<https://github.com/percona/percona-server-mysql-operator> — Apache-2.0; tag `v1.2.0`
(commit `71fec83da870c47c3d75165ca36b848ce86fdb73`).
