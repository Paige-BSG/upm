#!/usr/bin/env python3
"""Negative tests for check_llm_wiki.py — the raw/index.json anti-forgery rules.

Builds a throwaway copy of llm-wiki/ in a temp git repo, then asserts the validator
FAILS on each of the three index misfits and PASSES on the pristine tree:

  A. extra alias    — index.json lists an id with no record directory/file;
  B. cross-id       — a record's `id` field differs from its parent directory name;
  C. missing        — a real record directory is absent from index.json.

Exit 0 if all assertions hold, 1 otherwise. Stdlib only (git must be on PATH).

Usage: python3 scripts/test_check_llm_wiki.py
"""

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parent.parent
CHECK = REPO / "scripts" / "check_llm_wiki.py"
LLM_WIKI = REPO / "llm-wiki"

failures: list = []


def run_validator(root: pathlib.Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(CHECK), str(root)],
                          cwd=str(root), capture_output=True, text=True)


def expect_fail(root: pathlib.Path, needle: str) -> None:
    r = run_validator(root)
    if r.returncode == 0:
        failures.append(f"expected FAIL but validator PASSed (needle {needle!r})")
    elif needle and needle not in r.stdout + r.stderr:
        failures.append(f"FAIL did not mention {needle!r}:\n{r.stdout}\n{r.stderr}")


def expect_pass(root: pathlib.Path) -> None:
    r = run_validator(root)
    if r.returncode != 0:
        failures.append(f"expected PASS but validator FAILed:\n{r.stdout}\n{r.stderr}")


def make_copy() -> pathlib.Path:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="llm-wiki-test-"))
    shutil.copytree(LLM_WIKI, tmp / "llm-wiki")
    subprocess.run(["git", "init", "-q", str(tmp)], check=True)
    return tmp


def load_index(root: pathlib.Path) -> dict:
    return json.loads((root / "llm-wiki" / "raw" / "index.json").read_text(encoding="utf-8"))


def write_index(root: pathlib.Path, idx: dict) -> None:
    (root / "llm-wiki" / "raw" / "index.json").write_text(
        json.dumps(idx, sort_keys=True), encoding="utf-8")


def record_file(root: pathlib.Path, id_: str) -> pathlib.Path:
    d = root / "llm-wiki" / "raw" / "sources" / id_
    return next(d.glob("*.json"))


def main() -> int:
    # --- positive control: pristine tree passes ----------------------------------
    root = make_copy()
    expect_pass(root)
    idx = load_index(root)

    # A. extra alias: an id that resolves to no record directory ------------------
    alias = dict(idx)
    alias["records"]["ghost-id"] = (
        "raw/sources/ghost-id/0000000000000000000000000000000000000000000000000000000000000000.json")
    write_index(root, alias)
    expect_fail(root, "ghost-id")
    write_index(root, idx)

    # B. cross-id: a record id differs from its parent directory name -------------
    rec = record_file(root, "nimbus-docs")
    original = rec.read_bytes()
    obj = json.loads(original)
    obj["id"] = "cross-id-renamed"
    rec.write_text(json.dumps(obj, sort_keys=True), encoding="utf-8")
    expect_fail(root, "cross-id-renamed")
    rec.write_bytes(original)
    write_index(root, idx)

    # C. missing: a real record directory is absent from index.json ----------------
    dropped = {"schema": 1,
               "records": {k: v for k, v in idx["records"].items()
                           if k != "kubeblocks-openshift"}}
    write_index(root, dropped)
    expect_fail(root, "kubeblocks-openshift")

    if failures:
        print("FAIL: test_check_llm_wiki had failures:")
        for f in failures:
            print(" -", f)
        return 1
    print("PASS: test_check_llm_wiki — pristine tree passes; extra-alias, cross-id, and "
          "missing-record each fail as expected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
