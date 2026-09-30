#!/usr/bin/env python3
"""Validate src/substitutions.ts against the vendored AnyAscii subset.

WHOLESALE vendoring of AnyAscii (ISC, Hunter WB <hunterwb.com>): every
substitution value is the AnyAscii 0.3.3 replacement verbatim. The plugin
itself stays MIT (see LICENSE); the upstream attribution lives in
LICENSE.anyascii and in the README section "Table sourcing (AnyAscii)".

Pinned input:
  vendor/anyascii/table-0.3.3-subset.tsv   the 2606 mapped rows of AnyAscii
      tag 0.3.3, verified by SHA-256 below. This file is the vendored
      reference: --check recoups every table value against it.

Provenance, recorded (not verified — the file is not checked in):
  AnyAscii tag 0.3.3, full table 123799 rows, SHA-256 pinned in
  FULL_TABLE_SHA256 below. The subset holds exactly the mapped rows.

Exclusion rules — a table entry is NEVER accepted when:
  1. it transliterates Latin (anything in U+00A0-U+036F; mapping e.g.
     `e` -> `e` would corrupt accented text),
  2. it transliterates a script (Greek, Cyrillic, Arabic, Hebrew, CJK, kana,
     Hangul, Thai, Devanagari, ... — never romanised here),
  3. its block is outside the 13 already open (no block is ever opened;
     see the scope guardrail in tests/substitutions.test.ts),
  4. its AnyAscii replacement is the empty string (there is nothing to map),
  5. it is the euro sign U+20AC (explicit decision: no "EUR" spelling).

  Rules 2 and 5 are vacuous by construction — none of the 13 open blocks is a
  script block and Currency Symbols is not among them — and this script
  asserts every rule on every run.

  Category placement is pinned by count only (see PINNED_COUNTS): General
  Punctuation + Letterlike Symbols in punctuation, Box Drawing in frames,
  Geometric Shapes in shapes, Arrows + Miscellaneous Symbols and Arrows in
  arrows, Mathematical Operators in math, and Dingbats + Miscellaneous
  Symbols + Miscellaneous Symbols and Pictographs + Miscellaneous Technical
  + Transport and Map in emojis.

Assumed (documented, not upstream): the :shortcode: names treated as
Discord-style labels, the category placement above, and the frames/shapes
split itself.

Usage:
  python3 scripts/vendor-anyascii.py [--check]

  --check  verify only (no write); exits non-zero on any drift.
  Without --check, drifted values are re-synced from the subset in place:
  entry order, spellings of keys, comments and quoting style are preserved
  and only the replacement strings change. A sync still exits non-zero if
  structural errors (duplicates, scope violations, undecodable spellings)
  are found.

Exit status is non-zero on any verification failure: subset hash drift, a
per-category count drift, a spelling that decodes elsewhere, a non-ASCII
target, a duplicate key, a scope violation (<2 entries per block, unknown
block, 13-block drift), a Latin letter or script entry, the euro sign, a
table value that differs from the subset row, or a subset row missing from
the tables (completeness: every subset row must be curated).
"""

from __future__ import annotations

import hashlib
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / "vendor" / "anyascii" / "table-0.3.3-subset.tsv"
OUTPUT = ROOT / "src" / "substitutions.ts"

PINNED_TAG = "0.3.3"
PINNED_SHA256 = "83f1839402c7fedffc54758b4975a76b2fffa006990254e4e24e8a509e3aef88"
FULL_TABLE_SHA256 = "63d405125a149ed646b6f932be96414e2db4b9ff5c3cb1fac49f6386a6fb1fa9"
FULL_TABLE_ROWS = 123799

ORDER = ["punctuation", "frames", "shapes", "arrows", "math", "emojis"]
EXPORT_OF = {
    "punctuation": "PUNCTUATION",
    "frames": "FRAMES",
    "shapes": "SHAPES",
    "arrows": "ARROWS",
    "math": "MATH",
    "emojis": "EMOJIS",
}
PINNED_COUNTS = {
    "punctuation": 172,
    "frames": 128,
    "shapes": 89,
    "arrows": 377,
    "math": 260,
    "emojis": 1580,
}

# The 13 open blocks. Nothing outside this set may appear in the tables.
OPEN_BLOCKS = {
    "Arrows",
    "Box Drawing",
    "Dingbats",
    "General Punctuation",
    "Geometric Shapes",
    "Latin-1 Supplement",
    "Letterlike Symbols",
    "Mathematical Operators",
    "Miscellaneous Symbols",
    "Miscellaneous Symbols and Arrows",
    "Miscellaneous Symbols and Pictographs",
    "Miscellaneous Technical",
    "Transport and Map",
}

