# UPM Agent Knowledge Contract

UPM's **LLM wiki** lives in `docs/src/content/docs/` — it is simultaneously Andrej
Karpathy's LLM-compiled wiki and Nimbus's content tree. It holds a pinned,
license-aware record + derived summary for every external resource and
open-source component our repositories reference.

The **source of truth** for a dependency is the committed wiki page + source
record in this repo, not a dynamic webpage or a Code Wiki generated view.

## Three operations

### 1. Ingest

- Choose a first-hand source (repo, docs site, paper, gist, service).
- Add an **immutable source record** under `sources/` with the exact reference:
  upstream URL, exact tag / commit / digest, fetched date, and license / rights
  boundary.
- Confirm the key points with the human.
- Create or update the derived page(s): `components/` for executable or
  distributable dependencies, `resources/` for external knowledge, `concepts/`
  for recurring ideas. Add cross-links.
- Update `index.mdx` and append to `log.md`.

**Never mutate a historical source record.** An upstream change is a **new
revision** record, never an overwrite of an old one.

### 2. Query

- Read the index first, then the relevant derived pages and source records.
- Cite the specific source record for every claim.
- Analyses worth keeping are written back to the wiki **only after human
  confirmation**; chat conclusions never auto-become facts.

### 3. Lint

- Fix contradictions, stale conclusions, orphan pages, missing backlinks,
  important concepts with no page, unsourced claims, dead links, and
  real manifest / lockfile pins that disagree with the wiki.

## Admission contract (external resource / open-source component)

A dependency is admitted only when a single change contains all of:

1. a **raw source record** (`sources/`): official URL, exact tag/commit/digest,
   fetched date, license / rights boundary;
2. a **derived wiki page** (`components/` or `resources/`): why it is used, the
   real integration surface, what is explicitly **not** used, compatibility /
   security / privacy / distribution / upgrade risk, and the upgrade trigger;
3. a **correspondence** to the real manifest / lockfile version pin.

Missing any of the three means **not admitted**. Models, datasets, and fonts are
reviewed for rights separately — never reuse the code license. Third-party
originals are redistributed only if licensed for it; otherwise keep the immutable
identity record plus our own summary, not the upstream file.

## Out of scope this round

- No Cloudflare zone / AI Search / MCP wiring.
- No non-official Code Wiki CLI.
- No deployment (`wrangler deploy`) — astro config site URL is a placeholder.
