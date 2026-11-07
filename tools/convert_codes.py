#!/usr/bin/env python3
"""Convert TrekText files from the old ##x letter codes to ##{name} color codes.

The 2002 applet used single letters (##r, ##b, ...). TrekText now uses color
names, so ##b becomes ##{melrose}. Each changed file is rewritten in place and
the original is kept beside it as <file>.bak.

Usage:
  python tools/convert_codes.py trek.txt fiero.txt
  python tools/convert_codes.py /var/www/localhost/htdocs     # every .txt below a folder
  python tools/convert_codes.py --dry-run some/folder         # show what would change
"""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

# The applet's letters and the palette name each now maps to. ##o was
# orange-peel (#FF9966), which is no longer a pick, so it maps to sandy-brown.
LEGACY = {
    "r": "chestnut-rose",
    "o": "sandy-brown",
    "O": "atomic-tangerine",
    "y": "tanoi",
    "b": "melrose",
    "B": "blue-bell",
    "p": "lilac",
    "P": "hopbush",
}
CODE_RE = re.compile(r"##([roOybBpP])")


def convert(text: str) -> tuple[str, int]:
    """Return the converted text and how many codes were replaced."""
    return CODE_RE.subn(lambda m: "##{" + LEGACY[m.group(1)] + "}", text)


def files_in(paths: list[Path]) -> list[Path]:
    found: list[Path] = []
    for path in paths:
        if path.is_dir():
            found.extend(sorted(p for p in path.rglob("*.txt") if p.is_file()))
        elif path.is_file():
            found.append(path)
        else:
            print(f"skipped (not found): {path}")
    return found


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", type=Path, help="text files, or folders to search for .txt files")
    parser.add_argument("--dry-run", action="store_true", help="report changes without writing anything")
    args = parser.parse_args()

    changed = 0
    for path in files_in(args.paths):
        raw = path.read_bytes()
        text = raw.decode("utf-8", errors="surrogateescape")  # old files may be Latin-1; keep bytes intact
        new, count = convert(text)
        if not count:
            continue
        changed += 1
        print(f"{'would convert' if args.dry_run else 'converted'} {count:4d} codes in {path}")
        if not args.dry_run:
            shutil.copy2(path, path.with_name(path.name + ".bak"))
            path.write_bytes(new.encode("utf-8", errors="surrogateescape"))
    print(f"{changed} file(s) {'would change' if args.dry_run else 'changed'}")


if __name__ == "__main__":
    main()