UNICODE_BLOCKS = [
    (0x0000, 0x007F, "Basic Latin"),
    (0x0080, 0x00FF, "Latin-1 Supplement"),
    (0x0100, 0x017F, "Latin Extended-A"),
    (0x0180, 0x024F, "Latin Extended-B"),
    (0x0250, 0x02AF, "IPA Extensions"),
    (0x02B0, 0x02FF, "Spacing Modifier Letters"),
    (0x0300, 0x036F, "Combining Diacritical Marks"),
    (0x0370, 0x03FF, "Greek and Coptic"),
    (0x0400, 0x04FF, "Cyrillic"),
    (0x0590, 0x05FF, "Hebrew"),
    (0x0600, 0x06FF, "Arabic"),
    (0x2000, 0x206F, "General Punctuation"),
    (0x2070, 0x209F, "Superscripts and Subscripts"),
    (0x20A0, 0x20CF, "Currency Symbols"),
    (0x20D0, 0x20FF, "Combining Diacritical Marks for Symbols"),
    (0x2100, 0x214F, "Letterlike Symbols"),
    (0x2150, 0x218F, "Number Forms"),
    (0x2190, 0x21FF, "Arrows"),
    (0x2200, 0x22FF, "Mathematical Operators"),
    (0x2300, 0x23FF, "Miscellaneous Technical"),
    (0x2400, 0x243F, "Control Pictures"),
    (0x2440, 0x245F, "Optical Character Recognition"),
    (0x2460, 0x24FF, "Enclosed Alphanumerics"),
    (0x2500, 0x257F, "Box Drawing"),
    (0x2580, 0x259F, "Block Elements"),
    (0x25A0, 0x25FF, "Geometric Shapes"),
    (0x2600, 0x26FF, "Miscellaneous Symbols"),
    (0x2700, 0x27BF, "Dingbats"),
    (0x27C0, 0x27EF, "Miscellaneous Math Symbols-A"),
    (0x27F0, 0x27FF, "Supplemental Arrows-A"),
    (0x2800, 0x28FF, "Braille Patterns"),
    (0x2900, 0x297F, "Supplemental Arrows-B"),
    (0x2980, 0x29FF, "Miscellaneous Math Symbols-B"),
    (0x2A00, 0x2AFF, "Supplemental Math Operators"),
    (0x2B00, 0x2BFF, "Miscellaneous Symbols and Arrows"),
    (0x1F000, 0x1F02F, "Mahjong Tiles"),
    (0x1F0A0, 0x1F0FF, "Playing Cards"),
    (0x1F100, 0x1F1FF, "Enclosed Alphanumeric Supplement"),
    (0x1F200, 0x1F2FF, "Enclosed Ideographic Supplement"),
    (0x1F300, 0x1F5FF, "Miscellaneous Symbols and Pictographs"),
    (0x1F600, 0x1F64F, "Emoticons"),
    (0x1F650, 0x1F67F, "Ornamental Dingbats"),
    (0x1F680, 0x1F6FF, "Transport and Map"),
    (0x1F700, 0x1F77F, "Alchemical Symbols"),
    (0x1F780, 0x1F7FF, "Geometric Shapes Extended"),
    (0x1F800, 0x1F8FF, "Supplemental Arrows-C"),
    (0x1F900, 0x1F9FF, "Supplemental Symbols and Pictographs"),
    (0x1FA00, 0x1FA6F, "Chess Symbols"),
    (0x1FA70, 0x1FAFF, "Symbols and Pictographs Extended-A"),
]


def block_of(cp: int) -> str:
    for lo, hi, name in UNICODE_BLOCKS:
        if lo <= cp <= hi:
            return name
    return f"unlisted (U+{cp:04X})"


# Script ranges for exclusion rule 2. No table entry may come from these;
# the check below asserts it on every run.
SCRIPT_RANGES = [
    (0x0370, 0x03FF, "Greek and Coptic"),
    (0x0400, 0x04FF, "Cyrillic"),
    (0x0500, 0x052F, "Cyrillic Supplement"),
    (0x0590, 0x05FF, "Hebrew"),
    (0x0600, 0x06FF, "Arabic"),
    (0x0900, 0x097F, "Devanagari"),
    (0x0E00, 0x0E7F, "Thai"),
    (0x3040, 0x309F, "Hiragana"),
    (0x30A0, 0x30FF, "Katakana"),
    (0x3100, 0x312F, "Bopomofo"),
    (0x3130, 0x318F, "Hangul Compatibility Jamo"),
    (0x3400, 0x4DBF, "CJK Extension A"),
    (0x4E00, 0x9FFF, "CJK Unified"),
    (0xAC00, 0xD7AF, "Hangul Syllables"),
    (0x20000, 0x2A6DF, "CJK Extension B"),
]


