#!/usr/bin/env python3
"""Regenerate the color files from palette-data.js.

palette-data.js is the one place colors are defined. This script writes:

  * lcars/palette.css     --lcars-<name> variables, plus .t-<name> (text color)
                          and .c-<name> (piece color) classes, for every name
  * trek-padd.js          the NAMED color table between the palette markers

Usage:  python tools/build_palette.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "palette-data.js"
CSS = ROOT / "lcars" / "palette.css"
PADD = ROOT / "trek-padd.js"

COLOR_RE = re.compile(r'\["([a-z0-9-]+)",\s*"(#[0-9A-Fa-f]{6})"\]')
PICKS_RE = re.compile(r"const PICKS = \[(.*?)\];", re.S)
MARKER_RE = re.compile(r"(/\* palette:start \*/\n).*?(\n\s*/\* palette:end \*/)", re.S)


def read_colors(source: str) -> dict[str, str]:
    """Return {name: HEX} in first-seen order; a name may not mean two colors."""
    colors: dict[str, str] = {}
    for name, hex_ in COLOR_RE.findall(source):
        hex_ = hex_.upper()
        if colors.setdefault(name, hex_) != hex_:
            sys.exit(f"error: '{name}' is both {colors[name]} and {hex_}; rename one in {DATA.name}")
    if not colors:
        sys.exit(f"error: no colors found in {DATA}")
    return colors


def build_css(colors: dict[str, str], picks: list[str]) -> str:
    lines = [
        "/*",
        " * LCARS palette for TrekText: every color name, generated from palette-data.js",
        " * by tools/build_palette.py. Do not edit by hand.",
        " *",
        " *   --lcars-<name>   the color itself",
        " *   .t-<name>        text in that color (##{name} in labels)",
        " *   .c-<name>        a piece drawn in that color",
        " *",
        f" * Picks ({len(picks)}): {', '.join(picks)}",
        " */",
        ":root {",
        *(f"  --lcars-{name}: {hex_};" for name, hex_ in colors.items()),
        "  --lcars-bg: #000;",
        "}",
        "",
        *(f".t-{name} {{ color: var(--lcars-{name}); }}" for name in colors),
        "",
        *(f".c-{name} {{ --c: var(--lcars-{name}); }}" for name in colors),
        "",
    ]
    return "\n".join(lines)


def build_named(colors: dict[str, str]) -> str:
    entries = [f'"{name}": "{hex_}"' for name, hex_ in colors.items()]
    rows, row = [], ""
    for entry in entries:
        if row and len(row) + len(entry) > 100:
            rows.append(row.rstrip())
            row = ""
        row += entry + ", "
    rows.append(row.rstrip())
    body = "\n".join(f"    {r}" for r in rows)
    return f"  const NAMED = Object.freeze({{\n{body}\n  }});"


def main() -> None:
    source = DATA.read_text(encoding="utf-8")
    colors = read_colors(source)
    picks_match = PICKS_RE.search(source)
    picks = re.findall(r'"([a-z0-9-]+)"', picks_match.group(1)) if picks_match else []
    missing = [p for p in picks if p not in colors]
    if missing:
        sys.exit(f"error: picks not in the color list: {', '.join(missing)}")

    CSS.write_text(build_css(colors, picks), encoding="utf-8", newline="\n")

    padd = PADD.read_text(encoding="utf-8")
    if not MARKER_RE.search(padd):
        sys.exit(f"error: palette markers not found in {PADD.name}")
    padd = MARKER_RE.sub(lambda m: m.group(1) + build_named(colors) + m.group(2), padd, count=1)
    PADD.write_text(padd, encoding="utf-8", newline="\n")

    print(f"{len(colors)} color names ({len(set(colors.values()))} distinct colors), {len(picks)} picks")
    print(f"wrote {CSS.relative_to(ROOT)} and updated {PADD.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
