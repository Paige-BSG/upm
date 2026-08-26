# kube-rs — future

**FUTURE** — a Rust Kubernetes client library. Not used in Phase 1.
Source: [sources/kube-rs](sources/kube-rs.md).

## What it is

A Rust Kubernetes client (`kube` + `kube-runtime`), version `4.2.0`. For UPM's own Rust
operator later.

## When it enters the stack

Rust enters the stack only when UPM ships its own reconcile / finalizer / leader-election
operator. Until then the Phase 1 deterministic layer is TypeScript on Node 22 via a narrow
`@kubernetes/client-node` adapter. Recorded now so the license (Apache-2.0) and the pin
(`4.2.0`) are on record ahead of that decision.

## Upstream

<https://github.com/kube-rs/kube-rs> — Apache-2.0; release `4.2.0`.
