#!/usr/bin/env python3
"""Fail-closed validator for the UPM standalone LLM wiki (llm-wiki/).

Enforces Sol's acceptance rules on `llm-wiki/`:
  - raw records are canonical JSON, content-addressed: filename == SHA-256(bytes);
  - `--base <git-ref>` rejects modifying or deleting a record that existed at that ref
    (only new records, with a new hash/filename, may be added);
  - every record has the required identity/license/integrity fields;
  - `raw/index.json` maps every id to a path that exists;
  - `wiki/index.md` + `wiki/log.md` exist and mention every source id;
  - every id has a derived `wiki/sources/<id>.md`;
  - every internal wiki link resolves to a real file under `wiki/`;
  - single git root; source URLs are HTTPS.

Exit 0 on all pass, 1 on any failure. Stdlib only.

Usage: python3 scripts/check_llm_wiki.py [repo_root] [--base <git-ref>]
"""

import hashlib
import json
import pathlib
import re
import subprocess
import sys
from typing import List, Optional

REPO = pathlib.Path(".").resolve()
LLM_WIKI = REPO / "llm-wiki"
RAW_SOURCES = LLM_WIKI / "raw" / "sources"
WIKI = LLM_WIKI / "wiki"

REQUIRED = ("id", "kind", "name", "upstream", "reference", "license", "rights",
            "fetched", "integrity")
ERRORS: List[str] = []


def err(msg: str, path: Optional[pathlib.Path] = None) -> None:
    where = f"  {path.relative_to(REPO)}\n" if path else ""
    ERRORS.append(f"{msg}\n{where}")


