# UPM LLM Wiki — index

The agent knowledge base of every external resource and open-source component UPM's
repositories reference. Each entry is pinned and license-aware. The authority is the
immutable source record under `raw/sources/`.

> **Scope note.** Entries fall into groups: **META-TOOL** — tools used to build and
> document UPM (not UPM's product tech stack); **COMPARISON BASELINE** — an external
> project UPM compares against (not a dependency); and **PRODUCT STACK** — components UPM
> actually builds on. Product-stack `technologies/` records are brought in as phases land;
> Phase 1 adds the agent runtime plus the data-plane candidates, which remain
> `candidate/pending admission` until their admission gates close (compatibility, license,
> and image-digest admission remain open for some).

## Current records

| Resource | Kind | Category | Source record |
|---|---|---|---|
| [Nimbus Docs](components/nimbus-docs.md) | docs-framework | components (META-TOOL) | `raw/sources/nimbus-docs` |
| [Karpathy LLM Wiki](concepts/karpathy-llm-wiki.md) | idea-gist | concepts (META-TOOL) | `raw/sources/karpathy-llm-wiki` |
| [Google Code Wiki](concepts/google-code-wiki.md) | service-announcement | concepts (META-TOOL) | `raw/sources/google-code-wiki` |
| [KubeBlocks — OSS vs Enterprise](comparisons/kubeblocks.md) | vendor-site | comparisons (BASELINE) | `raw/sources/kubeblocks-home` + `raw/sources/kubeblocks-openshift` |
| [Pi Agent](technologies/pi-agent.md) | agent runtime | technologies (PRODUCT STACK, adopted) | `raw/sources/pi-agent` |
| [Kubernetes Client Node](technologies/kubernetes-client-node.md) | Kubernetes client | technologies (PRODUCT STACK, adopted) | `raw/sources/kubernetes-client-node` |
| [Percona Server for MySQL Operator](technologies/percona-server-mysql-operator.md) | operator (candidate) | technologies (DATA-PLANE CANDIDATE) | `raw/sources/percona-server-mysql-operator` |
| [Percona Server for MySQL](technologies/percona-server-mysql.md) | database engine (candidate) | technologies (DATA-PLANE CANDIDATE) | `raw/sources/percona-server-mysql` |
| [Percona XtraBackup](technologies/percona-xtrabackup.md) | backup tool (candidate) | technologies (DATA-PLANE CANDIDATE) | `raw/sources/percona-xtrabackup` |
| [MinIO](technologies/minio.md) | object storage (candidate) | technologies (DATA-PLANE CANDIDATE) | `raw/sources/minio` |
| [kube-rs](technologies/kube-rs.md) | Kubernetes client library | technologies (FUTURE) | `raw/sources/kube-rs` |

## Reading route

- `sources/` — a derived summary per source record.
- `components/` — distributable / executable external components (frameworks, tools).
- `concepts/` — recurring concepts and paradigms.
- `comparisons/` — neutral comparison baselines (e.g. KubeBlocks).
- `technologies/` — product tech-stack components: adopted stack, data-plane candidates,
  and future libraries.
- `decisions/` — held decisions (future).
- `log.md` — append-only ingest / query / lint timeline.

## Contract

See `../AGENTS.md` for the three operations and the content-addressing and license rules.
Every claim in this wiki traces to a source record; source records are immutable.
