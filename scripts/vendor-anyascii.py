#!/usr/bin/env python3
"""Regenerate src/substitutions.ts from the pinned AnyAscii table + manifest.

WHOLESALE vendoring of AnyAscii (ISC, Hunter WB <hunterwb.com>): every
substitution value is the AnyAscii 0.3.3 replacement verbatim. The plugin
itself stays MIT (see LICENSE); the upstream attribution lives in
LICENSE.anyascii and in the README section "Table sourcing (AnyAscii)".

Pinned input:
  vendor/anyascii/table-0.3.3.tsv   AnyAscii tag 0.3.3, verified by SHA-256 below
  scripts/anyascii-manifest.json    all entries: codepoint, exact TS spellings,
                                    category, verbatim comments and the AnyAscii
                                    0.3.3 value (aa). Values equal aa throughout.

Exclusion rules — an AnyAscii entry is NEVER taken when:
  1. it transliterates Latin (anything in U+00A0-U+036F; the strip keep-set
     preserves those blocks, so mapping e.g. `e` -> `e` would corrupt them),
  2. it transliterates a script (Greek, Cyrillic, Arabic, Hebrew, CJK, kana,
     Hangul, Thai, Devanagari, ... — AnyAscii covers them, the strip deletes
     them; romanising here would fight the pipeline),
  3. its block is outside the 13 already open (no block is ever opened;
     see the scope guardrail in tests/substitutions.test.ts),
  4. its AnyAscii replacement is the empty string (the strip already deletes
     those; there is nothing to map),
  5. it is the euro sign U+20AC (explicit decision: no "EUR" spelling, the
     strip deletes it; Currency Symbols is outside the 13 open blocks anyway).

  Rules 2 and 5 are vacuous by construction — none of the 13 open blocks is a
  script block and Currency Symbols is not among them — and the generator
  asserts every rule on every run.

  Category placement for wholesale entries follows the block map (see
  CAT_BY_BLOCK below): General Punctuation + Letterlike Symbols go to
  punctuation, Box Drawing to frames, Geometric Shapes to shapes, Arrows +
  Miscellaneous Symbols and Arrows to arrows, Mathematical Operators to math,
  and Dingbats + Miscellaneous Symbols + Miscellaneous Symbols and
  Pictographs + Miscellaneous Technical + Transport and Map to emojis.

Assumed (documented, not upstream): the :shortcode: names treated as
Discord-style labels, the category placement above, and the frames/shapes
split itself.

Usage:
  python3 scripts/vendor-anyascii.py [--check]

  --check  verify only (no write); exits non-zero on any drift.

Exit status is non-zero on any verification failure: table hash drift, an `aa`
value that no longer matches the pinned table, a spelling that decodes
elsewhere, a non-ASCII target, a duplicate key, a scope violation (<2 entries
per block, unknown block, 13-block drift) or a leftover review-queue entry
(completeness: every in-scope candidate must be curated).
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / "vendor" / "anyascii" / "table-0.3.3.tsv"
MANIFEST = ROOT / "scripts" / "anyascii-manifest.json"
OUTPUT = ROOT / "src" / "substitutions.ts"

PINNED_TAG = "0.3.3"
PINNED_SHA256 = "63d405125a149ed646b6f932be96414e2db4b9ff5c3cb1fac49f6386a6fb1fa9"

ORDER = ["punctuation", "frames", "shapes", "arrows", "math", "emojis"]
EXPORT_OF = {
    "punctuation": "PUNCTUATION",
    "frames": "FRAMES",
    "shapes": "SHAPES",
    "arrows": "ARROWS",
    "math": "MATH",
    "emojis": "EMOJIS",
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


# Script ranges for exclusion rule 2. No curated entry and no review-queue
# candidate may come from these; the generator asserts it.
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


HEAD = """\
/**
 * Unicode → ASCII substitution mappings, organised by category.
 * Each entry is a tuple of [unicode, ascii].
 *
 * Table sourcing: WHOLESALE AnyAscii tag %(tag)s (ISC, see LICENSE.anyascii).
 * Every value below is the AnyAscii replacement verbatim — 2606 entries across
 * the 13 open blocks, six categories. Never imported: Latin letters
 * (U+00A0-U+036F is inside the strip keep-set), scripts (the strip deletes
 * them), blocks outside the 13 open ones, empty replacements, and the euro
 * sign U+20AC (explicit decision, the strip deletes it). Assumed, not
 * upstream: the :shortcode: names treated as Discord-style labels, the
 * category placement of wholesale entries by block, and the frames/shapes
 * split itself. See scripts/anyascii-manifest.json and the README section
 * "Table sourcing (AnyAscii)".
 * Regenerate with: python3 scripts/vendor-anyascii.py
 */