def canon(obj) -> bytes:
    """Canonical form the record filenames are derived from.

    MUST match the writer: json.dumps(sort_keys=True, separators=(",",":"),
    ensure_ascii=False), UTF-8, no trailing newline.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(cmd: List[str]) -> bytes:
    return subprocess.check_output(["git"] + cmd, cwd=str(REPO)).rstrip(b"\n")


def git_file_at(ref: str, path: str) -> Optional[bytes]:
    try:
        return subprocess.check_output(["git", "show", f"{ref}:{path}"],
                                       cwd=str(REPO), stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        return None


def resolve_wiki_link(target: str) -> Optional[pathlib.Path]:
    """Resolve a wiki-internal link to a path under wiki/ (wiki-root-relative)."""
    t = target.strip()
    if not t.startswith("/"):
        # wiki-root-relative by convention: components/nimbus-docs.md
        pass
    else:
        t = t.lstrip("/")
    if not t.endswith((".md", ".mdx")):
        t += ".md"
    candidate = WIKI / t
    return candidate if candidate.is_file() else None


def validate_record_file(path: pathlib.Path) -> None:
    stem = path.stem
    if not re.fullmatch(r"[0-9a-f]{64}", stem):
        err(f"raw record filename is not a 64-hex SHA-256: {path.name}", path)
        return
    try:
        content = path.read_bytes()
    except OSError as e:
        err(f"cannot read record: {e}", path)
        return
    try:
        obj = json.loads(content)
    except json.JSONDecodeError as e:
        err(f"record is not valid JSON: {e}", path)
        return

    # content-addressed: filename == SHA-256 of canonical JSON bytes
    recomputed = canon(obj)
    if sha256(recomputed) != stem:
        err(f"filename mismatch: SHA-256(canonical bytes)={sha256(recomputed)} "
            f"but filename is {stem}", path)
    if recomputed != content:
        err("record is not stored in canonical (compact, sorted-key) form", path)

    # required fields
    for field in REQUIRED:
        if field not in obj:
            err(f"record missing required field '{field}'", path)
    integrity = obj.get("integrity", {})
    if not isinstance(integrity, dict) or "sha256" not in integrity:
        err("record integrity is missing 'sha256'", path)
    else:
        if not re.fullmatch(r"[0-9a-f]{64}", str(integrity["sha256"])):
            err(f"integrity.sha256 is not 64-hex: {integrity['sha256']!r}", path)
    if isinstance(integrity, dict) and "bytes" in integrity and \
            (not isinstance(integrity["bytes"], int) or integrity["bytes"] < 0):
        err("integrity.bytes must be a non-negative integer", path)

    # upstream + reference URLs are HTTPS
    ref_text = json.dumps(obj.get("reference", {}), ensure_ascii=False)
    for url in re.findall(r"https?://[^\s\"')>]+", obj.get("upstream", "") + " " + ref_text):
        if not url.startswith("https://"):
            err(f"non-HTTPS URL in record: {url}", path)


def main() -> int:
    global REPO, LLM_WIKI, RAW_SOURCES, WIKI
    args = list(sys.argv[1:])
    base_ref: Optional[str] = None
    if "--base" in args:
        i = args.index("--base")
        if i + 1 >= len(args):
            print("FAIL: --base requires a git ref.")
            return 1
        base_ref = args[i + 1]
        del args[i:i + 2]
    REPO = pathlib.Path(args[0] if args else ".").resolve()
    LLM_WIKI = REPO / "llm-wiki"
    RAW_SOURCES = LLM_WIKI / "raw" / "sources"
    WIKI = LLM_WIKI / "wiki"

    if not (REPO / ".git").exists():
        print(f"FAIL: {REPO} is not the repo root (no .git).")
        return 1
    if not RAW_SOURCES.is_dir():
        err("missing llm-wiki/raw/sources/")
    if not WIKI.is_dir():
        err("missing llm-wiki/wiki/")

    # --- 0. exactly one git root -------------------------------------------------
    nested = [p for p in REPO.rglob(".git") if p.is_dir()]
    nested_errors = [p for p in nested if p != REPO / ".git"]
    for p in nested_errors:
        err("nested git repository found", p)

    # --- 1. content-addressed records --------------------------------------------
    record_files = []
    ids = []
    if RAW_SOURCES.is_dir():
        record_files = sorted(RAW_SOURCES.rglob("*.json"))
        for path in record_files:
            validate_record_file(path)
        ids = sorted({p.parent.name for p in record_files})
        if not record_files:
            err("no raw records found under llm-wiki/raw/sources/")

    # --- 2. --base guard: reject modify/delete of records present at base --------
    if base_ref:
        try:
            base_listing = git(["ls-tree", "-r", "--name-only", base_ref,
                                "--", "llm-wiki/raw/sources"])
        except subprocess.CalledProcessError:
            print(f"FAIL: could not list {base_ref} (not a valid git ref?).")
            return 1
        base_paths = [p for p in base_listing.decode().splitlines() if p.endswith(".json")]
        for bpath in base_paths:
            rel = pathlib.Path(bpath)
            cur = REPO / rel
            if not cur.exists():
                err(f"record deleted since {base_ref}: {rel}", None)
                continue
            base_bytes = git_file_at(base_ref, bpath)
            cur_bytes = cur.read_bytes()
            # content-addressing ties name to bytes; a same-name file must be identical
            if base_bytes is not None and cur_bytes != base_bytes:
                err(f"record modified since {base_ref} (should be a new revision): {rel}", None)

    # --- 3. raw/index.json --------------------------------------------------------
    idx_path = LLM_WIKI / "raw" / "index.json"
    if not idx_path.exists():
        err("missing llm-wiki/raw/index.json")
    else:
        try:
            idx = json.loads(idx_path.read_text(encoding="utf-8"))
            recs = idx.get("records", {})
            for i in ids:
                if i not in recs:
                    err(f"raw/index.json does not list record id '{i}'", idx_path)
            for i, rel in recs.items():
                if not (LLM_WIKI / rel).exists():
                    err(f"raw/index.json points to missing record '{rel}'", idx_path)
        except (json.JSONDecodeError, AttributeError) as e:
            err(f"raw/index.json is not valid JSON/mapping: {e}", idx_path)

    # --- 4. index + log present, mention every source id ---------------------------
    index_md = WIKI / "index.md"
    log_md = WIKI / "log.md"
    if not index_md.exists():
        err("missing wiki/index.md")
    if not log_md.exists():
        err("missing wiki/log.md")
    index_text = index_md.read_text(encoding="utf-8") if index_md.exists() else ""
    log_text = log_md.read_text(encoding="utf-8") if log_md.exists() else ""
    for i in ids:
        if i not in index_text:
            err(f"wiki/index.md does not mention source id '{i}'", index_md)
        if i not in log_text:
            err(f"wiki/log.md has no entry for '{i}'", log_md)
        if not (WIKI / "sources" / f"{i}.md").exists():
            err(f"no derived wiki/sources/{i}.md for record id '{i}'")

    # --- 5. internal wiki links resolve -------------------------------------------
    if WIKI.is_dir():
        for md in WIKI.rglob("*.md"):
            text = md.read_text(encoding="utf-8")
            for target in set(re.findall(r"\]\(([^)]+)\)", text)):
                t = target.strip()
                if (t.startswith(("http://", "https://", "mailto:")) or t.startswith("#")
                        or not t):
                    continue
                if resolve_wiki_link(t) is None:
                    err(f"broken wiki link: [{target}]", md)

    # --- 6. report ----------------------------------------------------------------
    if ERRORS:
        print(f"FAIL: check_llm_wiki found {len(ERRORS)} issue(s):\n")
        for e in ERRORS:
            print("- " + e)
        return 1
    note = f", --base {base_ref} verified modify/delete unchanged" if base_ref else ""
    print(f"PASS: check_llm_wiki OK — {len(record_files)} content-addressed record(s), "
          f"index/log/source in sync, wiki links resolve, single git root{note}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
