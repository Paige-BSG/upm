# Kubernetes Client Node — source summary

**PRODUCT STACK (ADOPTED)** — the narrow Kubernetes client UPM's Phase 1 deterministic
execution layer uses to drive the external Percona operator.

- Raw record: `llm-wiki/raw/sources/kubernetes-client-node/716228d1fc8e18e7ba5b43a97f19baf4b0b8e6a9f5653e9eb7044df5dc01a720.json` (Apache-2.0).
- Derived page: [technologies/kubernetes-client-node](technologies/kubernetes-client-node.md).
- Upstream: <https://github.com/kubernetes-client/javascript>.

## What it is

The official JS/TS Kubernetes client (`@kubernetes/client-node`), version `2.0.0`
(gitHead `f72cc23ed378cb8e7f09129ee6e55aa531a2b9ba`), Apache-2.0. UPM uses a **narrow
adapter** over it so it can create the Percona `Backup`/`Restore` CRs and watch status —
it never gives the agent `kubectl`, a kubeconfig, or raw database access.

## Notes / status

- **Adopted (Phase 1 adapter).** K8s compatibility vs Minikube `1.38.1` and the official
  client-node vs k8s `1.35` pairing are **PENDING**.
- It is UPM's own deterministic-code path; the external operator (Go images) it talks to
  is not UPM source.