def in_scripts(cp: int) -> bool:
    return any(lo <= cp <= hi for lo, hi, _ in SCRIPT_RANGES)


def ts_decode(body: str) -> str:
    """Decode a TS string-literal body (no surrounding quotes)."""
    out: list[str] = []
    i = 0
    while i < len(body):
        c = body[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        n = body[i + 1]
        if n == "u":
            if body[i + 2] == "{":
                j = body.index("}", i + 3)
                out.append(chr(int(body[i + 3 : j], 16)))
                i = j + 1
            else:
                out.append(chr(int(body[i + 2 : i + 6], 16)))
                i += 6
        elif n == "n":
            out.append("\n")
            i += 2
        elif n == "t":
            out.append("\t")
            i += 2
        elif n in "\\\"'":
            out.append(n)
            i += 2
        else:
            raise ValueError(f"unknown escape \\{n} in {body!r}")
    return "".join(out)


def ts_encode(value: str, quote: str) -> str:
    """Encode an ASCII value as a TS string-literal body for the given quote."""
    body = value.replace("\\", "\\\\")
    if quote == '"':
        body = body.replace('"', '\\"')
    else:
        body = body.replace("'", "\\'")
    return body


def split_entry_value(rest: str) -> tuple[str, str, str]:
    """Split `"<to>"... ],<trailing>` into (quote, to_body, trailing).

    `rest` starts just after `["<from>", `.
    """
    q = rest[0]
    if q not in "\"'":
        raise ValueError(f"entry value does not start with a quote: {rest!r}")
    i = 1
    while True:
        j = rest.index(q, i)
        # A quote preceded by an odd run of backslashes is escaped.
        k, run = j - 1, 0
        while k >= i and rest[k] == "\\":
            run += 1
            k -= 1
        if run % 2 == 0:
            break
        i = j + 1
    to_body = rest[1:j]
    tail = rest[j + 1 :]
    if not tail.startswith("],"):
        raise ValueError(f"entry value not followed by '],': {rest!r}")
    return q, to_body, tail[2:]


def load_table() -> dict[int, str]:
    raw = TABLE.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != PINNED_SHA256:
        raise SystemExit(
            f"table hash drift: {TABLE} is {digest}, pinned {PINNED_SHA256} "
            f"(AnyAscii tag {PINNED_TAG}). Re-pin deliberately, never silently."
        )
    table: dict[int, str] = {}
    for line in raw.decode("utf-8").split("\n"):
        if not line:
            continue
        parts = line.split("\t")
        table[ord(parts[0])] = parts[1] if len(parts) > 1 else ""
    return table


def main(check_only: bool) -> None:
    table = load_table()
    errors: list[str] = []

    text = OUTPUT.read_text(encoding="utf-8")
    lines = text.split("\n")

    found_exports = re.findall(r"^export const (\w+):", text, re.M)
    if found_exports != [EXPORT_OF[c] for c in ORDER]:
        errors.append(
            f"export order drifted: {found_exports} != "
            f"{[EXPORT_OF[c] for c in ORDER]}"
        )

    seen: dict[int, str] = {}
    counts: dict[str, int] = {}
    per_block: dict[str, int] = {}
    out_lines = list(lines)
    synced = 0

    for cat in ORDER:
        name = EXPORT_OF[cat]
        start = next(
            i for i, l in enumerate(lines)
            if l == f"export const {name}: Array<[string, string]> = ["
        )
        end = next(i for i in range(start, len(lines)) if lines[i] == "];")
        n = 0
        for idx in range(start + 1, end):
            line = lines[idx]
            if not line.startswith('  ["'):
                if line.strip() not in ("",) and not line.startswith("  //"):
                    errors.append(f"{name}: unparsed line {idx + 1}: {line!r}")
                continue
            m = re.match(r'^  \["((?:\\.|[^"\\])*)", (.*)$', line)
            if not m:
                errors.append(f"{name}: unparsed entry line {idx + 1}: {line!r}")
                continue
            from_body, rest = m.group(1), m.group(2)
            # 1. key spelling decodes to a single codepoint
            try:
                ch = ts_decode(from_body)
            except ValueError as exc:
                errors.append(f"{name}:{idx + 1}: bad from_body: {exc}")
                continue
            if len(ch) != 1:
                errors.append(
                    f"{name}:{idx + 1}: from_body is not one character"
                )
                continue
            cp = ord(ch)
            if '"' in from_body:
                errors.append(f"U+{cp:04X}: bare quote in from_body")
            # 2. value spelling decodes to ASCII, quoting sane
            try:
                q, to_body, trailing = split_entry_value(rest)
            except ValueError as exc:
                errors.append(f"{name}:{idx + 1}: {exc}")
                continue
            try:
                target = ts_decode(to_body)
            except ValueError as exc:
                errors.append(f"U+{cp:04X}: bad to_body: {exc}")
                continue
            if not re.fullmatch(r"[\x20-\x7E]*", target):
                errors.append(f"U+{cp:04X}: non-ASCII target {target!r}")
            if '"' in target and q == '"':
                errors.append(f"U+{cp:04X}: bare quote in double-quoted target")
            # 3. wholesale proof: the value equals the subset row verbatim
            actual = table.get(cp)
            if actual is None:
                errors.append(f"U+{cp:04X}: no row in {TABLE.name}")
            elif target != actual:
                if check_only:
                    errors.append(
                        f"U+{cp:04X}: table value {target!r} != "
                        f"subset {actual!r}"
                    )
                else:
                    nq = "'" if '"' in actual and "'" not in actual else '"'
                    new_line = (
                        f'  ["{from_body}", {nq}{ts_encode(actual, nq)}{nq}],'
                        + trailing
                    )
                    out_lines[idx] = new_line
                    synced += 1
                    target = actual
            # 4. no duplicate key, block in scope, never a script, never Latin
            if cp in seen:
                errors.append(
                    f"U+{cp:04X}: duplicate of {seen[cp]} (last writer would win)"
                )
            seen[cp] = name
            blk = block_of(cp)
            per_block[blk] = per_block.get(blk, 0) + 1
            if blk not in OPEN_BLOCKS:
                errors.append(f"U+{cp:04X}: opens a new block ({blk})")
            if in_scripts(cp):
                errors.append(f"U+{cp:04X}: transliterates a script ({blk})")
            if 0x00A0 <= cp <= 0x036F and unicodedata.category(chr(cp)).startswith("L"):
                errors.append(f"U+{cp:04X}: transliterates a Latin letter")
            if cp == 0x20AC:
                errors.append("U+20AC: euro sign must stay unmapped")
            n += 1
        counts[cat] = n
        if n != PINNED_COUNTS[cat]:
            errors.append(
                f"{name}: {n} entries != pinned {PINNED_COUNTS[cat]}"
            )

    if set(per_block) != OPEN_BLOCKS:
        errors.append(
            f"block scope drift: {sorted(set(per_block) ^ OPEN_BLOCKS)} "
            f"(pinned at the 13 open blocks)"
        )
    thin = sorted(b for b, n in per_block.items() if n < 2)
    if thin:
        errors.append(f"blocks with a single entry (needs >= 2): {thin}")

    # Completeness (wholesale proof): every subset row must be curated.
    # Leftovers fail the run — curation can no longer drift behind the
    # pinned subset.
    missing = sorted(cp for cp in table if cp not in seen)
    if missing:
        errors.append(
            f"subset rows missing from the tables ({len(missing)}): "
            + ", ".join(f"U+{cp:04X}" for cp in missing[:20])
        )

    total = sum(counts.values())
    print(f"AnyAscii tag {PINNED_TAG} ({TABLE.name}, sha256 ok, wholesale)")
    print(
        "entries: "
        + " ".join(f"{c}={counts[c]}" for c in ORDER)
        + f" total={total}"
    )
    print(f"blocks: {len(per_block)} (min entries per block: {min(per_block.values())})")
    print("subset rows curated: "
          f"{len(table) - len(missing)}/{len(table)}")

    if errors:
        print(f"\n{len(errors)} VERIFICATION ERRORS:", file=sys.stderr)
        for err in errors[:40]:
            print(f"  - {err}", file=sys.stderr)
        raise SystemExit(1)

    if check_only:
        print("check ok: tables, subset and scope verify; no write.")
        return
    current = OUTPUT.read_text(encoding="utf-8")
    new_text = "\n".join(out_lines)
    if current == new_text:
        print(f"up to date: {OUTPUT.relative_to(ROOT)} unchanged.")
    else:
        OUTPUT.write_text(new_text, encoding="utf-8")
        print(f"synced {synced} value(s) in {OUTPUT.relative_to(ROOT)}.")


if __name__ == "__main__":
    main(check_only="--check" in sys.argv[1:])
