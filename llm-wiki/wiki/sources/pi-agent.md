# Pi Agent — source summary

**PRODUCT STACK (ADOPTED)** — the agent runtime UPM's in-product agent is built on. Not a
meta-tool; it is UPM product tech stack.

- Raw record: `llm-wiki/raw/sources/pi-agent/5ccf2fcca6974b3186a1e6e4ef63a54537451a543daad9ad970aeceeb370327a.json` (MIT).
- Derived page: [technologies/pi-agent](technologies/pi-agent.md).
- Upstream: <https://github.com/earendil-works/pi>.

## What it is

`earendil-works/pi` is a coding agent runtime. UPM adopts its **agent loop, tool calling,
message/state and event streaming, and an abstract model layer** (`@earendil-works/pi-ai`),
pinned to tag `v0.84.3` (commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`). npm
`@earendil-works/pi-agent-core@0.84.3` and `@earendil-works/pi-ai@0.84.3`.

## Notes / status

- **Adopted, pin closed.** Reason: the loop, tool-calling, and model abstraction are
  exactly the agent layer UPM needs, and they are unpinned-or-broaden otherwise.
- UPM does **not** reuse the coding agent's `bash`, file, and process permissions in
  production — the production permission model lives in UPM's domain harness, and the
  in-product agent defaults to the smallest-scoped domain tools.
