#!/usr/bin/env python3
"""Fail-closed validator for the UPM standalone LLM wiki (llm-wiki/).

Enforces Sol's acceptance rules on `llm-wiki/`:
  - raw records are canonical JSON, content-addressed: filename == SHA-256(bytes);
  - `--base <git-ref>` rejects modifying or deleting a record that existed at that ref
    (only new records, with a new hash/filename, may be added);
  - every record has the required identity/license/integrity fields, and a dynamic
    record (any kind not in STATIC_KINDS) carries a timezone-aware `retrievedAt`
    (an optional `etag` / `lastModified` may accompany it);
  - `raw/index.json` is anti-forgery: its keys are exactly the record-id set, each
    value is `raw/sources/<id>/<sha>.json`, and each record's `id` equals its parent
    directory name;
  - `wiki/index.md` + `wiki/log.md` exist and mention every source id;
  - every id has a derived `wiki/sources/<id>.md`;
  - every internal wiki link resolves to a real file under `wiki/`;
  - single git root; source URLs are HTTPS.

Exit 0 on all pass, 1 on any failure. Stdlib only.

Usage: python3 scripts/check_llm_wiki.py [repo_root] [--base <git-ref>]
"""

import datetime
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
# Sources pinned to a single immutable revision do not change; they do not need a
# timestamp-aware retrievedAt. Everything else (web page, doc index, service/announcement,
# vendor site, blog post, ...) is dynamic and must record when it was retrieved.
STATIC_KINDS = {"idea-gist", "source-repo", "package", "license", "api-spec",
                "spec", "manifest", "release"}
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


def is_tz_aware_iso(t: str) -> bool:
    """True if `t` is an ISO-8601 timestamp carrying an explicit timezone.

    Accepts 'Z' (UTC) or a numeric offset, with or without a colon (+09:00 / +0900).
    A trailing offset is the test for timezone-awareness; a naive string (no offset,
    no Z) fails. `fromisoformat` on some Python builds requires a colon, so the offset
    is normalized to +HH:MM before parsing.
    """
    t = t.strip()
    if t.endswith("Z"):
        return _parses_iso(t[:-1] + "+00:00")
    m = re.search(r"^(.*?)([+-]\d{2}):?(\d{2})$", t)
    if not m or m.group(1).strip() == "":
        return False
    return _parses_iso(m.group(1) + m.group(2) + ":" + m.group(3))


def _parses_iso(s: str) -> bool:
    try:
        datetime.datetime.fromisoformat(s)
        return True
    except ValueError:
        return False


def resolve_wiki_link(target: str) -> Optional[pathlib.Path]:
    """Resolve a wiki-internal link to a path under wiki/ (wiki-root-relative)."""
    t = target.strip().lstrip("/")
    if not t.endswith((".md", ".mdx")):
        t += ".md"
    candidate = WIKI / t
    return candidate if candidate.is_file() else None


def validate_record_file(path: pathlib.Path) -> None:
    stem = path.stem
    parent_id = path.parent.name
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

    # identity: record id must equal its parent directory name (anti-aliasing)
    if obj.get("id") != parent_id:
        err(f"record id '{obj.get('id')}' does not match its directory name '{parent_id}'",
            path)

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
    if "fetched" in obj and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(obj["fetched"])):
        err(f"fetched is not YYYY-MM-DD: {obj['fetched']!r}", path)

    # frozen vs dynamic: dynamic kinds need a timezone-aware retrievedAt
    kind = obj.get("kind", "")
    if kind not in STATIC_KINDS:
        ra = obj.get("retrievedAt")
        if not ra:
            err(f"dynamic record (kind '{kind}') is missing the timezone-aware"
                f" 'retrievedAt'", path)
        elif not isinstance(ra, str) or not is_tz_aware_iso(ra):
            err(f"record 'retrievedAt' is not a timezone-aware ISO-8601 timestamp: {ra!r}",
                path)
    else:
        if "retrievedAt" in obj and (not isinstance(obj["retrievedAt"], str)
                                     or not is_tz_aware_iso(obj["retrievedAt"])):
            err(f"record 'retrievedAt' is not a timezone-aware ISO-8601 timestamp: "
                f"{obj['retrievedAt']!r}", path)

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
    for p in nested:
        if p != REPO / ".git":
            err("nested git repository found", p)

    # --- 1. content-addressed records --------------------------------------------
    record_files = []
    if RAW_SOURCES.is_dir():
        record_files = sorted(RAW_SOURCES.rglob("*.json"))
        for path in record_files:
            validate_record_file(path)
        if not record_files:
            err("no raw records found under llm-wiki/raw/sources/")
    phys_ids = {p.parent.name for p in record_files}

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

    # --- 3. raw/index.json anti-forgery ------------------------------------------
    # index keys == record-id set exactly (no extra alias, no missing);
    # each value == raw/sources/<id>/<sha>.json; record id == parent dir == key.
    idx_path = LLM_WIKI / "raw" / "index.json"
    if not idx_path.exists():
        err("missing llm-wiki/raw/index.json")
    else:
        try:
            idx = json.loads(idx_path.read_text(encoding="utf-8"))
            recs = idx.get("records", {})
            if not isinstance(recs, dict):
                err("raw/index.json 'records' is not a mapping", idx_path)
                recs = {}
            idx_ids = set(recs.keys())
            for i in idx_ids - phys_ids:
                err(f"raw/index.json lists id '{i}' but no matching record directory/file "
                    f"exists under raw/sources/", idx_path)
            for i in phys_ids - idx_ids:
                err(f"record directory '{i}' exists under raw/sources/ but is missing "
                    f"from raw/index.json", idx_path)
            for i, rel in recs.items():
                d = RAW_SOURCES / i
                fl = sorted(d.glob("*.json")) if d.is_dir() else []
                actual = f"raw/sources/{i}/{fl[0].name}" if len(fl) == 1 else None
                if actual is None:
                    err(f"could not resolve a single record file for id '{i}'", idx_path)
                elif rel != actual:
                    err(f"raw/index.json path for '{i}' is '{rel}' but the record is "
                        f"'{actual}'", idx_path)
                elif i != d.name:
                    err(f"raw/index.json key '{i}' does not match its parent dir", idx_path)
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
    for i in sorted(phys_ids):
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
          f"index/log/source in sync, {len(phys_ids)} id(s) anti-forged, wiki links "
          f"resolve, single git root{note}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