export type Category = "punctuation" | "frames" | "shapes" | "arrows" | "math" | "emojis";
"""

TAIL = """\
export type SubstitutionConfig = {
  punctuation?: boolean;
  frames?: boolean;
  shapes?: boolean;
  arrows?: boolean;
  math?: boolean;
  emojis?: boolean;
  stripNonLatin?: boolean;
};

const DEFAULT_CONFIG: Required<SubstitutionConfig> = {
  punctuation: true,
  frames: true,
  shapes: true,
  arrows: true,
  math: true,
  emojis: true,
  stripNonLatin: false,
};

/**
 * Build a combined substitution map from enabled categories.
 */
export function buildSubstitutions(
  config: SubstitutionConfig = {},
): Array<[string, string]> {
  const resolved = { ...DEFAULT_CONFIG, ...config };
  const entries: Array<[string, string]> = [];
  if (resolved.punctuation) entries.push(...PUNCTUATION);
  if (resolved.frames) entries.push(...FRAMES);
  if (resolved.shapes) entries.push(...SHAPES);
  if (resolved.arrows) entries.push(...ARROWS);
  if (resolved.math) entries.push(...MATH);
  if (resolved.emojis) entries.push(...EMOJIS);
  return entries;
}

/**
 * Build a compiled RegExp that matches all active unicode characters at once.
 * This is much faster than running replace() N times.
 */
