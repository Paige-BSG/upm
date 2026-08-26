# UPM

UPM is an open-source project to manage databases and middleware on Kubernetes. This
repository is its **public home** — the place where external users understand the
project, see its documentation and its knowledge base, and eventually contribute.

> Status: early. The repository currently holds the project's public documentation and
> the agent LLM wiki. Product source code is still being refactored upstream
> (<https://github.com/upmio>) and will be added here as it is released. Nothing here
> is a promise that a usable product exists yet — see the roadmap in `docs/`.

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

UPM is a thorough refactor of <https://github.com/upmio>. It manages databases and
middleware on Kubernetes. The reference implementation is being rebuilt, not forked;
the earlier open-source repositories are used only as reference material.

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
