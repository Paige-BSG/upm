# Contributing to UPM

Thanks for helping. This project is early — the repository holds public documentation,
an agent LLM wiki, and the Phase 1 BackupProof harness. The workflow below applies to
whatever you change.

## Reporting a bug or suggesting a feature

Open an issue describing the change and why it matters. Do not include credentials,
private data, or internal context in the issue.

## Proposing a change

1. Make a short feature branch off `main`. Do not push directly to `main`, force-push,
   or delete `main`.
2. Make the change. Keep it focused; one branch = one logical change.
3. Run the checks that exist today:
   - From `docs/`: `pnpm install`, `pnpm run build`, `pnpm run typecheck`,
     `pnpm run lint:docs`.
   - From `harness/`: `npm install`, `npm test`, `npm run typecheck`.
   - From the repo root: `python3 scripts/check_llm_wiki.py .` and
     `python3 scripts/check_no_comments.py .`.
   - A secret scan — the repository never contains credentials.
   - Do not add explanatory comments to UPM TypeScript or tests.
4. Open a pull request against `main`. Describe what changed and why, and note the
   checks you ran.
5. Wait for an independent review before merge. The author cannot approve their own
   change; a different person or agent must say GO. Conversation must be resolved
   before merge.

## Merge policy

- Squash-merge; each pull request becomes one clear commit on `main`.
- The short branch is deleted on merge.
- Releases are immutable `v*` tags created only from checked-in commits on `main`.

## Issue and PR hygiene

- Keep changes small and reviewable.
- Never commit `.env`, `.secret-*`, tokens, or passwords.
- Public-safety rule: source, docs, decisions, and release evidence go in the repo;
  credentials, customer data, internal conversations, and undisclosed commercial
  information never do.