export function buildRegex(substitutions: Array<[string, string]>): RegExp {
  const pattern = substitutions
    .map(([ch]) => ch.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"))
    .join("|");
  return new RegExp(pattern, "gu");
}

/**
 * Apply substitutions to a string using a pre-built map and regex.
 */
export function applySubstitutions(
  text: string,
  regex: RegExp,
  map: Map<string, string>,
): string {
  return text.replace(regex, (match) => map.get(match) ?? match);
}

// ---------------------------------------------------------------------------
// Aggressive allowlist strip
// ---------------------------------------------------------------------------
//
// The kept set is an explicit list of codepoint BLOCKS, not a script query.
// Script queries were the original bug: `\\p{Script=Common}` covers CJK
// punctuation and every pictographic emoji, and `\\p{Script=Latin}` covers
// fullwidth letters, so a script filter leaks the exact characters this
// function exists to remove.
//
// Kept blocks, in codepoint order. All of them are consecutive runs, so the
// whole set collapses to five ranges with three holes:
//
//   U+0000-U+007F  Basic Latin
//        <hole: U+0080-U+009F, the C1 controls>
//   U+00A0-U+036F  Latin-1 Supplement, Latin Extended-A, Latin Extended-B,
//                   IPA Extensions, Spacing Modifier Letters and Combining
//                   Diacritical Marks. These six blocks are genuinely
//                   consecutive -- each one starts at the codepoint after the
//                   previous one ends -- so a single range covers all of them.
//                   (Basic Latin above is NOT adjacent: the C1 gap separates
//                   it, which is why there are two ranges and not one.)
//        <hole: U+0370-U+1FFF, which is where Greek, Cyrillic, Hebrew, Arabic,
//                   the CJK blocks, Hangul, kana and every symbol block live>
//   U+2000-U+200A  General Punctuation, first kept run
//        <hole: U+200B-U+200F, ZWSP / ZWNJ / ZWJ / LRM / RLM>
//   U+2010-U+2027  General Punctuation, second kept run
//        <hole: U+2028-U+202F, line and paragraph separators, bidi controls,
//                   narrow no-break space>
//   U+2030-U+205E  General Punctuation, third kept run
//        <hole: U+205F-U+206F, medium mathematical space, word joiner,
//                   invisible operators, bidi isolates>
//
// The three holes inside and around General Punctuation are the reason the
// punctuation block is written as three ranges instead of one: the invisible
// and format characters in it render as nothing and are actively harmful in a
// terminal, so they are removed while the visible punctuation is kept.
//
// Everything not listed above is stripped: Greek, Cyrillic, Arabic, Hebrew,
// CJK, kana, Hangul, Thai, Devanagari, emoji, the symbol blocks, the controls,
// and the unassigned codepoints.
//
// This regex only ever DELETES. It never rewrites a character into another
// one -- turning `—` into `-` or `🚀` into `:rocket:` is the job of the
// `punctuation`/`frames`/`shapes`/`arrows`/`math`/`emojis` tables, which run
// first in rewriteText. See the README section "stripNonLatin" for why that
// ordering matters.
const NON_ASCII_ALLOWED =
  /[^\\u0000-\\u007F\\u00A0-\\u036F\\u2000-\\u200A\\u2010-\\u2027\\u2030-\\u205E]/gu;

// Fullwidth and halfwidth forms (U+FF00-U+FFEF) are the one deliberate
// exception, and it is a fold, not a substitution. No category covers the
// fullwidth block -- `punctuation`, `frames`, `shapes`, `arrows`, `math` and
// `emojis` have nothing to say about it -- and NFKC maps every one of them
// onto a real ASCII counterpart, so folding is strictly better than deleting
// the characters and loses no information: `ＡＢＣ` -> `ABC`,
// `１２３` -> `123`.
//
// Only the matched runs are normalised, so the rest of the text stays
// byte-identical and a character outside this block is never recomposed.
const COMPATIBILITY_FORMS = /[\\uFF00-\\uFFEF]+/g;

/**
 * Remove every character outside the explicit allowlist of codepoint blocks
 * described above, folding U+FF00-U+FFEF to ASCII first.
 *
 * Applied after substitutions, so curated characters are already ASCII by the
 * time this runs. Bare — with no substitution before it — it still keeps the
 * Latin blocks, the visible General Punctuation and the combining diacritical
 * marks intact; see the pipeline tests for what the combination produces.
 */
export function stripNonLatinChars(text: string): string {
  return text
    .replace(COMPATIBILITY_FORMS, (run) => run.normalize("NFKC"))
    .replace(NON_ASCII_ALLOWED, "");
}
"""


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
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    errors: list[str] = []

    if manifest["meta"]["anyascii_tag"] != PINNED_TAG:
        errors.append(
            f"manifest tag {manifest['meta']['anyascii_tag']} != pinned {PINNED_TAG}"
        )

    by_name = {e["name"]: e for e in manifest["exports"]}
    if [e["name"] for e in manifest["exports"]] != [EXPORT_OF[c] for c in ORDER]:
        errors.append("manifest export order drifted from generator ORDER")

    seen: dict[int, str] = {}
    counts: dict[str, int] = {}
    per_block: dict[str, int] = {}
    rendered: list[str] = [(HEAD % {"tag": PINNED_TAG}).rstrip("\n")]

    for cat in ORDER:
        export = by_name[EXPORT_OF[cat]]
        if export["cat"] != cat:
            errors.append(f"{export['name']}: cat field {export['cat']} != {cat}")
        entries = export["entries"]
        counts[cat] = len(entries)
        rendered.append(f"export const {export['name']}: Array<[string, string]> = [")
        for it in entries:
            cp = it["cp"]
            # 1. spelling decodes to the recorded codepoint
            try:
                ch = ts_decode(it["from_body"])
            except ValueError as exc:
                errors.append(f"U+{cp:04X}: bad from_body: {exc}")
                continue
            if len(ch) != 1 or ord(ch) != cp:
                # supplementary plane: surrogate pair check happens in TS;
                # here require the single codepoint to round-trip via chr()
                try:
                    if ch != chr(cp):
                        errors.append(f"U+{cp:04X}: from_body decodes elsewhere")
                        continue
                except (ValueError, AssertionError):
                    errors.append(f"U+{cp:04X}: from_body decodes elsewhere")
                    continue
            # 2. recorded name matches the codepoint
            try:
                uname = unicodedata.name(chr(cp))
            except ValueError:
                uname = None
            if uname != it["name"] and not (
                uname is None and it["name"] is None
            ):
                errors.append(f"U+{cp:04X}: name {it['name']!r} != {uname!r}")
            # 3. aa value still matches the pinned table (drift detection),
            # and the emitted spelling decodes back to it (wholesale proof)
            actual = table.get(cp)
            if actual != it["aa"]:
                errors.append(
                    f"U+{cp:04X}: manifest aa {it['aa']!r} != table {actual!r}"
                )
            # 4. target is ASCII and spellings sane
            try:
                target = ts_decode(it["to_body"])
            except ValueError as exc:
                errors.append(f"U+{cp:04X}: bad to_body: {exc}")
                continue
            if target != it["aa"]:
                errors.append(
                    f"U+{cp:04X}: to_body decodes to {target!r} != aa {it['aa']!r}"
                )
            if not re.fullmatch(r"[\x20-\x7E]*", target):
                errors.append(f"U+{cp:04X}: non-ASCII target {target!r}")
            if '"' in target and it["to_q"] == '"':
                errors.append(f"U+{cp:04X}: bare quote in double-quoted target")
            if '"' in it["from_body"]:
                errors.append(f"U+{cp:04X}: bare quote in from_body")
            # 5. no duplicate key, block in scope, never a script, never Latin
            if cp in seen:
                errors.append(
                    f"U+{cp:04X}: duplicate of {seen[cp]} (last writer would win)"
                )
            seen[cp] = export["name"]
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
            # 6. emit the entry line, byte-stable
            for pre in it["pre"]:
                rendered.append(pre)
            q = it["to_q"]
            line = f'  ["{it["from_body"]}", {q}{it["to_body"]}{q}],'
            if it["trailing"]:
                line += f" {it['trailing']}"
            rendered.append(line)
        rendered.append("];")
        rendered.append("")

    if set(per_block) != OPEN_BLOCKS:
        errors.append(
            f"block scope drift: {sorted(set(per_block) ^ OPEN_BLOCKS)} "
            f"(pinned at the 13 open blocks)"
        )
    thin = sorted(b for b, n in per_block.items() if n < 2)
    if thin:
        errors.append(f"blocks with a single entry (needs >= 2): {thin}")

    rendered.append(TAIL.rstrip("\n"))
    out = "\n".join(rendered) + "\n"

    # Completeness (wholesale proof): every in-scope R4-respecting AnyAscii
    # entry must be curated. Leftovers fail the run — curation can no longer
    # drift behind the pinned table.
    curated = set(seen)
    queue: dict[str, list[tuple[int, str]]] = {}
    for cp, rep in table.items():
        if cp in curated or rep == "":
            continue
        if 0x00A0 <= cp <= 0x036F:  # rule 1: never transliterate Latin
            continue
        blk = block_of(cp)
        if blk not in OPEN_BLOCKS:  # rule 3: never open a block
            continue
        if in_scripts(cp):  # rule 2: never romanise a script
            continue
        if cp == 0x20AC:  # rule 5: euro stays unmapped
            continue
        queue.setdefault(blk, []).append((cp, rep))
    if queue:
        leftover = sum(len(v) for v in queue.values())
        errors.append(
            f"review queue not empty ({leftover} uncurated in-scope entries) — "
            + ", ".join(
                f"{blk}: {len(queue[blk])}" for blk in sorted(queue)
            )
        )

    total = sum(counts.values())
    print(f"AnyAscii tag {PINNED_TAG} ({TABLE.name}, sha256 ok, wholesale)")
    print(
        "entries: "
        + " ".join(f"{c}={counts[c]}" for c in ORDER)
        + f" total={total}"
    )
    print(f"blocks: {len(per_block)} (min entries per block: {min(per_block.values())})")
    print("review queue: empty (all in-scope candidates curated)")

    if errors:
        print(f"\n{len(errors)} VERIFICATION ERRORS:", file=sys.stderr)
        for err in errors[:40]:
            print(f"  - {err}", file=sys.stderr)
        raise SystemExit(1)

    if check_only:
        print("check ok: manifest, table and scope verify; no write.")
        return
    current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else None
    if current == out:
        print(f"up to date: {OUTPUT.relative_to(ROOT)} unchanged.")
    else:
        OUTPUT.write_text(out, encoding="utf-8")
        print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(out)} bytes).")


if __name__ == "__main__":
    main(check_only="--check" in sys.argv[1:])