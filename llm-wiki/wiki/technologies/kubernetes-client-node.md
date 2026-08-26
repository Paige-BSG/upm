# Kubernetes Client Node — component

**PRODUCT STACK (ADOPTED)** — the narrow Kubernetes client UPM's Phase 1 deterministic
execution layer uses to drive the external Percona operator.
Source: [sources/kubernetes-client-node](sources/kubernetes-client-node.md).

## Why we adopt it (narrow, not full k8s powers)

UPM's deterministic execution code does not shell out to `kubectl`. It uses a **narrow
adapter** over `@kubernetes/client-node` so it can create the Percona `Backup`/`Restore`
CRs and watch status. The agent never receives a kubeconfig or a shell.

## The interface we use (exact identities)

- npm `@kubernetes/client-node@2.0.0` — gitHead
  `f72cc23ed378cb8e7f09129ee6e55aa531a2b9ba`, Apache-2.0.
- K8s compatibility vs Minikube `1.38.1` — **PENDING**; official client-node vs k8s `1.35`
  pairing — **PENDING**.

## Boundaries

- It is UPM's own deterministic-code path (TypeScript on Node 22). The external Percona
  operator it talks to is **not** UPM source; its Go images do not make UPM a Go project.

## Upstream

<https://github.com/kubernetes-client/javascript> — Apache-2.0; release `2.0.0`.
