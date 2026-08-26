#!/usr/bin/env python3
import pathlib
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path(".").resolve()
SCAN_DIRS = [ROOT / "harness" / "src", ROOT / "harness" / "test"]
SCAN_FILES = [ROOT / "scripts" / "check_no_comments.py"]


def scan_text(text: str) -> list[int]:
    bad: list[int] = []
    i = 0
    n = len(text)
    line = 1
    in_sq = False
    in_dq = False
    in_bt = False
    in_line = False
    in_block = False
    escape = False
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if ch == "\n":
            line += 1
            in_line = False
            escape = False
            i += 1
            continue
        if in_line:
            i += 1
            continue
        if in_block:
            if ch == "*" and nxt == "/":
                in_block = False
                i += 2
                continue
            i += 1
            continue
        if in_sq or in_dq or in_bt:
            quote = "'" if in_sq else '"' if in_dq else "`"
            if escape:
                escape = False
                i += 1
                continue
            if ch == "\\":
                escape = True
                i += 1
                continue
            if ch == quote:
                in_sq = False
                in_dq = False
                in_bt = False
            i += 1
            continue
        if ch == "'":
            in_sq = True
            i += 1
            continue
        if ch == '"':
            in_dq = True
            i += 1
            continue
        if ch == "`":
            in_bt = True
            i += 1
            continue
        if ch == "/" and nxt == "/":
            bad.append(line)
            in_line = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            bad.append(line)
            in_block = True
            i += 2
            continue
        i += 1
    return bad


def scan_python(text: str) -> list[int]:
    bad: list[int] = []
    for index, raw in enumerate(text.splitlines(), start=1):
        if index == 1 and raw.startswith("#!"):
            continue
        in_sq = False
        in_dq = False
        escape = False
        i = 0
        while i < len(raw):
            ch = raw[i]
            if escape:
                escape = False
                i += 1
                continue
            if ch == "\\":
                escape = True
                i += 1
                continue
            if ch == "'" and not in_dq:
                in_sq = not in_sq
                i += 1
                continue
            if ch == '"' and not in_sq:
                in_dq = not in_dq
                i += 1
                continue
            if ch == "#" and not in_sq and not in_dq:
                bad.append(index)
                break
            i += 1
    return bad


def collect() -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for directory in SCAN_DIRS:
        if directory.is_dir():
            files.extend(sorted(directory.rglob("*.ts")))
    for path in SCAN_FILES:
        if path.is_file():
            files.append(path)
    return files


def main() -> int:
    failures = 0
    for path in collect():
        text = path.read_text(encoding="utf-8")
        lines = scan_python(text) if path.suffix == ".py" else scan_text(text)
        for line in lines:
            rel = path.relative_to(ROOT)
            print(f"{rel}:{line}: explanatory comment")
            failures += 1
    if failures:
        print(f"FAIL {failures}")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
