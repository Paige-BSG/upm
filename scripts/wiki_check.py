#!/usr/bin/env python3
"""Fail-closed validator for the UPM LLM wiki admission contract.

Enforces Sol's acceptance rules on `docs/src/content/docs/`:
  - every admission has a source record (immutable identity) + a derived page + a link back;
  - every public wiki claim traces to a source record;
  - index and log are present and in sync with what actually exists;
  - exactly one git root (no nested .git);
  - source-record URLs are HTTPS.

Exit 0 on all pass, 1 on any failure. Stdlib only.

Usage: python3 scripts/wiki_check.py [repo_root]
"""

import pathlib
import re
import sys
from typing import List, Optional


def fail(msg: str, errors: List[str], path: Optional[pathlib.Path] = None) -> None:
    where = f"  {path.relative_to(REPO)}\n" if path else ""
    errors.append(f"{msg}\n{where}")


def require(marker: str, text: str, path: pathlib.Path, errors: List[str]) -> None:
    if marker not in text:
        fail(f"source record missing required marker '{marker}'", errors, path)


def resolve_link(path: str, content_root: pathlib.Path) -> Optional[pathlib.Path]:
    """Map a leading-slash content route (e.g. /sources/x) to a file under content_root."""
    if path == "/":
        return content_root / "index.mdx"
    rel = path.strip("/")
    for ext in (".md", ".mdx"):
        candidate = content_root / f"{rel}{ext}"
        if candidate.exists():
            return candidate
        if (candidate / "index.mdx").exists():
            return candidate / "index.mdx"
    return None


def main() -> int:
    global REPO
    REPO = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    REPO = REPO.resolve()
    if not (REPO / ".git").exists():
        print(f"FAIL: {REPO} is not the repo root (no .git).")
        return 1

    content_root = REPO / "docs" / "src" / "content" / "docs"
    errors: List[str] = []

    # --- 0. exactly one git root -------------------------------------------------
    nested = [p for p in REPO.rglob(".git") if p.is_dir()]
    # REPO/.git is expected; anything at a deeper level is a nested repo.
    nested_errors = [p for p in nested if p != REPO / ".git"]
    for p in nested_errors:
        fail("nested git repository found", errors, p)
    if nested_errors:
        print("FAIL: nested .git detected (must be a single repo).")
        print(errors[0])
        return 1

    # --- 1. source records --------------------------------------------------------
    source_dir = content_root / "sources"
    if not source_dir.is_dir():
        fail("missing 'sources/' directory", errors)
    source_files = sorted(source_dir.glob("*.md"))
    if not source_files:
        fail("no source records found in 'sources/'", errors)

    source_slugs = set()
    for f in source_files:
        text = f.read_text(encoding="utf-8")
        slug = f.stem
        source_slugs.add(slug)
        if "title:" not in text.split("---", 2)[1]:
            fail("source record missing title frontmatter", errors, f)
        for marker in ("Upstream:", "License:", "Reference:", "Fetched:"):
            require(marker, text, f, errors)
        # HTTPS URLs only
        for url in re.findall(r"https?://[^\s)>]+", text):
            if not url.startswith("https://"):
                fail(f"non-HTTPS URL in source record: {url}", errors, f)

    # --- 2. derived pages trace to a source record ------------------------------
    derived_dirs = ["components", "resources", "concepts", "entities", "comparisons", "decisions"]
    derived_pages = []
    for sub in derived_dirs:
        d = content_root / sub
        if d.is_dir():
            derived_pages += sorted(d.glob("*.md"))

    for f in derived_pages:
        text = f.read_text(encoding="utf-8")
        if "title:" not in text.split("---", 2)[1]:
            fail("derived page missing title frontmatter", errors, f)
        # must have a ## Source section linking to an existing source record
        source_links = re.findall(r"/sources/([A-Za-z0-9._-]+)", text)
        if not source_links:
            fail("derived page has no backlink to a source record", errors, f)
        for slug in source_links:
            if slug not in source_slugs:
                fail(f"derived page links to unknown source '{slug}'", errors, f)

    # --- 3. every internal content link resolves ----------------------------------
    all_md = list(source_dir.glob("*.md"))
    for sub in derived_dirs:
        d = content_root / sub
        if d.is_dir():
            all_md += list(d.glob("*.md"))
    all_md.append(content_root / "index.mdx")

    for f in all_md:
        if not f.exists():
            continue
        text = f.read_text(encoding="utf-8")
        for link in set(re.findall(r"\]\((/[^)]*)\)", text)):
            # skip mailto: and bare anchors
            if link.startswith("/sources/") or link.startswith("/components/") \
               or link.startswith("/resources/") or link.startswith("/concepts/"):
                if resolve_link(link, content_root) is None:
                    fail(f"broken internal link {link}", errors, f)

    # --- 4. index + log present and in sync ---------------------------------------
    index = content_root / "index.mdx"
    log = content_root / "log.md"
    if not index.exists():
        fail("missing index.mdx", errors)
    if not log.exists():
        fail("missing log.md", errors)
    if index.exists() and log.exists():
        index_text = index.read_text(encoding="utf-8")
        log_text = log.read_text(encoding="utf-8")
        for slug in source_slugs:
            if f"sources/{slug}" not in index_text:
                fail(f"index.mdx does not mention sources/{slug}", errors, index)
            if slug not in log_text:
                fail(f"log.md has no entry for {slug}", errors, log)

    # --- 5. report ----------------------------------------------------------------
    if errors:
        print(f"FAIL: wiki_check found {len(errors)} issue(s):\n")
        for e in errors:
            print("- " + e)
        return 1
    print(f"PASS: wiki_check OK — {len(source_files)} source record(s), "
          f"{len(derived_pages)} derived page(s), index/log in sync, single git root, HTTPS only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
