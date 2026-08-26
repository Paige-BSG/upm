#!/usr/bin/env python3
"""Regression tests for check_llm_wiki.py — index anti-forgery + immutable-revision rules.

Each scenario runs in its own throwaway copy of llm-wiki/ (own git repo) so mutations
never cross-contaminate. The validator must:

  PASS on the pristine tree, and on an immutable revision update
      (old record retained, a new content-addressed record appended in the same id dir,
       index repointed to the new record);
  FAIL on
      A. extra alias      — index lists an id with no record directory/file;
      B. cross-id         — a record's `id` differs from its parent directory name;
      C. missing          — a real record directory is absent from index.json;
      E. delete-old       — with `--base`, deleting a record that existed at that ref;
      F. static-no-pin    — a static `kind` with no exact immutable pin and no retrievedAt.

All dynamic records must carry a timezone-aware `retrievedAt`; a record is frozen only
when it has a machine-verifiable exact pin (revision/commit/tag/version/digest/sha/ref).

Exit 0 if all assertions hold, else 1. Stdlib only (git must be on PATH).

Usage: python3 scripts/test_check_llm_wiki.py
"""

import hashlib
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


def canon(obj) -> bytes:
    """Exact canonical form the validator derives record filenames from."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_validator(root: pathlib.Path, extra: list = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(CHECK), str(root)] + (extra or []),
                          cwd=str(root), capture_output=True, text=True)


def expect_fail(root: pathlib.Path, needle: str, extra: list = None) -> None:
    r = run_validator(root, extra)
    if r.returncode == 0:
        failures.append(f"expected FAIL but validator PASSed (needle {needle!r})")
    elif needle and needle not in r.stdout + r.stderr:
        failures.append(f"FAIL did not mention {needle!r}:\n{r.stdout}\n{r.stderr}")


def expect_pass(root: pathlib.Path, extra: list = None) -> None:
    r = run_validator(root, extra)
    if r.returncode != 0:
        failures.append(f"expected PASS but validator FAILed:\n{r.stdout}\n{r.stderr}")


def make_copy() -> pathlib.Path:
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="llm-wiki-test-"))
    shutil.copytree(LLM_WIKI, tmp / "llm-wiki")
    subprocess.run(["git", "init", "-q", str(tmp)], check=True)
    return tmp


def git(root: pathlib.Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=str(root), check=True,
                          capture_output=True, text=True).stdout.strip()


def load_index(root: pathlib.Path) -> dict:
    return json.loads((root / "llm-wiki" / "raw" / "index.json").read_text(encoding="utf-8"))


def write_index(root: pathlib.Path, idx: dict) -> None:
    (root / "llm-wiki" / "raw" / "index.json").write_text(
        json.dumps(idx, sort_keys=True, ensure_ascii=False), encoding="utf-8")


def record_file(root: pathlib.Path, id_: str) -> pathlib.Path:
    return next((root / "llm-wiki" / "raw" / "sources" / id_).glob("*.json"))


def write_record(path: pathlib.Path, obj: dict) -> pathlib.Path:
    """Write `obj` as a canonical, content-addressed record; return its new path."""
    data = canon(obj)
    new_path = path.parent / (sha256(data) + ".json")
    new_path.write_bytes(data)
    return new_path


def scenario_pristine() -> None:
    root = make_copy()
    expect_pass(root)
    shutil.rmtree(root, ignore_errors=True)


def scenario_extra_alias() -> None:
    root = make_copy()
    idx = load_index(root)
    alias = dict(idx)
    alias["records"]["ghost-id"] = (
        "raw/sources/ghost-id/0000000000000000000000000000000000000000000000000000000000000000.json")
    write_index(root, alias)
    expect_fail(root, "ghost-id")
    shutil.rmtree(root, ignore_errors=True)


def scenario_cross_id() -> None:
    root = make_copy()
    rec = record_file(root, "nimbus-docs")
    original = rec.read_bytes()
    obj = json.loads(original)
    obj["id"] = "cross-id-renamed"
    write_record(rec, obj)
    expect_fail(root, "cross-id-renamed")
    rec.write_bytes(original)  # restore
    shutil.rmtree(root, ignore_errors=True)


def scenario_missing() -> None:
    root = make_copy()
    idx = load_index(root)
    dropped = {"schema": 1,
               "records": {k: v for k, v in idx["records"].items()
                           if k != "kubeblocks-openshift"}}
    write_index(root, dropped)
    expect_fail(root, "kubeblocks-openshift")
    shutil.rmtree(root, ignore_errors=True)


def scenario_revision_update_passes() -> None:
    """D. old record retained + new content-addressed record appended in the same id
    dir + index repointed to the new record => validator must PASS (1..N per id)."""
    root = make_copy()
    idx = load_index(root)
    old = record_file(root, "nimbus-docs")
    obj = json.loads(old.read_bytes())
    obj["retrievedAt"] = "2026-08-28T05:06:07+00:00"  # a slightly newer retrieval
    new = write_record(old, obj)                        # appends a distinct file
    idx["records"]["nimbus-docs"] = f"raw/sources/nimbus-docs/{new.name}"
    write_index(root, idx)
    # both records present in the dir, index points to the new one, delete-of-old-in-
    # place never happens => green with and without --base (old is untouched).
    expect_pass(root)
    shutil.rmtree(root, ignore_errors=True)


def scenario_delete_old_fails() -> None:
    """E. simulate a realistic revision update that REMOVES the old record — the
    --base guard must reject the deletion."""
    root = make_copy()
    git(root, "add", "-A")
    git(root, "commit", "-qm", "base")
    base = git(root, "rev-parse", "HEAD")
    idx = load_index(root)
    old = record_file(root, "nimbus-docs")
    obj = json.loads(old.read_bytes())
    obj["retrievedAt"] = "2026-08-29T07:08:09+00:00"
    new = write_record(old, obj)
    old.unlink()                                        # the forbidden delete
    idx["records"]["nimbus-docs"] = f"raw/sources/nimbus-docs/{new.name}"
    write_index(root, idx)
    expect_fail(root, "deleted", ["--base", base])
    shutil.rmtree(root, ignore_errors=True)


def scenario_static_no_pin_fails() -> None:
    """F. a static `kind` with no exact immutable pin and no retrievedAt must FAIL —
    frozen may not be claimed by kind; absence of a pin forces dynamic (needs
    retrievedAt)."""
    root = make_copy()
    idx = load_index(root)
    rec = record_file(root, "karpathy-llm-wiki")
    obj = json.loads(rec.read_bytes())
    obj["kind"] = "source-repo"
    obj["reference"] = dict(obj.get("reference", {}))
    obj["reference"].pop("revision", None)              # drop the exact pin
    new = write_record(rec, obj)
    rec.unlink()
    idx["records"]["karpathy-llm-wiki"] = f"raw/sources/karpathy-llm-wiki/{new.name}"
    write_index(root, idx)
    expect_fail(root, "retrievedAt")
    shutil.rmtree(root, ignore_errors=True)


def main() -> int:
    scenario_pristine()
    scenario_extra_alias()
    scenario_cross_id()
    scenario_missing()
    scenario_revision_update_passes()
    scenario_delete_old_fails()
    scenario_static_no_pin_fails()

    if failures:
        print("FAIL: test_check_llm_wiki had failures:")
        for f in failures:
            print(" -", f)
        return 1
    print("PASS: test_check_llm_wiki — pristine PASS; revision-update PASS; extra-alias, "
          "cross-id, missing, delete-old (--base), and static-no-pin each FAIL as expected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
