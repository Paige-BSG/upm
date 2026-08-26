# UPM

UPM is an **AI-native data-service ops control plane**: an open-source project to help
teams operate databases and middleware on Kubernetes. It is designed so that an in-product
**agent is a first-class operator** — a human expresses intent, and a deterministic
control plane executes it safely.

> Status: early. This repository holds the project's public documentation and the agent
> LLM wiki. There is **no usable product yet** — no product source code is in this
> repository. The pages in `docs/` describe the intended direction, not a shipped
> artifact. See the [roadmap](docs/src/content/docs/introduction/roadmap.mdx).

## What's here

- `docs/` — the public, human-first **project documentation** (built with Cloudflare
  Nimbus). It serves humans at `/` and agents via `/llms.txt` and per-page `.md`.
- `llm-wiki/` — the **agent LLM wiki**, a Karpathy-style knowledge base: a pinned,
  license-aware library of external resources and open-source components the project
  references. This is for channel agents to understand the tech stack, not the public
  docs site.
- `CONTRIBUTING.md` — how to propose and land a change.
- `SECURITY.md` — how to report a vulnerability.
- `CODE_OF_CONDUCT.md` — expected behavior for contributors.
- `LICENSE` — Apache-2.0.

## Project background

UPM is an AI-native rebuild of data-service operations on Kubernetes. Our company already
ships a product for this space; its public repository
([upmio](https://github.com/upmio)) is our **reference for the problem space and the
operator experience** — not source code being moved into this repository. UPM is a fresh,
public, AI-native project, and the earlier upmio codebase is public reference material
only.

The intended product shape is three layers, designed from day one: an **agent** that
takes intent, a **domain harness** that is the security contract around that intent, and a
**deterministic execution layer** (open-source operators/controllers) that actually makes
the change. The architecture page describes this direction in more detail.

## Repository conventions

- `main` is the only long-lived release line. There is no long-lived `develop`.
- Work happens on short feature branches; every change lands via a pull request.
- See `AGENTS.md` (root) for the agent knowledge contract, `docs/AGENT.md` for how to
  author the docs site, and `llm-wiki/AGENTS.md` for the LLM wiki rules.

## Build the docs

From `docs/`:

- `pnpm install`
- `pnpm run build` — static site plus `/llms.txt`, `/llms-full.txt`, and per-page `.md` in `dist/`
- `pnpm run typecheck` — `astro check`
- `pnpm run lint:docs` — `nimbus-docs lint`

## Validate the LLM wiki

From the repo root:

- `python3 scripts/check_llm_wiki.py .` — content-addressed raw records, `--base` guard,
  index/log/link/source checks.
- `python3 scripts/test_check_llm_wiki.py .` — negative anti-forgery tests for the index.
