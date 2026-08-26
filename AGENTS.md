# UPM repository — agent entry router

This is the UPM public repository. It holds project documentation, an agent LLM wiki,
and the Phase 1 BackupProof harness. Agents working in this repo start here.

## Where things live

| Path | What it is | Its own contract |
|---|---|---|
| `docs/` | Project documentation (Cloudflare Nimbus, human-first, also serves agents via `/llms.txt`). | `docs/AGENT.md` |
| `llm-wiki/` | Agent LLM wiki — Karpathy-style knowledge base of pinned, license-aware external resources. | `llm-wiki/AGENTS.md` |
| `harness/` | Phase 1 BackupProof Domain Harness (TypeScript / Node 22). Schema, planHash, approval, Fake K8s. | `harness/package.json` |
| `scripts/check_llm_wiki.py` | Validator for `llm-wiki/` (content addressing, `--base`, links/sources). | — |
| `scripts/check_no_comments.py` | Fail closed if UPM TypeScript/tests or this checker contain explanatory comments. | — |

## Long-term public-safety principle

The whole point of a public repo is that external users can build, understand, verify,
and contribute. Follow this from now on:

- **Always public** — source code, docs, decisions, release evidence.
- **Never in this repo** — credentials, customer data, internal conversations,
  undisclosed commercial information, `.secret-*` files, passwords, tokens.
- The standalone LLM wiki collects only **public-safe** technical knowledge. Internal
  context never enters this repository.

## Branching and pull requests

- `main` is the only long-lived release line. No long-lived `develop`.
- No direct push to `main`. Work on a short feature branch, open a pull request, and let
  an independent reviewer (another person or agent, recorded in Raft) say GO before
  merge.
- No force-push or deletion of `main`; linear history.
- Squash-merge; a PR becomes one clear commit on `main`. Releases are immutable `v*` tags
  created only from checked-in commits on `main`.

## Before opening a PR

Run the checks that exist today:

- `python3 scripts/check_llm_wiki.py .` — LLM wiki validator.
- `python3 scripts/check_no_comments.py .` — no explanatory comments in `harness/` source/tests.
- From `harness/`: `npm test`, `npm run typecheck`.
- From `docs/`: `pnpm run build`, `pnpm run typecheck`, `pnpm run lint:docs`.
- Secret scan — this repo must never contain a credential. Do not add `.env`,
  `.secret-*`, or any token/password.

Startup image/library pins stay `PENDING` until admitted. Do not guess digests.
Do not add comments to UPM TypeScript, tests, or `scripts/check_no_comments.py`.
