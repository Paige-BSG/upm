# Pi Agent — component

**PRODUCT STACK (ADOPTED)** — the agent runtime UPM's in-product agent is built on.
Source: [sources/pi-agent](sources/pi-agent.md).

## Why we adopt it

`earendil-works/pi` gives UPM the agent loop, tool calling, message/state and event
streaming, and an abstract model layer (`@earendil-works/pi-ai`) — exactly the layer-1
agent/intent piece, without binding UPM to a model. Pinned to tag `v0.84.3`.

## The interface we use (exact identities)

- Source tag `v0.84.3` = commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`.
- npm gitHead `bfb004d4418ff05c6f909eaaab856cbe75c1fde0` — the published tarball head,
  which **differs** from the tag commit above; both are recorded.
- `@earendil-works/pi-agent-core@0.84.3` — npm integrity
  `sha512-VURr+xBRl3RxYcw3kT9Pn3yfi6LbRoCJgHF7h1mAblMjtLNV/MfG/RyF0uJizBAM886AEakSiw3j9c/aSngppg==`.
- `@earendil-works/pi-ai@0.84.3` — npm integrity
  `sha512-M0YUV8vNO3y2WwWSyY8ijKJV5W4gkSUixuvk+Z00ZBjsyMfsdXfITsHEwP1UIf09YRWXT6oGn0GlCamt+P32XQ==`.

## Boundaries

- UPM supplies the **production permission model** in its domain harness; Pi's core has no
  built-in permission system and inherits the launcher's, so UPM never reuses the coding
  agent's `bash` / file / process permissions in product.
- Pi is required in Phase 1 (the agent layer of BackupProof); pin is closed.

## Upstream

<https://github.com/earendil-works/pi> — MIT; source tag `v0.84.3`.
