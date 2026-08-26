# Percona Server for MySQL Operator — source summary

**DATA-PLANE CANDIDATE** — an external operator UPM's Phase 1 backup/restore slice drives.
Not UPM source; admission decision pending.

- Raw record: `llm-wiki/raw/sources/percona-server-mysql-operator/cb5803d71d1bcec5b5db39415e4e94e17ba950fa6998185aaea70176b67e8f45.json` (Apache-2.0).
- Derived page: [technologies/percona-server-mysql-operator](technologies/percona-server-mysql-operator.md).
- Upstream: <https://github.com/percona/percona-server-mysql-operator>.

## What it is

The Percona Server for MySQL operator, tagged `v1.2.0` (commit `71fec83da870c47c3d75165ca36b848ce86fdb73`), non-PXC,
group-replication variant. API `ps.percona.com/v1`: `PerconaServerMySQL`,
`PerconaServerMySQLBackup`, `PerconaServerMySQLRestore`. GA group-replication; PS
`8.4.10-10.1` in v1.2.0 compat.

## Notes / status

- **Candidate, admission pending.** The exact CRD / API and image digests are still being
  verified before this is admitted into the stack. Do **not** cite it as UPM source.
- The Operator's Go images are **external** software; UPM's own Phase 1 code is TypeScript
  on Node 22.
