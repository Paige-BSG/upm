# Pi Agent — component

**PRODUCT STACK (ADOPTED)** — the agent runtime UPM's in-product agent is built on.
Source: [sources/pi-agent](sources/pi-agent.md).

## Why we adopt it

`earendil-works/pi` gives UPM the agent loop, tool calling, message/state and event
streaming, and an abstract model layer (`@earendil-works/pi-ai`) — exactly the layer-1
agent/intent piece, without binding UPM to a model. Pinned to tag `v0.84.3`.

## The interface we use

- `@earendil-works/pi-agent-core@0.84.3` — the agent loop, tool calling, message/state and
  event streaming.
- `@earendil-works/pi-ai@0.84.3` — abstract model layer, so UPM is not tied to one model.
- UPM supplies the **production permission model** in its domain harness; Pi's core has no
  built-in permission system and inherits the launcher's, so UPM does not reuse the coding
  agent's `bash` / file / process permissions in product.

## Boundaries

- Adopt the **Pi runtime**, not Pi coding-agent **permissions**. In-product the agent
  default is the smallest-scoped domain tools, never cluster-admin access.
- Pi is required in Phase 1 (the agent layer of BackupProof); pin is closed.

## Upstream

<https://github.com/earendil-works/pi> — MIT; tag `v0.84.3` (commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`).
