# Pi Agent — source summary

**PRODUCT STACK (ADOPTED)** — the agent runtime UPM's in-product agent is built on. Not a
meta-tool; it is UPM product tech stack.

- Raw record: `llm-wiki/raw/sources/pi-agent/cb5402159d093fd99047c76aeaae1c5eee8fcb3753309a78b727411c4725aecd.json` (MIT).
- Derived page: [technologies/pi-agent](technologies/pi-agent.md).
- Upstream: <https://github.com/earendil-works/pi>.

## What it is

`earendil-works/pi` is a coding agent runtime. UPM adopts its **agent loop, tool calling,
message/state and event streaming, and an abstract model layer** (`@earendil-works/pi-ai`),
pinned to tag `v0.84.3` (source commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`; npm
gitHead `bfb004d4418ff05c6f909eaaab856cbe75c1fde0` — the published tarball head differs
from the tag commit; both recorded). npm `@earendil-works/pi-agent-core@0.84.3` and
`@earendil-works/pi-ai@0.84.3`, each with its own npm integrity.

## Notes / status

- **Adopted, pin closed.** Reason: the loop, tool-calling, and model abstraction are exactly
  the agent layer UPM needs.
- UPM does **not** reuse the coding agent's `bash`, file, and process permissions in
  production — the production permission model lives in UPM's domain harness, and the
  in-product agent defaults to the smallest-scoped domain tools.
