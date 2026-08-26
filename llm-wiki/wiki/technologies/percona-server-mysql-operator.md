# Percona Server for MySQL Operator — candidate

**DATA-PLANE CANDIDATE (pending admission)** — an external operator UPM's Phase 1
backup/restore slice drives. Not UPM source.
Source: [sources/percona-server-mysql-operator](sources/percona-server-mysql-operator.md).

## What it is (exact identities)

The Percona Server for MySQL operator, non-PXC **group-replication** variant, tag `v1.2.0`.

- **Tag commit** `71fec83da870c47c3d75165ca36b848ce86fdb73`.
- **API group** `ps.percona.com/v1` — kinds `PerconaServerMySQL`, `PerconaServerMySQLBackup`,
  `PerconaServerMySQLRestore`.
- **GA** = group-replication; PS `8.4.10-10.1` is in v1.2.0 compatibility.
- **CRD** `deploy/crd.yaml` — bytes `693659`, git blob
  `c250d56bab2858128d2828a7774fc6c56252a2ef`, sha256
  `e2a7fef0f5af08d378d8ce49627f062a5c85b6d8e9d6b5b44369a0b8490b8b70`.

### Image set (per-certified manifest; all external Go images, NOT UPM source)

- `percona/percona-server-mysql-operator:1.2.0` —
  amd64 `76deed6a6daca2846fba6046b6646e25d22bca2d6d58a0b567e0a2c1240fe103`,
  arm64 `e0dd1e6bf1fd90b2149290500997ee791101f4500b5162bcea5694b1b9d7ab58`.
- `percona/haproxy:2.8.18-1` —
  amd64 `09e4d2ce9e65dc4aec9195e818e6da2041aea1a2bdb04f868d8c42ee81090dbf`,
  arm64 `563d84d64e1668cb4f6b2202fbe15a18e0733b48fe963383bb877c9e3a8a0abd`.
- `percona/percona-mysql-router:8.4.10-10.1` —
  amd64 `7edd16793022a518842aa6e709582af9175ee9ab145faf11e930f8175f16c588`,
  arm64 `e3be4405858a4198ecb1265365763de33dc6991bdb811bbc10803a92d06606a0`.
- `percona/percona-orchestrator:3.2.6-22` —
  amd64 `384bcf3121f50e9536fc911532386b9b485a52701e1e99ada51a5faf91d667c3`,
  arm64 `7ed29d0cde9396687fa42e1640ac2554125fd3a1e2a9f8d70667bbd00b386703`.

## Status

- **Candidate, admission pending.** The CRD / API and per-arch image digests are recorded
  first-hand; overall **integration** is still pending (test-machine architecture / compat).
- The Operator's Go images are **external** software. UPM's own Phase 1 code is TypeScript
  on Node 22, driving this operator through a narrow `@kubernetes/client-node` adapter — it
  does **not** make UPM "a Go project."

## Upstream

<https://github.com/percona/percona-server-mysql-operator> — Apache-2.0 (License text;
GitHub SPDX=NOASSERTION); tag `v1.2.0`.
