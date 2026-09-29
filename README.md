# opencode-ascii

An [OpenCode](https://opencode.ai) plugin that automatically substitutes unicode characters with ASCII-safe equivalents in AI responses and file edits.

## Why?

LLMs love to reach for typographic characters — em-dashes, curly quotes, arrows, emoji — that look great in a browser but cause friction in terminals, code, config files, and plain-text tooling. Tool output has the same problem, and harder: `cat`-ing a file, `ls`-ing a directory or `grep`-ping a repo surfaces whatever the project contains, with no model involved to substitute anything. This plugin intercepts output at three points:

- **AI text responses** (`experimental.text.complete`) — rewrites text parts before they are stored.
- **File write/edit tool calls** (`tool.execute.before`) — rewrites `write` and `edit` tool arguments before execution. `apply_patch` is deliberately left alone; see [apply_patch is not rewritten](#apply_patch-is-not-rewritten).
- **Tool results** (`tool.execute.after`) — rewrites the rendered title and body of any tool result, `bash` / `read` / `grep` / `webfetch` / MCP alike.

## Installation

Add the package to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-ascii"]
}
```

OpenCode will install the package automatically via Bun at startup.

## Configuration

All six substitution categories are **enabled by default**. Disable any category by passing options:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["opencode-ascii", {
      "punctuation": true,
      "frames": true,
      "shapes": true,
      "arrows": true,
      "math": true,
      "emojis": false
    }]
  ]
}
```

| Option        | Type    | Default | Description                                  |
|---------------|---------|---------|----------------------------------------------|
| `punctuation` | boolean | `true`  | Em/en dashes, ellipsis, curly/smart quotes   |
| `frames`      | boolean | `true`  | Box-drawing frames `┌─┐` → `+-+`, `─` → `-` |
| `shapes`      | boolean | `true`  | Geometric shapes `●` → `*`, `■` → `#`      |
| `arrows`      | boolean | `true`  | `→` → `>`, `←` → `<`, `↔` → `:left_right_arrow:`, etc. |
| `math`        | boolean | `true`  | `≠` → `=`, `≤` → `<=`, `×` → `*`, etc.   |
| `emojis`      | boolean | `true`  | Emoji → `:shortcode:` labels (Discord-style; 1580 entries) |
| `stripNonLatin` | boolean | `false` | Strip non-Latin-script characters from AI text responses and tool results (never from files) |

### stripNonLatin

`stripNonLatin` is **opt-in** and applies to **AI text responses and tool
results**. It is never applied to `write` or `edit` tool arguments, and
`apply_patch` is not rewritten at all.

Within an AI text part or a tool result it runs as a second pass, *after* the
substitutions above:

```
substitute (punctuation/frames/shapes/arrows/math/emojis)  ->  NFKC-fold U+FF00-U+FFEF  ->  strip everything outside the allowlisted blocks
```

**That order is load-bearing.** The strip **only ever deletes** — it never
rewrites a character into another one. Turning `—` into `-` or `🚀` into
`:rocket:` is the sole job of the six tables, which run first. So in the real pipeline the em dash is already `-` and
the mapped emoji is already an ASCII `:shortcode:` by the time the strip sees
the text, and nothing the tables produce can be caught by it. Only what
substitution did not recognise reaches the strip.

#### What it keeps

An explicit allowlist of **codepoint blocks** — not a script query. Script
queries were the original bug: `\p{Script=Common}` covers CJK punctuation and
every pictographic emoji, and `\p{Script=Latin}` covers fullwidth letters, so a
script filter leaked exactly the characters this feature exists to remove.

| # | Kept block                    | Range          | Examples                          |
|---|-------------------------------|----------------|-----------------------------------|
| 1 | Basic Latin                   | U+0000-U+007F  | `a` `~` space, digits             |
| 2 | Latin-1 Supplement            | U+00A0-U+00FF  | `é` `ç` `ñ` `ø` `ß` `«»` `±` `×` `÷` |
| 3 | Latin Extended-A              | U+0100-U+017F  | `ł` `č` `š` `ž` `ā` `Ł` `œ` `Ă`  |
| 4 | Latin Extended-B              | U+0180-U+024F  | `Ș` `Ő` `ș` `ț` `Ț`              |
| 5 | IPA Extensions                | U+0250-U+02AF  | `ə` `ɛ` `ɔ` `ŋ` `ʁ` `ʃ` `ʔ`      |
| 6 | Spacing Modifier Letters      | U+02B0-U+02FF  | `ʰ` `ʷ` `ʻ` `ˈ` `ˌ` `ː` `ˆ`      |
| 7 | Combining Diacritical Marks   | U+0300-U+036F  | U+0300-U+036F (combining accents) |
| 8 | General Punctuation (1 of 3)  | U+2000-U+200A  | en/em spaces                      |
| 9 | General Punctuation (2 of 3)  | U+2010-U+2027  | `—` `–` `…` `“”` `‘’` `•` `′` `″` `†` `‹›` `‰` |
|10 | General Punctuation (3 of 3)  | U+2030-U+205E  | `⁃`                               |

**Blocks 2 to 7 are consecutive, so they collapse into a single range
U+00A0-U+036F** — each block starts at exactly the codepoint after the previous
one ends. Basic Latin is *not* adjacent to them (the C1 gap separates it), so
the allowlist is five ranges, not one, with exactly three holes.

#### The two exclusions

The only holes in that set:

- **U+0080-U+009F — the C1 controls**, the gap between Basic Latin and the
  Latin blocks. U+0085 NEL is the one that used to corrupt terminal output.
- **Three runs inside General Punctuation**, so the U+2000-U+206F block is
  written as three ranges rather than one. The invisible and format characters
  render as nothing and are actively harmful in a terminal:
  - U+200B-U+200F — ZWSP, ZWNJ, ZWJ, LRM, RLM
  - U+2028-U+202F — line and paragraph separators, bidi controls, narrow NBSP
  - U+205F-U+206F — medium mathematical space, word joiner, invisible
    operators, bidi isolates

Everything else is deleted.

#### What it removes

- **Every other script** — Greek, Cyrillic, Arabic, Hebrew, CJK, kana, Hangul,
  Thai, Devanagari, … Greek and Coptic starts at U+0370, immediately above the
  last kept Latin block.
- **The C1 controls** U+0080-U+009F, as above.
- **CJK punctuation** (U+3000-U+303F, U+30FB): `、` `。` `「」` `『』` `《》`
  `〈〉` `【】` `・`, and the ideographic space.
- **The invisible and format characters of General Punctuation**, as above. This
  is what removes the last of the emoji residue: an emoji ZWJ sequence like
  👨‍👩‍👧 is deleted completely, and `⚠️` loses its variation selector U+FE0F,
  rather than leaving bare zero-width joiners behind.
- **Every emoji not in an open block.** The emoji table covers 1580 characters;
  the Emoticons, Enclosed Alphanumeric Supplement and Supplemental Symbols and
  Pictographs blocks stay out, so those reach the strip raw. In the pipeline the
  mapped ones have already become ASCII `:shortcode:`, so what the strip deletes
  is the original codepoint, never the label it turned into. With
  `emojis: false, stripNonLatin: true` *all* raw emoji are removed.
- **Symbols and operators** outside the kept blocks and outside the 13 open
  ones — `█` (Block Elements), the shade blocks, the C1 controls — because
  substitution now maps everything the open blocks contain and the strip takes
  the rest. Superscript and subscript digits (U+2070, U+2080) are in a later
  block and go too, unlike U+00B2 `²`, which is in Latin-1 and stays.
- **The euro sign `€`** — deliberately unmapped (see
  [Table sourcing](#table-sourcing-anyascii)), so the strip removes it.

#### The one fold: fullwidth and halfwidth forms

U+FF00-U+FFEF is the single deliberate exception, and it is a **fold, not a
substitution**. No category covers the fullwidth block — none of the six
substitution tables has anything to say about it — and NFKC maps every
codepoint in it onto a real ASCII counterpart, so folding is strictly better
than a dry delete and loses no information:

```
ＡＢＣ -> ABC     １２３ -> 123     ！？ -> !?
ｱｲｳ -> (removed: folds to katakana, which is in no kept block)
```

Only the matched runs are normalised, so text elsewhere keeps its exact bytes:
a precomposed `é` in Latin-1 is passed through byte for byte.

#### What it never touches

Files. File content legitimately contains non-Latin text — translated
documentation, string tables, i18n fixtures — and deleting those characters
would be silent, irreversible data loss. A `write` or `edit` payload carrying
Japanese, Russian, or Arabic text is passed through untouched, even with
`stripNonLatin: true`; only the substitutions above are applied to it. Same for
`apply_patch`, whose diff must match the target file byte for byte.

This holds across both file hooks: `tool.execute.before` never substitutes past
`args.content` / `args.newString`, and `tool.execute.after` only touches
`output.title` and `output.output`, which cannot reach a file payload.

## Substitution reference

2606 entries across thirteen Unicode blocks in six categories, every value the AnyAscii 0.3.3 replacement verbatim. Each category can be disabled independently; see [Configuration](#configuration). The tables below are exhaustive — every row is a substitution the plugin applies. For provenance and the exclusion rules, see [Table sourcing (AnyAscii)](#table-sourcing-anyascii).

### Punctuation (172)

Dashes, ellipsis, quotes, spaces, daggers, primes and the Letterlike Symbols. WHOLESALE AnyAscii 0.3.3.

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2010 | ‐ | `-` |
| U+2014 | — | `-` |
| U+2013 | – | `-` |
| U+2012 | ‒ | `-` |
| U+2015 | ― | `-` |
| U+2026 | … | `...` |
| U+201C | “ | `"` |
| U+201D | ” | `"` |
| U+201E | „ | `"` |
| U+201F | ‟ | `"` |
| U+00AB | « | `<<` |
| U+00BB | » | `>>` |
| U+2018 | ‘ | `'` |
| U+2019 | ’ | `'` |
| U+201A | ‚ | `'` |
| U+201B | ‛ | `'` |
| U+2039 | ‹ | `<` |
| U+203A | › | `>` |
| U+00A0 | (no-break space) | ` ` |
| U+00A1 | ¡ | `!` |
| U+00BF | ¿ | `?` |
| U+2022 | • | `*` |
| U+2023 | ‣ | `*` |
| U+25BA | ► | `>` |
| U+2043 | ⁃ | `-` |
| U+00B7 | · | `-` |
| U+2027 | ‧ | `-` |
| U+2032 | ′ | `'` |
| U+2033 | ″ | `''` |
| U+2035 | ‵ | `` ` `` |
| U+2016 | ‖ | `\|\|` |
| U+203C | ‼ | `!!` |
| U+2047 | ⁇ | `??` |
| U+2044 | ⁄ | `/` |
| U+2122 | ™ | `TM` |
| U+2117 | ℗ | `(P)` |
| U+2103 | ℃ | `C` |
| U+2109 | ℉ | `F` |
| U+2116 | № | `No` |
| U+2000 | (en quad) | ` ` |
| U+2001 | (em quad) | ` ` |
| U+2002 | (en space) | ` ` |
| U+2003 | (em space) | ` ` |
| U+2004 | (three-per-em space) | ` ` |
| U+2005 | (four-per-em space) | ` ` |
| U+2006 | (six-per-em space) | ` ` |
| U+2007 | (figure space) | ` ` |
| U+2008 | (punctuation space) | ` ` |
| U+2009 | (thin space) | ` ` |
| U+200A | (hair space) | ` ` |
| U+2011 | ‑ | `-` |
| U+2017 | ‗ | `_` |
| U+2020 | † | `+` |
| U+2021 | ‡ | `++` |
| U+2024 | ․ | `.` |
| U+2025 | ‥ | `..` |
| U+2028 | (line separator) | ` ` |
| U+2029 | (paragraph separator) | ` ` |
| U+202F | (narrow no-break space) | ` ` |
| U+2030 | ‰ | `%0` |
| U+2031 | ‱ | `%00` |
| U+2034 | ‴ | `'''` |
| U+2036 | ‶ | `` `` `` |
| U+2037 | ‷ | `` ``` `` |
| U+2038 | ‸ | `^` |
| U+203B | ※ | `*` |
| U+203D | ‽ | `!?` |
| U+203E | ‾ | `-` |
| U+203F | ‿ | `_` |
| U+2040 | ⁀ | `-` |
| U+2041 | ⁁ | `^` |
| U+2042 | ⁂ | `***` |
| U+2045 | ⁅ | `[` |
| U+2046 | ⁆ | `]` |
| U+2048 | ⁈ | `?!` |
| U+2049 | ⁉ | `!?` |
| U+204A | ⁊ | `&` |
| U+204B | ⁋ | `P` |
| U+204C | ⁌ | `<` |
| U+204D | ⁍ | `>` |
| U+204E | ⁎ | `*` |
| U+204F | ⁏ | `;` |
| U+2050 | ⁐ | `_` |
| U+2051 | ⁑ | `**` |
| U+2052 | ⁒ | `./.` |
| U+2053 | ⁓ | `~` |
| U+2054 | ⁔ | `_` |
| U+2055 | ⁕ | `*` |
| U+2056 | ⁖ | `:` |
| U+2057 | ⁗ | `''''` |
| U+2058 | ⁘ | `:` |
| U+2059 | ⁙ | `*` |
| U+205A | ⁚ | `:` |
| U+205B | ⁛ | `:` |
| U+205C | ⁜ | `+` |
| U+205D | ⁝ | `:` |
| U+205E | ⁞ | `:` |
| U+205F | (medium mathematical space) | ` ` |
| U+2100 | ℀ | `a/c` |
| U+2101 | ℁ | `a/s` |
| U+2102 | ℂ | `C` |
| U+2104 | ℄ | `CL` |
| U+2105 | ℅ | `c/o` |
| U+2106 | ℆ | `c/u` |
| U+2107 | ℇ | `E` |
| U+2108 | ℈ | `g` |
| U+210A | ℊ | `g` |
| U+210B | ℋ | `H` |
| U+210C | ℌ | `H` |
| U+210D | ℍ | `H` |
| U+210E | ℎ | `h` |
| U+210F | ℏ | `h` |
| U+2110 | ℐ | `I` |
| U+2111 | ℑ | `I` |
| U+2112 | ℒ | `L` |
| U+2113 | ℓ | `l` |
| U+2114 | ℔ | `#` |
| U+2115 | ℕ | `N` |
| U+2118 | ℘ | `p` |
| U+2119 | ℙ | `P` |
| U+211A | ℚ | `Q` |
| U+211B | ℛ | `R` |
| U+211C | ℜ | `R` |
| U+211D | ℝ | `R` |
| U+211E | ℞ | `Rx` |
| U+211F | ℟ | `R` |
| U+2120 | ℠ | `SM` |
| U+2121 | ℡ | `TEL` |
| U+2123 | ℣ | `V` |
| U+2124 | ℤ | `Z` |
| U+2125 | ℥ | `oz` |
| U+2126 | Ω | `Ohm` |
| U+2127 | ℧ | `Mho` |
| U+2128 | ℨ | `Z` |
| U+2129 | ℩ | `i` |
| U+212A | K | `K` |
| U+212B | Å | `A` |
| U+212C | ℬ | `B` |
| U+212D | ℭ | `C` |
| U+212E | ℮ | `e` |
| U+212F | ℯ | `e` |
| U+2130 | ℰ | `E` |
| U+2131 | ℱ | `F` |
| U+2132 | Ⅎ | `F` |
| U+2133 | ℳ | `M` |
| U+2134 | ℴ | `o` |
| U+2135 | ℵ | `a` |
| U+2136 | ℶ | `b` |
| U+2137 | ℷ | `g` |
| U+2138 | ℸ | `d` |
| U+213A | ℺ | `Q` |
| U+213B | ℻ | `FAX` |
| U+213C | ℼ | `p` |
| U+213D | ℽ | `g` |
| U+213E | ℾ | `G` |
| U+213F | ℿ | `P` |
| U+2140 | ⅀ | `S` |
| U+2141 | ⅁ | `G` |
| U+2142 | ⅂ | `L` |
| U+2143 | ⅃ | `L` |
| U+2144 | ⅄ | `Y` |
| U+2145 | ⅅ | `D` |
| U+2146 | ⅆ | `d` |
| U+2147 | ⅇ | `e` |
| U+2148 | ⅈ | `i` |
| U+2149 | ⅉ | `j` |
| U+214A | ⅊ | `PL` |
| U+214B | ⅋ | `&` |
| U+214C | ⅌ | `P` |
| U+214D | ⅍ | `A/S` |
| U+214E | ⅎ | `f` |
| U+214F | ⅏ | `Sh` |

### Frames (128)

Box-drawing rules, corners, tees, crosses, heavies and mixed joints. Own `frames` flag. WHOLESALE AnyAscii 0.3.3.

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2500 | ─ | `-` |
| U+2502 | │ | `\|` |
| U+250C | ┌ | `+` |
| U+2510 | ┐ | `+` |
| U+2514 | └ | `+` |
| U+2518 | ┘ | `+` |
| U+251C | ├ | `+` |
| U+2524 | ┤ | `+` |
| U+252C | ┬ | `+` |
| U+2534 | ┴ | `+` |
| U+253C | ┼ | `+` |
| U+2501 | ━ | `-` |
| U+2503 | ┃ | `\|` |
| U+2504 | ┄ | `-` |
| U+2505 | ┅ | `-` |
| U+2506 | ┆ | `\|` |
| U+2507 | ┇ | `\|` |
| U+2508 | ┈ | `-` |
| U+2509 | ┉ | `-` |
| U+250A | ┊ | `\|` |
| U+250B | ┋ | `\|` |
| U+250D | ┍ | `+` |
| U+250E | ┎ | `+` |
| U+250F | ┏ | `+` |
| U+2511 | ┑ | `+` |
| U+2512 | ┒ | `+` |
| U+2513 | ┓ | `+` |
| U+2515 | ┕ | `+` |
| U+2516 | ┖ | `+` |
| U+2517 | ┗ | `+` |
| U+2519 | ┙ | `+` |
| U+251A | ┚ | `+` |
| U+251B | ┛ | `+` |
| U+251D | ┝ | `+` |
| U+251E | ┞ | `+` |
| U+251F | ┟ | `+` |
| U+2520 | ┠ | `+` |
| U+2521 | ┡ | `+` |
| U+2522 | ┢ | `+` |
| U+2523 | ┣ | `+` |
| U+2525 | ┥ | `+` |
| U+2526 | ┦ | `+` |
| U+2527 | ┧ | `+` |
| U+2528 | ┨ | `+` |
| U+2529 | ┩ | `+` |
| U+252A | ┪ | `+` |
| U+252B | ┫ | `+` |
| U+252D | ┭ | `+` |
| U+252E | ┮ | `+` |
| U+252F | ┯ | `+` |
| U+2530 | ┰ | `+` |
| U+2531 | ┱ | `+` |
| U+2532 | ┲ | `+` |
| U+2533 | ┳ | `+` |
| U+2535 | ┵ | `+` |
| U+2536 | ┶ | `+` |
| U+2537 | ┷ | `+` |
| U+2538 | ┸ | `+` |
| U+2539 | ┹ | `+` |
| U+253A | ┺ | `+` |
| U+253B | ┻ | `+` |
| U+253D | ┽ | `+` |
| U+253E | ┾ | `+` |
| U+253F | ┿ | `+` |
| U+2540 | ╀ | `+` |
| U+2541 | ╁ | `+` |
| U+2542 | ╂ | `+` |
| U+2543 | ╃ | `+` |
| U+2544 | ╄ | `+` |
| U+2545 | ╅ | `+` |
| U+2546 | ╆ | `+` |
| U+2547 | ╇ | `+` |
| U+2548 | ╈ | `+` |
| U+2549 | ╉ | `+` |
| U+254A | ╊ | `+` |
| U+254B | ╋ | `+` |
| U+254C | ╌ | `-` |
| U+254D | ╍ | `-` |
| U+254E | ╎ | `\|` |
| U+254F | ╏ | `\|` |
| U+2550 | ═ | `-` |
| U+2551 | ║ | `\|` |
| U+2552 | ╒ | `+` |
| U+2553 | ╓ | `+` |
| U+2554 | ╔ | `+` |
| U+2555 | ╕ | `+` |
| U+2556 | ╖ | `+` |
| U+2557 | ╗ | `+` |
| U+2558 | ╘ | `+` |
| U+2559 | ╙ | `+` |
| U+255A | ╚ | `+` |
| U+255B | ╛ | `+` |
| U+255C | ╜ | `+` |
| U+255D | ╝ | `+` |
| U+255E | ╞ | `+` |
| U+255F | ╟ | `+` |
| U+2560 | ╠ | `+` |
| U+2561 | ╡ | `+` |
| U+2562 | ╢ | `+` |
| U+2563 | ╣ | `+` |
| U+2564 | ╤ | `+` |
| U+2565 | ╥ | `+` |
| U+2566 | ╦ | `+` |
| U+2567 | ╧ | `+` |
| U+2568 | ╨ | `+` |
| U+2569 | ╩ | `+` |
| U+256A | ╪ | `+` |
| U+256B | ╫ | `+` |
| U+256C | ╬ | `+` |
| U+256D | ╭ | `+` |
| U+256E | ╮ | `+` |
| U+256F | ╯ | `+` |
| U+2570 | ╰ | `+` |
| U+2571 | ╱ | `/` |
| U+2572 | ╲ | `\` |
| U+2573 | ╳ | `X` |
| U+2574 | ╴ | `-` |
| U+2575 | ╵ | `\|` |
| U+2576 | ╶ | `-` |
| U+2577 | ╷ | `\|` |
| U+2578 | ╸ | `-` |
| U+2579 | ╹ | `\|` |
| U+257A | ╺ | `-` |
| U+257B | ╻ | `\|` |
| U+257C | ╼ | `-` |
| U+257D | ╽ | `\|` |
| U+257E | ╾ | `-` |
| U+257F | ╿ | `\|` |

### Shapes (89)

Geometric Shapes by appearance, plus the emoji-scale square twins. Own `shapes` flag. WHOLESALE AnyAscii 0.3.3.

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+25CF | ● | `*` |
| U+25CB | ○ | `*` |
| U+25A0 | ■ | `#` |
| U+25A1 | □ | `#` |
| U+2B1B | ⬛ | `:black_large_square:` |
| U+2B1C | ⬜ | `:white_large_square:` |
| U+25A2 | ▢ | `#` |
| U+25A3 | ▣ | `#` |
| U+25A4 | ▤ | `#` |
| U+25A5 | ▥ | `#` |
| U+25A6 | ▦ | `#` |
| U+25A7 | ▧ | `#` |
| U+25A8 | ▨ | `#` |
| U+25A9 | ▩ | `#` |
| U+25AA | ▪ | `:black_small_square:` |
| U+25AB | ▫ | `:white_small_square:` |
| U+25AC | ▬ | `#` |
| U+25AD | ▭ | `#` |
| U+25AE | ▮ | `#` |
| U+25AF | ▯ | `#` |
| U+25B0 | ▰ | `#` |
| U+25B1 | ▱ | `#` |
| U+25B5 | ▵ | `^` |
| U+25B7 | ▷ | `>` |
| U+25B8 | ▸ | `>` |
| U+25B9 | ▹ | `>` |
| U+25BB | ▻ | `>` |
| U+25BF | ▿ | `v` |
| U+25C1 | ◁ | `<` |
| U+25C2 | ◂ | `<` |
| U+25C3 | ◃ | `<` |
| U+25C4 | ◄ | `<` |
| U+25C5 | ◅ | `<` |
| U+25C6 | ◆ | `*` |
| U+25C7 | ◇ | `*` |
| U+25C8 | ◈ | `*` |
| U+25C9 | ◉ | `*` |
| U+25CA | ◊ | `*` |
| U+25CC | ◌ | `*` |
| U+25CD | ◍ | `*` |
| U+25CE | ◎ | `*` |
| U+25D0 | ◐ | `*` |
| U+25D1 | ◑ | `*` |
| U+25D2 | ◒ | `*` |
| U+25D3 | ◓ | `*` |
| U+25D4 | ◔ | `*` |
| U+25D5 | ◕ | `*` |
| U+25D6 | ◖ | `(` |
| U+25D7 | ◗ | `)` |
| U+25D8 | ◘ | `*` |
| U+25D9 | ◙ | `*` |
| U+25DA | ◚ | `*` |
| U+25DB | ◛ | `*` |
| U+25DC | ◜ | `*` |
| U+25DD | ◝ | `*` |
| U+25DE | ◞ | `*` |
| U+25DF | ◟ | `*` |
| U+25E0 | ◠ | `*` |
| U+25E1 | ◡ | `*` |
| U+25E2 | ◢ | `/` |
| U+25E3 | ◣ | `\` |
| U+25E4 | ◤ | `/` |
| U+25E5 | ◥ | `\` |
| U+25E6 | ◦ | `*` |
| U+25E7 | ◧ | `#` |
| U+25E8 | ◨ | `#` |
| U+25E9 | ◩ | `#` |
| U+25EA | ◪ | `#` |
| U+25EB | ◫ | `#` |
| U+25EC | ◬ | `^` |
| U+25ED | ◭ | `^` |
| U+25EE | ◮ | `^` |
| U+25EF | ◯ | `*` |
| U+25F0 | ◰ | `#` |
| U+25F1 | ◱ | `#` |
| U+25F2 | ◲ | `#` |
| U+25F3 | ◳ | `#` |
| U+25F4 | ◴ | `*` |
| U+25F5 | ◵ | `*` |
| U+25F6 | ◶ | `*` |
| U+25F7 | ◷ | `*` |
| U+25F8 | ◸ | `/` |
| U+25F9 | ◹ | `\` |
| U+25FA | ◺ | `\` |
| U+25FB | ◻ | `:white_medium_square:` |
| U+25FC | ◼ | `:black_medium_square:` |
| U+25FD | ◽ | `:white_medium_small_square:` |
| U+25FE | ◾ | `:black_medium_small_square:` |
| U+25FF | ◿ | `/` |

### Arrows (377)

Arrows and Miscellaneous Symbols and Arrows, shortcodes included. WHOLESALE AnyAscii 0.3.3.

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2192 | → | `>` |
| U+2190 | ← | `<` |
| U+2191 | ↑ | `^` |
| U+2193 | ↓ | `v` |
| U+21D2 | ⇒ | `>` |
| U+21D0 | ⇐ | `<` |
| U+21D4 | ⇔ | `-` |
| U+2194 | ↔ | `:left_right_arrow:` |
| U+21C4 | ⇄ | `=` |
| U+21C6 | ⇆ | `=` |
| U+21D1 | ⇑ | `^` |
| U+21D3 | ⇓ | `v` |
| U+21A6 | ↦ | `>` |
| U+21A4 | ↤ | `<` |
| U+21E8 | ⇨ | `>` |
| U+21E6 | ⇦ | `<` |
| U+21E7 | ⇧ | `^` |
| U+21E9 | ⇩ | `v` |
| U+2B9E | ⮞ | `>` |
| U+27A1 | ➡ | `:arrow_right:` |
| U+2B05 | ⬅ | `:arrow_left:` |
| U+2B06 | ⬆ | `:arrow_up:` |
| U+2B07 | ⬇ | `:arrow_down:` |
| U+2B0C | ⬌ | `-` |
| U+25BC | ▼ | `v` |
| U+25B2 | ▲ | `^` |
| U+25BD | ▽ | `v` |
| U+25B3 | △ | `^` |
| U+25BE | ▾ | `v` |
| U+25B4 | ▴ | `^` |
| U+25B6 | ▶ | `:arrow_forward:` |
| U+25C0 | ◀ | `:arrow_backward:` |
| U+21A9 | ↩ | `:leftwards_arrow_with_hook:` |
| U+21AA | ↪ | `:arrow_right_hook:` |
| U+21B5 | ↵ | `<` |
| U+21BA | ↺ | `<` |
| U+21BB | ↻ | `>` |
| U+21E0 | ⇠ | `<` |
| U+21E2 | ⇢ | `>` |
| U+21E1 | ⇡ | `^` |
| U+21E3 | ⇣ | `v` |
| U+21DD | ⇝ | `>` |
| U+2794 | ➔ | `>` |
| U+279D | ➝ | `>` |
| U+279E | ➞ | `>` |
| U+27A0 | ➠ | `>` |
| U+279C | ➜ | `>` |
| U+27A4 | ➤ | `>` |
| U+2195 | ↕ | `:arrow_up_down:` |
| U+2196 | ↖ | `:arrow_upper_left:` |
| U+2197 | ↗ | `:arrow_upper_right:` |
| U+2198 | ↘ | `:arrow_lower_right:` |
| U+2199 | ↙ | `:arrow_lower_left:` |
| U+219A | ↚ | `<` |
| U+219B | ↛ | `>` |
| U+219C | ↜ | `<` |
| U+219D | ↝ | `>` |
| U+219E | ↞ | `<` |
| U+219F | ↟ | `^` |
| U+21A0 | ↠ | `>` |
| U+21A1 | ↡ | `v` |
| U+21A2 | ↢ | `<` |
| U+21A3 | ↣ | `>` |
| U+21A5 | ↥ | `^` |
| U+21A7 | ↧ | `v` |
| U+21A8 | ↨ | `\|` |
| U+21AB | ↫ | `<` |
| U+21AC | ↬ | `>` |
| U+21AD | ↭ | `~` |
| U+21AE | ↮ | `-` |
| U+21AF | ↯ | `v` |
| U+21B0 | ↰ | `<` |
| U+21B1 | ↱ | `>` |
| U+21B2 | ↲ | `<` |
| U+21B3 | ↳ | `>` |
| U+21B4 | ↴ | `v` |
| U+21B6 | ↶ | `<` |
| U+21B7 | ↷ | `>` |
| U+21B8 | ↸ | `\` |
| U+21B9 | ↹ | `=` |
| U+21BC | ↼ | `<` |
| U+21BD | ↽ | `<` |
| U+21BE | ↾ | `^` |
| U+21BF | ↿ | `^` |
| U+21C0 | ⇀ | `>` |
| U+21C1 | ⇁ | `>` |
| U+21C2 | ⇂ | `v` |
| U+21C3 | ⇃ | `v` |
| U+21C5 | ⇅ | `\|` |
| U+21C7 | ⇇ | `<` |
| U+21C8 | ⇈ | `^` |
| U+21C9 | ⇉ | `>` |
| U+21CA | ⇊ | `v` |
| U+21CB | ⇋ | `=` |
| U+21CC | ⇌ | `=` |
| U+21CD | ⇍ | `<` |
| U+21CE | ⇎ | `-` |
| U+21CF | ⇏ | `>` |
| U+21D5 | ⇕ | `\|` |
| U+21D6 | ⇖ | `\` |
| U+21D7 | ⇗ | `/` |
| U+21D8 | ⇘ | `\` |
| U+21D9 | ⇙ | `/` |
| U+21DA | ⇚ | `<` |
| U+21DB | ⇛ | `>` |
| U+21DC | ⇜ | `<` |
| U+21DE | ⇞ | `^` |
| U+21DF | ⇟ | `v` |
| U+21E4 | ⇤ | `<` |
| U+21E5 | ⇥ | `>` |
| U+21EA | ⇪ | `^` |
| U+21EB | ⇫ | `^` |
| U+21EC | ⇬ | `^` |
| U+21ED | ⇭ | `^` |
| U+21EE | ⇮ | `^` |
| U+21EF | ⇯ | `^` |
| U+21F0 | ⇰ | `>` |
| U+21F1 | ⇱ | `\` |
| U+21F2 | ⇲ | `\` |
| U+21F3 | ⇳ | `\|` |
| U+21F4 | ⇴ | `>` |
| U+21F5 | ⇵ | `\|` |
| U+21F6 | ⇶ | `>` |
| U+21F7 | ⇷ | `<` |
| U+21F8 | ⇸ | `>` |
| U+21F9 | ⇹ | `-` |
| U+21FA | ⇺ | `<` |
| U+21FB | ⇻ | `>` |
| U+21FC | ⇼ | `-` |
| U+21FD | ⇽ | `<` |
| U+21FE | ⇾ | `>` |
| U+21FF | ⇿ | `-` |
| U+2B00 | ⬀ | `/` |
| U+2B01 | ⬁ | `\` |
| U+2B02 | ⬂ | `\` |
| U+2B03 | ⬃ | `/` |
| U+2B04 | ⬄ | `-` |
| U+2B08 | ⬈ | `/` |
| U+2B09 | ⬉ | `\` |
| U+2B0A | ⬊ | `\` |
| U+2B0B | ⬋ | `/` |
| U+2B0D | ⬍ | `\|` |
| U+2B0E | ⬎ | `v` |
| U+2B0F | ⬏ | `^` |
| U+2B10 | ⬐ | `v` |
| U+2B11 | ⬑ | `^` |
| U+2B12 | ⬒ | `-` |
| U+2B13 | ⬓ | `-` |
| U+2B14 | ⬔ | `\` |
| U+2B15 | ⬕ | `\` |
| U+2B16 | ⬖ | `\|` |
| U+2B17 | ⬗ | `\|` |
| U+2B18 | ⬘ | `-` |
| U+2B19 | ⬙ | `-` |
| U+2B1A | ⬚ | `#` |
| U+2B1D | ⬝ | `-` |
| U+2B1E | ⬞ | `-` |
| U+2B1F | ⬟ | `*` |
| U+2B20 | ⬠ | `*` |
| U+2B21 | ⬡ | `*` |
| U+2B22 | ⬢ | `*` |
| U+2B23 | ⬣ | `*` |
| U+2B24 | ⬤ | `*` |
| U+2B25 | ⬥ | `*` |
| U+2B26 | ⬦ | `*` |
| U+2B27 | ⬧ | `*` |
| U+2B28 | ⬨ | `*` |
| U+2B29 | ⬩ | `*` |
| U+2B2A | ⬪ | `*` |
| U+2B2B | ⬫ | `*` |
| U+2B2C | ⬬ | `*` |
| U+2B2D | ⬭ | `*` |
| U+2B2E | ⬮ | `*` |
| U+2B2F | ⬯ | `*` |
| U+2B30 | ⬰ | `<` |
| U+2B31 | ⬱ | `<` |
| U+2B32 | ⬲ | `<` |
| U+2B33 | ⬳ | `<` |
| U+2B34 | ⬴ | `<` |
| U+2B35 | ⬵ | `<` |
| U+2B36 | ⬶ | `<` |
| U+2B37 | ⬷ | `<` |
| U+2B38 | ⬸ | `<` |
| U+2B39 | ⬹ | `<` |
| U+2B3A | ⬺ | `<` |
| U+2B3B | ⬻ | `<` |
| U+2B3C | ⬼ | `<` |
| U+2B3D | ⬽ | `<` |
| U+2B3E | ⬾ | `<` |
| U+2B3F | ⬿ | `<` |
| U+2B40 | ⭀ | `<` |
| U+2B41 | ⭁ | `<` |
| U+2B42 | ⭂ | `<` |
| U+2B43 | ⭃ | `>` |
| U+2B44 | ⭄ | `>` |
| U+2B45 | ⭅ | `<` |
| U+2B46 | ⭆ | `>` |
| U+2B47 | ⭇ | `>` |
| U+2B48 | ⭈ | `>` |
| U+2B49 | ⭉ | `<` |
| U+2B4A | ⭊ | `<` |
| U+2B4B | ⭋ | `<` |
| U+2B4C | ⭌ | `>` |
| U+2B4D | ⭍ | `v` |
| U+2B4E | ⭎ | `/` |
| U+2B4F | ⭏ | `\` |
| U+2B51 | ⭑ | `*` |
| U+2B52 | ⭒ | `*` |
| U+2B53 | ⭓ | `*` |
| U+2B54 | ⭔ | `*` |
| U+2B55 | ⭕ | `:o:` |
| U+2B56 | ⭖ | `*` |
| U+2B57 | ⭗ | `*` |
| U+2B58 | ⭘ | `*` |
| U+2B59 | ⭙ | `*` |
| U+2B5A | ⭚ | `/` |
| U+2B5B | ⭛ | `\` |
| U+2B5C | ⭜ | `/` |
| U+2B5D | ⭝ | `\` |
| U+2B5E | ⭞ | `>` |
| U+2B5F | ⭟ | `>` |
| U+2B60 | ⭠ | `<` |
| U+2B61 | ⭡ | `^` |
| U+2B62 | ⭢ | `>` |
| U+2B63 | ⭣ | `v` |
| U+2B64 | ⭤ | `-` |
| U+2B65 | ⭥ | `\|` |
| U+2B66 | ⭦ | `\` |
| U+2B67 | ⭧ | `/` |
| U+2B68 | ⭨ | `\` |
| U+2B69 | ⭩ | `/` |
| U+2B6A | ⭪ | `<` |
| U+2B6B | ⭫ | `^` |
| U+2B6C | ⭬ | `>` |
| U+2B6D | ⭭ | `v` |
| U+2B6E | ⭮ | `>` |
| U+2B6F | ⭯ | `<` |
| U+2B70 | ⭰ | `<` |
| U+2B71 | ⭱ | `^` |
| U+2B72 | ⭲ | `>` |
| U+2B73 | ⭳ | `v` |
| U+2B76 | ⭶ | `\` |
| U+2B77 | ⭷ | `/` |
| U+2B78 | ⭸ | `\` |
| U+2B79 | ⭹ | `/` |
| U+2B7A | ⭺ | `<` |
| U+2B7B | ⭻ | `^` |
| U+2B7C | ⭼ | `>` |
| U+2B7D | ⭽ | `v` |
| U+2B7E | ⭾ | `=` |
| U+2B7F | ⭿ | `\|` |
| U+2B80 | ⮀ | `=` |
| U+2B81 | ⮁ | `\|` |
| U+2B82 | ⮂ | `=` |
| U+2B83 | ⮃ | `\|` |
| U+2B84 | ⮄ | `<` |
| U+2B85 | ⮅ | `^` |
| U+2B86 | ⮆ | `>` |
| U+2B87 | ⮇ | `v` |
| U+2B88 | ⮈ | `<` |
| U+2B89 | ⮉ | `^` |
| U+2B8A | ⮊ | `>` |
| U+2B8B | ⮋ | `v` |
| U+2B8C | ⮌ | `<` |
| U+2B8D | ⮍ | `^` |
| U+2B8E | ⮎ | `>` |
| U+2B8F | ⮏ | `v` |
| U+2B90 | ⮐ | `<` |
| U+2B91 | ⮑ | `>` |
| U+2B92 | ⮒ | `<` |
| U+2B93 | ⮓ | `>` |
| U+2B94 | ⮔ | `*` |
| U+2B95 | ⮕ | `>` |
| U+2B97 | ⮗ | `A` |
| U+2B98 | ⮘ | `<` |
| U+2B99 | ⮙ | `^` |
| U+2B9A | ⮚ | `>` |
| U+2B9B | ⮛ | `v` |
| U+2B9C | ⮜ | `<` |
| U+2B9D | ⮝ | `^` |
| U+2B9F | ⮟ | `v` |
| U+2BA0 | ⮠ | `<` |
| U+2BA1 | ⮡ | `>` |
| U+2BA2 | ⮢ | `<` |
| U+2BA3 | ⮣ | `>` |
| U+2BA4 | ⮤ | `^` |
| U+2BA5 | ⮥ | `^` |
| U+2BA6 | ⮦ | `v` |
| U+2BA7 | ⮧ | `v` |
| U+2BA8 | ⮨ | `<` |
| U+2BA9 | ⮩ | `>` |
| U+2BAA | ⮪ | `<` |
| U+2BAB | ⮫ | `>` |
| U+2BAC | ⮬ | `^` |
| U+2BAD | ⮭ | `^` |
| U+2BAE | ⮮ | `v` |
| U+2BAF | ⮯ | `v` |
| U+2BB0 | ⮰ | `<` |
| U+2BB1 | ⮱ | `>` |
| U+2BB2 | ⮲ | `<` |
| U+2BB3 | ⮳ | `>` |
| U+2BB4 | ⮴ | `^` |
| U+2BB5 | ⮵ | `^` |
| U+2BB6 | ⮶ | `v` |
| U+2BB7 | ⮷ | `v` |
| U+2BB8 | ⮸ | `^` |
| U+2BB9 | ⮹ | `^` |
| U+2BBA | ⮺ | `*` |
| U+2BBB | ⮻ | `*` |
| U+2BBC | ⮼ | `*` |
| U+2BBD | ⮽ | `x` |
| U+2BBE | ⮾ | `x` |
| U+2BBF | ⮿ | `x` |
| U+2BC0 | ⯀ | `*` |
| U+2BC1 | ⯁ | `*` |
| U+2BC2 | ⯂ | `*` |
| U+2BC3 | ⯃ | `*` |
| U+2BC4 | ⯄ | `*` |
| U+2BC5 | ⯅ | `^` |
| U+2BC6 | ⯆ | `v` |
| U+2BC7 | ⯇ | `<` |
| U+2BC8 | ⯈ | `>` |
| U+2BC9 | ⯉ | `Neptune` |
| U+2BCA | ⯊ | `^` |
| U+2BCB | ⯋ | `v` |
| U+2BCC | ⯌ | `*` |
| U+2BCD | ⯍ | `*` |
| U+2BCE | ⯎ | `*` |
| U+2BCF | ⯏ | `*` |
| U+2BD0 | ⯐ | `+` |
| U+2BD1 | ⯑ | `?` |
| U+2BD2 | ⯒ | `+` |
| U+2BD3 | ⯓ | `Pluto` |
| U+2BD4 | ⯔ | `Pluto` |
| U+2BD5 | ⯕ | `Pluto` |
| U+2BD6 | ⯖ | `Pluto` |
| U+2BD7 | ⯗ | `*` |
| U+2BD8 | ⯘ | `*` |
| U+2BD9 | ⯙ | `*` |
| U+2BDA | ⯚ | `*` |
| U+2BDB | ⯛ | `*` |
| U+2BDC | ⯜ | `*` |
| U+2BDD | ⯝ | `*` |
| U+2BDE | ⯞ | `*` |
| U+2BDF | ⯟ | `*` |
| U+2BE0 | ⯠ | `Cupido` |
| U+2BE1 | ⯡ | `Hades` |
| U+2BE2 | ⯢ | `Zeus` |
| U+2BE3 | ⯣ | `Kronos` |
| U+2BE4 | ⯤ | `Apollon` |
| U+2BE5 | ⯥ | `Admetos` |
| U+2BE6 | ⯦ | `Vulcanus` |
| U+2BE7 | ⯧ | `Poseidon` |
| U+2BE8 | ⯨ | `*` |
| U+2BE9 | ⯩ | `*` |
| U+2BEA | ⯪ | `*` |
| U+2BEB | ⯫ | `*` |
| U+2BEC | ⯬ | `<` |
| U+2BED | ⯭ | `^` |
| U+2BEE | ⯮ | `>` |
| U+2BEF | ⯯ | `v` |
| U+2BF0 | ⯰ | `*` |
| U+2BF1 | ⯱ | `*` |
| U+2BF2 | ⯲ | `*` |
| U+2BF3 | ⯳ | `V` |
| U+2BF4 | ⯴ | `N` |
| U+2BF5 | ⯵ | `Q` |
| U+2BF6 | ⯶ | `N2` |
| U+2BF7 | ⯷ | `100` |
| U+2BF8 | ⯸ | `D3` |
| U+2BF9 | ⯹ | `*` |
| U+2BFA | ⯺ | `*` |
| U+2BFB | ⯻ | `*` |
| U+2BFC | ⯼ | `*` |
| U+2BFD | ⯽ | `*` |
| U+2BFE | ⯾ | `*` |
| U+2BFF | ⯿ | `#` |

### Math operators (260)

Mathematical Operators: relations, roots, integrals and all. WHOLESALE AnyAscii 0.3.3.

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2260 | ≠ | `=` |
| U+2261 | ≡ | `=` |
| U+2264 | ≤ | `<=` |
| U+2265 | ≥ | `>=` |
| U+2266 | ≦ | `<=` |
| U+2267 | ≧ | `>=` |
| U+2225 | ∥ | `\|\|` |
| U+226A | ≪ | `<<` |
| U+226B | ≫ | `>>` |
| U+00D7 | × | `*` |
| U+00F7 | ÷ | `/` |
| U+00B1 | ± | `+-` |
| U+2212 | − | `-` |
| U+221E | ∞ | `inf` |
| U+2248 | ≈ | `~` |
| U+223C | ∼ | `~` |
| U+221A | √ | `sqrt` |
| U+2211 | ∑ | `S` |
| U+220F | ∏ | `P` |
| U+2202 | ∂ | `d` |
| U+2207 | ∇ | `D` |
| U+2208 | ∈ | `E` |
| U+2209 | ∉ | `E` |
| U+2229 | ∩ | `^` |
| U+222A | ∪ | `v` |
| U+2282 | ⊂ | `<` |
| U+2283 | ⊃ | `>` |
| U+2286 | ⊆ | `<` |
| U+2287 | ⊇ | `>` |
| U+2227 | ∧ | `^` |
| U+2228 | ∨ | `v` |
| U+00AC | ¬ | `!` |
| U+2234 | ∴ | `:` |
| U+2235 | ∵ | `:` |
| U+2200 | ∀ | `V` |
| U+2205 | ∅ | `0` |
| U+22C5 | ⋅ | `*` |
| U+22EF | ⋯ | `-` |
| U+2201 | ∁ | `C` |
| U+2203 | ∃ | `E` |
| U+2204 | ∄ | `E` |
| U+2206 | ∆ | `^` |
| U+220A | ∊ | `E` |
| U+220B | ∋ | `E` |
| U+220C | ∌ | `E` |
| U+220D | ∍ | `E` |
| U+220E | ∎ | `#` |
| U+2210 | ∐ | `U` |
| U+2213 | ∓ | `-+` |
| U+2214 | ∔ | `+` |
| U+2215 | ∕ | `/` |
| U+2216 | ∖ | `\` |
| U+2217 | ∗ | `*` |
| U+2218 | ∘ | `*` |
| U+2219 | ∙ | `*` |
| U+221B | ∛ | `cbrt` |
| U+221C | ∜ | `4rt` |
| U+221D | ∝ | `~` |
| U+221F | ∟ | `L` |
| U+2220 | ∠ | `<` |
| U+2221 | ∡ | `<` |
| U+2222 | ∢ | `<` |
| U+2223 | ∣ | `\|` |
| U+2224 | ∤ | `\|` |
| U+2226 | ∦ | `\|\|` |
| U+222B | ∫ | `S` |
| U+222C | ∬ | `S` |
| U+222D | ∭ | `SSS` |
| U+222E | ∮ | `S` |
| U+222F | ∯ | `SS` |
| U+2230 | ∰ | `SSS` |
| U+2231 | ∱ | `S` |
| U+2232 | ∲ | `S` |
| U+2233 | ∳ | `S` |
| U+2236 | ∶ | `:` |
| U+2237 | ∷ | `::` |
| U+2238 | ∸ | `_` |
| U+2239 | ∹ | `-:` |
| U+223A | ∺ | `-` |
| U+223B | ∻ | `~` |
| U+223D | ∽ | `~` |
| U+223E | ∾ | `~` |
| U+223F | ∿ | `~` |
| U+2240 | ≀ | `~` |
| U+2241 | ≁ | `~` |
| U+2242 | ≂ | `-~` |
| U+2243 | ≃ | `~` |
| U+2244 | ≄ | `~` |
| U+2245 | ≅ | `~=` |
| U+2246 | ≆ | `=` |
| U+2247 | ≇ | `=` |
| U+2249 | ≉ | `~` |
| U+224A | ≊ | `~` |
| U+224B | ≋ | `~` |
| U+224C | ≌ | `~=` |
| U+224D | ≍ | `=` |
| U+224E | ≎ | `=` |
| U+224F | ≏ | `=` |
| U+2250 | ≐ | `=` |
| U+2251 | ≑ | `=` |
| U+2252 | ≒ | `=` |
| U+2253 | ≓ | `=` |
| U+2254 | ≔ | `:=` |
| U+2255 | ≕ | `=:` |
| U+2256 | ≖ | `=` |
| U+2257 | ≗ | `=` |
| U+2258 | ≘ | `=` |
| U+2259 | ≙ | `=` |
| U+225A | ≚ | `=` |
| U+225B | ≛ | `=` |
| U+225C | ≜ | `=` |
| U+225D | ≝ | `=` |
| U+225E | ≞ | `=` |
| U+225F | ≟ | `=` |
| U+2262 | ≢ | `=` |
| U+2263 | ≣ | `=` |
| U+2268 | ≨ | `<` |
| U+2269 | ≩ | `>` |
| U+226C | ≬ | `()` |
| U+226D | ≭ | `=` |
| U+226E | ≮ | `<` |
| U+226F | ≯ | `>` |
| U+2270 | ≰ | `<` |
| U+2271 | ≱ | `>` |
| U+2272 | ≲ | `<~` |
| U+2273 | ≳ | `>~` |
| U+2274 | ≴ | `<` |
| U+2275 | ≵ | `>` |
| U+2276 | ≶ | `=` |
| U+2277 | ≷ | `=` |
| U+2278 | ≸ | `=` |
| U+2279 | ≹ | `=` |
| U+227A | ≺ | `<` |
| U+227B | ≻ | `>` |
| U+227C | ≼ | `<` |
| U+227D | ≽ | `>` |
| U+227E | ≾ | `<` |
| U+227F | ≿ | `>` |
| U+2280 | ⊀ | `<` |
| U+2281 | ⊁ | `>` |
| U+2284 | ⊄ | `<` |
| U+2285 | ⊅ | `>` |
| U+2288 | ⊈ | `<` |
| U+2289 | ⊉ | `>` |
| U+228A | ⊊ | `<` |
| U+228B | ⊋ | `>` |
| U+228C | ⊌ | `v` |
| U+228D | ⊍ | `v` |
| U+228E | ⊎ | `v` |
| U+228F | ⊏ | `[` |
| U+2290 | ⊐ | `]` |
| U+2291 | ⊑ | `[` |
| U+2292 | ⊒ | `]` |
| U+2293 | ⊓ | `^` |
| U+2294 | ⊔ | `v` |
| U+2295 | ⊕ | `+` |
| U+2296 | ⊖ | `-` |
| U+2297 | ⊗ | `x` |
| U+2298 | ⊘ | `/` |
| U+2299 | ⊙ | `.` |
| U+229A | ⊚ | `o` |
| U+229B | ⊛ | `*` |
| U+229C | ⊜ | `=` |
| U+229D | ⊝ | `-` |
| U+229E | ⊞ | `+` |
| U+229F | ⊟ | `-` |
| U+22A0 | ⊠ | `x` |
| U+22A1 | ⊡ | `.` |
| U+22A2 | ⊢ | `+` |
| U+22A3 | ⊣ | `+` |
| U+22A4 | ⊤ | `+` |
| U+22A5 | ⊥ | `+` |
| U+22A6 | ⊦ | `+` |
| U+22A7 | ⊧ | `+` |
| U+22A8 | ⊨ | `+` |
| U+22A9 | ⊩ | `+` |
| U+22AA | ⊪ | `+` |
| U+22AB | ⊫ | `+` |
| U+22AC | ⊬ | `+` |
| U+22AD | ⊭ | `+` |
| U+22AE | ⊮ | `+` |
| U+22AF | ⊯ | `+` |
| U+22B0 | ⊰ | `<` |
| U+22B1 | ⊱ | `>` |
| U+22B2 | ⊲ | `<` |
| U+22B3 | ⊳ | `>` |
| U+22B4 | ⊴ | `<` |
| U+22B5 | ⊵ | `>` |
| U+22B6 | ⊶ | `-` |
| U+22B7 | ⊷ | `-` |
| U+22B8 | ⊸ | `-` |
| U+22B9 | ⊹ | `+` |
| U+22BA | ⊺ | `T` |
| U+22BB | ⊻ | `v` |
| U+22BC | ⊼ | `^` |
| U+22BD | ⊽ | `v` |
| U+22BE | ⊾ | `<` |
| U+22BF | ⊿ | `/` |
| U+22C0 | ⋀ | `^` |
| U+22C1 | ⋁ | `v` |
| U+22C2 | ⋂ | `^` |
| U+22C3 | ⋃ | `v` |
| U+22C4 | ⋄ | `*` |
| U+22C6 | ⋆ | `*` |
| U+22C7 | ⋇ | `*` |
| U+22C8 | ⋈ | `><` |
| U+22C9 | ⋉ | `><` |
| U+22CA | ⋊ | `><` |
| U+22CB | ⋋ | `>` |
| U+22CC | ⋌ | `<` |
| U+22CD | ⋍ | `~=` |
| U+22CE | ⋎ | `v` |
| U+22CF | ⋏ | `^` |
| U+22D0 | ⋐ | `<` |
| U+22D1 | ⋑ | `>` |
| U+22D2 | ⋒ | `^` |
| U+22D3 | ⋓ | `v` |
| U+22D4 | ⋔ | `+` |
| U+22D5 | ⋕ | `#` |
| U+22D6 | ⋖ | `<` |
| U+22D7 | ⋗ | `>` |
| U+22D8 | ⋘ | `<<<` |
| U+22D9 | ⋙ | `>>>` |
| U+22DA | ⋚ | `=` |
| U+22DB | ⋛ | `=` |
| U+22DC | ⋜ | `=<` |
| U+22DD | ⋝ | `=>` |
| U+22DE | ⋞ | `<` |
| U+22DF | ⋟ | `>` |
| U+22E0 | ⋠ | `<` |
| U+22E1 | ⋡ | `>` |
| U+22E2 | ⋢ | `[` |
| U+22E3 | ⋣ | `]` |
| U+22E4 | ⋤ | `[` |
| U+22E5 | ⋥ | `]` |
| U+22E6 | ⋦ | `<` |
| U+22E7 | ⋧ | `>` |
| U+22E8 | ⋨ | `<` |
| U+22E9 | ⋩ | `>` |
| U+22EA | ⋪ | `<` |
| U+22EB | ⋫ | `>` |
| U+22EC | ⋬ | `<` |
| U+22ED | ⋭ | `>` |
| U+22EE | ⋮ | `\|` |
| U+22F0 | ⋰ | `/` |
| U+22F1 | ⋱ | `\` |
| U+22F2 | ⋲ | `+` |
| U+22F3 | ⋳ | `+` |
| U+22F4 | ⋴ | `+` |
| U+22F5 | ⋵ | `+` |
| U+22F6 | ⋶ | `+` |
| U+22F7 | ⋷ | `+` |
| U+22F8 | ⋸ | `+` |
| U+22F9 | ⋹ | `+` |
| U+22FA | ⋺ | `+` |
| U+22FB | ⋻ | `+` |
| U+22FC | ⋼ | `+` |
| U+22FD | ⋽ | `+` |
| U+22FE | ⋾ | `+` |
| U+22FF | ⋿ | `E` |

### Emojis (1580)

Dingbats, Miscellaneous Symbols, Miscellaneous Symbols and Pictographs, Miscellaneous Technical, Transport and Map. WHOLESALE AnyAscii 0.3.3.

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2713 | ✓ | `v` |
| U+2714 | ✔ | `:heavy_check_mark:` |
| U+2611 | ☑ | `:ballot_box_with_check:` |
| U+2610 | ☐ | `#` |
| U+2612 | ☒ | `x` |
| U+2705 | ✅ | `:white_check_mark:` |
| U+2717 | ✗ | `x` |
| U+2718 | ✘ | `x` |
| U+274C | ❌ | `:x:` |
| U+274E | ❎ | `:negative_squared_cross_mark:` |
| U+26A0 | ⚠ | `:warning:` |
| U+2757 | ❗ | `:exclamation:` |
| U+2755 | ❕ | `:grey_exclamation:` |
| U+26A1 | ⚡ | `:zap:` |
| U+2139 | ℹ | `i` |
| U+1F4A1 | 💡 | `:bulb:` |
| U+2B50 | ⭐ | `:star:` |
| U+1F31F | 🌟 | `:star2:` |
| U+2605 | ★ | `*` |
| U+2606 | ☆ | `*` |
| U+1F525 | 🔥 | `:fire:` |
| U+1F680 | 🚀 | `:rocket:` |
| U+1F41B | 🐛 | `:bug:` |
| U+1F41E | 🐞 | `:lady_beetle:` |
| U+1F4DD | 📝 | `:pencil:` |
| U+270F | ✏ | `:pencil2:` |
| U+1F512 | 🔒 | `:lock:` |
| U+1F513 | 🔓 | `:unlock:` |
| U+1F4C1 | 📁 | `:file_folder:` |
| U+1F4C2 | 📂 | `:open_file_folder:` |
| U+1F4C4 | 📄 | `:page_facing_up:` |
| U+1F4C3 | 📃 | `:page_with_curl:` |
| U+1F44D | 👍 | `:thumbsup:` |
| U+1F44E | 👎 | `:thumbsdown:` |
| U+1F4AC | 💬 | `:speech_balloon:` |
| U+1F4E6 | 📦 | `:package:` |
| U+1F517 | 🔗 | `:link:` |
| U+1F6A7 | 🚧 | `:construction:` |
| U+2699 | ⚙ | `:gear:` |
| U+1F527 | 🔧 | `:wrench:` |
| U+1F5D1 | 🗑 | `:wastebasket:` |
| U+1F310 | 🌐 | `:globe_with_meridians:` |
| U+1F4BB | 💻 | `:computer:` |
| U+1F4F1 | 📱 | `:mobile_phone:` |
| U+1F4E7 | 📧 | `:e_mail:` |
| U+1F4CA | 📊 | `:bar_chart:` |
| U+1F4C8 | 📈 | `:chart_with_upwards_trend:` |
| U+1F4C9 | 📉 | `:chart_with_downwards_trend:` |
| U+2764 | ❤ | `:heart:` |
| U+1F4AF | 💯 | `:100:` |
| U+1F44B | 👋 | `:wave:` |
| U+1F4AA | 💪 | `:muscle:` |
| U+1F4A5 | 💥 | `:boom:` |
| U+1F389 | 🎉 | `:tada:` |
| U+1F3C6 | 🏆 | `:trophy:` |
| U+1F4B0 | 💰 | `:moneybag:` |
| U+231B | ⌛ | `:hourglass:` |
| U+23F3 | ⏳ | `:hourglass_flowing_sand:` |
| U+23F0 | ⏰ | `:alarm_clock:` |
| U+1F504 | 🔄 | `:arrows_counterclockwise:` |
| U+2728 | ✨ | `:sparkles:` |
| U+1F440 | 👀 | `:eyes:` |
| U+1F3AF | 🎯 | `:dart:` |
| U+1F511 | 🔑 | `:key:` |
| U+1F4CC | 📌 | `:pushpin:` |
| U+1F50D | 🔍 | `:mag:` |
| U+2300 | ⌀ | `0` |
| U+2301 | ⌁ | `~` |
| U+2302 | ⌂ | `^` |
| U+2303 | ⌃ | `^` |
| U+2304 | ⌄ | `v` |
| U+2305 | ⌅ | `^` |
| U+2306 | ⌆ | `^` |
| U+2307 | ⌇ | `~` |
| U+2308 | ⌈ | `[` |
| U+2309 | ⌉ | `]` |
| U+230A | ⌊ | `[` |
| U+230B | ⌋ | `]` |
| U+230C | ⌌ | `+` |
| U+230D | ⌍ | `+` |
| U+230E | ⌎ | `+` |
| U+230F | ⌏ | `+` |
| U+2310 | ⌐ | `-` |
| U+2311 | ⌑ | `*` |
| U+2312 | ⌒ | `*` |
| U+2313 | ⌓ | `*` |
| U+2314 | ⌔ | `*` |
| U+2315 | ⌕ | `*` |
| U+2316 | ⌖ | `+` |
| U+2317 | ⌗ | `#` |
| U+2318 | ⌘ | `#` |
| U+2319 | ⌙ | `-` |
| U+231A | ⌚ | `:watch:` |
| U+231C | ⌜ | `+` |
| U+231D | ⌝ | `+` |
| U+231E | ⌞ | `+` |
| U+231F | ⌟ | `+` |
| U+2320 | ⌠ | `(` |
| U+2321 | ⌡ | `)` |
| U+2322 | ⌢ | `(` |
| U+2323 | ⌣ | `)` |
| U+2324 | ⌤ | `^` |
| U+2325 | ⌥ | `*` |
| U+2326 | ⌦ | `>` |
| U+2327 | ⌧ | `x` |
| U+2328 | ⌨ | `:keyboard:` |
| U+2329 | 〈 | `<` |
| U+232A | 〉 | `>` |
| U+232B | ⌫ | `<` |
| U+232C | ⌬ | `#` |
| U+232D | ⌭ | `*` |
| U+232E | ⌮ | `*` |
| U+232F | ⌯ | `*` |
| U+2330 | ⌰ | `*` |
| U+2331 | ⌱ | `*` |
| U+2332 | ⌲ | `*` |
| U+2333 | ⌳ | `*` |
| U+2334 | ⌴ | `*` |
| U+2335 | ⌵ | `*` |
| U+2336 | ⌶ | `I` |
| U+2337 | ⌷ | `#` |
| U+2338 | ⌸ | `=` |
| U+2339 | ⌹ | `:` |
| U+233A | ⌺ | `*` |
| U+233B | ⌻ | `*` |
| U+233C | ⌼ | `*` |
| U+233D | ⌽ | `*` |
| U+233E | ⌾ | `*` |
| U+233F | ⌿ | `/` |
| U+2340 | ⍀ | `\` |
| U+2341 | ⍁ | `/` |
| U+2342 | ⍂ | `\` |
| U+2343 | ⍃ | `<` |
| U+2344 | ⍄ | `>` |
| U+2345 | ⍅ | `<` |
| U+2346 | ⍆ | `>` |
| U+2347 | ⍇ | `<` |
| U+2348 | ⍈ | `>` |
| U+2349 | ⍉ | `0` |
| U+234A | ⍊ | `*` |
| U+234B | ⍋ | `*` |
| U+234C | ⍌ | `v` |
| U+234D | ⍍ | `*` |
| U+234E | ⍎ | `*` |
| U+234F | ⍏ | `^` |
| U+2350 | ⍐ | `^` |
| U+2351 | ⍑ | `*` |
| U+2352 | ⍒ | `*` |
| U+2353 | ⍓ | `^` |
| U+2354 | ⍔ | `*` |
| U+2355 | ⍕ | `*` |
| U+2356 | ⍖ | `v` |
| U+2357 | ⍗ | `v` |
| U+2358 | ⍘ | `'` |
| U+2359 | ⍙ | `*` |
| U+235A | ⍚ | `*` |
| U+235B | ⍛ | `*` |
| U+235C | ⍜ | `*` |
| U+235D | ⍝ | `*` |
| U+235E | ⍞ | `'` |
| U+235F | ⍟ | `*` |
| U+2360 | ⍠ | `:` |
| U+2361 | ⍡ | `*` |
| U+2362 | ⍢ | `*` |
| U+2363 | ⍣ | `*` |
| U+2364 | ⍤ | `*` |
| U+2365 | ⍥ | `*` |
| U+2366 | ⍦ | `*` |
| U+2367 | ⍧ | `*` |
| U+2368 | ⍨ | `~` |
| U+2369 | ⍩ | `>` |
| U+236A | ⍪ | `,` |
| U+236B | ⍫ | `*` |
| U+236C | ⍬ | `0` |
| U+236D | ⍭ | `\|` |
| U+236E | ⍮ | `;` |
| U+236F | ⍯ | `=` |
| U+2370 | ⍰ | `?` |
| U+2371 | ⍱ | `v` |
| U+2372 | ⍲ | `^` |
| U+2373 | ⍳ | `i` |
| U+2374 | ⍴ | `r` |
| U+2375 | ⍵ | `o` |
| U+2376 | ⍶ | `a` |
| U+2377 | ⍷ | `e` |
| U+2378 | ⍸ | `i` |
| U+2379 | ⍹ | `o` |
| U+237A | ⍺ | `a` |
| U+237B | ⍻ | `NAK` |
| U+237C | ⍼ | `+` |
| U+237D | ⍽ | `*` |
| U+237E | ⍾ | `*` |
| U+237F | ⍿ | `\|` |
| U+2380 | ⎀ | `*` |
| U+2381 | ⎁ | `*` |
| U+2382 | ⎂ | `*` |
| U+2383 | ⎃ | `*` |
| U+2384 | ⎄ | `*` |
| U+2385 | ⎅ | `*` |
| U+2386 | ⎆ | `*` |
| U+2387 | ⎇ | `*` |
| U+2388 | ⎈ | `*` |
| U+2389 | ⎉ | `*` |
| U+238A | ⎊ | `*` |
| U+238B | ⎋ | `*` |
| U+238C | ⎌ | `*` |
| U+238D | ⎍ | `*` |
| U+238E | ⎎ | `*` |
| U+238F | ⎏ | `*` |
| U+2390 | ⎐ | `*` |
| U+2391 | ⎑ | `*` |
| U+2392 | ⎒ | `*` |
| U+2393 | ⎓ | `*` |
| U+2394 | ⎔ | `*` |
| U+2395 | ⎕ | `#` |
| U+2396 | ⎖ | `.` |
| U+2397 | ⎗ | `<` |
| U+2398 | ⎘ | `>` |
| U+2399 | ⎙ | `#` |
| U+239A | ⎚ | `#` |
| U+239B | ⎛ | `(` |
| U+239C | ⎜ | `(` |
| U+239D | ⎝ | `(` |
| U+239E | ⎞ | `)` |
| U+239F | ⎟ | `)` |
| U+23A0 | ⎠ | `)` |
| U+23A1 | ⎡ | `[` |
| U+23A2 | ⎢ | `[` |
| U+23A3 | ⎣ | `[` |
| U+23A4 | ⎤ | `]` |
| U+23A5 | ⎥ | `]` |
| U+23A6 | ⎦ | `]` |
| U+23A7 | ⎧ | `{` |
| U+23A8 | ⎨ | `{` |
| U+23A9 | ⎩ | `{` |
| U+23AA | ⎪ | `\|` |
| U+23AB | ⎫ | `}` |
| U+23AC | ⎬ | `}` |
| U+23AD | ⎭ | `}` |
| U+23AE | ⎮ | `\|` |
| U+23AF | ⎯ | `-` |
| U+23B0 | ⎰ | `{` |
| U+23B1 | ⎱ | `{` |
| U+23B2 | ⎲ | `S` |
| U+23B3 | ⎳ | `S` |
| U+23B4 | ⎴ | `[` |
| U+23B5 | ⎵ | `]` |
| U+23B6 | ⎶ | `][` |
| U+23B7 | ⎷ | `/` |
| U+23B8 | ⎸ | `\|` |
| U+23B9 | ⎹ | `\|` |
| U+23BA | ⎺ | `-` |
| U+23BB | ⎻ | `-` |
| U+23BC | ⎼ | `-` |
| U+23BD | ⎽ | `-` |
| U+23BE | ⎾ | `+` |
| U+23BF | ⎿ | `+` |
| U+23C0 | ⏀ | `+` |
| U+23C1 | ⏁ | `+` |
| U+23C2 | ⏂ | `+` |
| U+23C3 | ⏃ | `+` |
| U+23C4 | ⏄ | `+` |
| U+23C5 | ⏅ | `+` |
| U+23C6 | ⏆ | `+` |
| U+23C7 | ⏇ | `+` |
| U+23C8 | ⏈ | `+` |
| U+23C9 | ⏉ | `+` |
| U+23CA | ⏊ | `+` |
| U+23CB | ⏋ | `+` |
| U+23CC | ⏌ | `+` |
| U+23CD | ⏍ | `'` |
| U+23CE | ⏎ | `<` |
| U+23CF | ⏏ | `:eject:` |
| U+23D0 | ⏐ | `\|` |
| U+23D1 | ⏑ | `-` |
| U+23D2 | ⏒ | `-` |
| U+23D3 | ⏓ | `-` |
| U+23D4 | ⏔ | `-` |
| U+23D5 | ⏕ | `-` |
| U+23D6 | ⏖ | `-` |
| U+23D7 | ⏗ | `3` |
| U+23D8 | ⏘ | `4` |
| U+23D9 | ⏙ | `5` |
| U+23DA | ⏚ | `+` |
| U+23DB | ⏛ | `-` |
| U+23DC | ⏜ | `(` |
| U+23DD | ⏝ | `)` |
| U+23DE | ⏞ | `{` |
| U+23DF | ⏟ | `}` |
| U+23E0 | ⏠ | `[` |
| U+23E1 | ⏡ | `]` |
| U+23E2 | ⏢ | `#` |
| U+23E3 | ⏣ | `#` |
| U+23E4 | ⏤ | `-` |
| U+23E5 | ⏥ | `#` |
| U+23E6 | ⏦ | `*` |
| U+23E7 | ⏧ | `*` |
| U+23E8 | ⏨ | `E` |
| U+23E9 | ⏩ | `:fast_forward:` |
| U+23EA | ⏪ | `:rewind:` |
| U+23EB | ⏫ | `:arrow_double_up:` |
| U+23EC | ⏬ | `:arrow_double_down:` |
| U+23ED | ⏭ | `:track_next:` |
| U+23EE | ⏮ | `:track_previous:` |
| U+23EF | ⏯ | `:play_pause:` |
| U+23F1 | ⏱ | `:stopwatch:` |
| U+23F2 | ⏲ | `:timer:` |
| U+23F4 | ⏴ | `<` |
| U+23F5 | ⏵ | `>` |
| U+23F6 | ⏶ | `^` |
| U+23F7 | ⏷ | `v` |
| U+23F8 | ⏸ | `:pause_button:` |
| U+23F9 | ⏹ | `:stop_button:` |
| U+23FA | ⏺ | `:record_button:` |
| U+23FB | ⏻ | `*` |
| U+23FC | ⏼ | `*` |
| U+23FD | ⏽ | `*` |
| U+23FE | ⏾ | `*` |
| U+23FF | ⏿ | `<` |
| U+2600 | ☀ | `:sunny:` |
| U+2601 | ☁ | `:cloud:` |
| U+2602 | ☂ | `:umbrella2:` |
| U+2603 | ☃ | `:snowman2:` |
| U+2604 | ☄ | `:comet:` |
| U+2607 | ☇ | `*` |
| U+2608 | ☈ | `*` |
| U+2609 | ☉ | `*` |
| U+260A | ☊ | `*` |
| U+260B | ☋ | `*` |
| U+260C | ☌ | `0` |
| U+260D | ☍ | `180` |
| U+260E | ☎ | `:telephone:` |
| U+260F | ☏ | `@` |
| U+2613 | ☓ | `X` |
| U+2614 | ☔ | `:umbrella:` |
| U+2615 | ☕ | `:coffee:` |
| U+2616 | ☖ | `W` |
| U+2617 | ☗ | `B` |
| U+2618 | ☘ | `:shamrock:` |
| U+2619 | ☙ | `*` |
| U+261A | ☚ | `<` |
| U+261B | ☛ | `>` |
| U+261C | ☜ | `<` |
| U+261D | ☝ | `:point_up:` |
| U+261E | ☞ | `>` |
| U+261F | ☟ | `v` |
| U+2620 | ☠ | `:skull_crossbones:` |
| U+2621 | ☡ | `Z` |
| U+2622 | ☢ | `:radioactive:` |
| U+2623 | ☣ | `:biohazard:` |
| U+2624 | ☤ | `+` |
| U+2625 | ☥ | `+` |
| U+2626 | ☦ | `:orthodox_cross:` |
| U+2627 | ☧ | `ChR.` |
| U+2628 | ☨ | `+` |
| U+2629 | ☩ | `+` |
| U+262A | ☪ | `:star_and_crescent:` |
| U+262B | ☫ | `*` |
| U+262C | ☬ | `*` |
| U+262D | ☭ | `*` |
| U+262E | ☮ | `:peace:` |
| U+262F | ☯ | `:yin_yang:` |
| U+2630 | ☰ | `Qian` |
| U+2631 | ☱ | `Dui` |
| U+2632 | ☲ | `Li` |
| U+2633 | ☳ | `Zhen` |
| U+2634 | ☴ | `Xun` |
| U+2635 | ☵ | `Kan` |
| U+2636 | ☶ | `Gen` |
| U+2637 | ☷ | `Kun` |
| U+2638 | ☸ | `:wheel_of_dharma:` |
| U+2639 | ☹ | `:frowning2:` |
| U+263A | ☺ | `:relaxed:` |
| U+263B | ☻ | `:)` |
| U+263C | ☼ | `*` |
| U+263D | ☽ | `)` |
| U+263E | ☾ | `(` |
| U+263F | ☿ | `Mercury` |
| U+2640 | ♀ | `:female_sign:` |
| U+2641 | ♁ | `Earth` |
| U+2642 | ♂ | `:male_sign:` |
| U+2643 | ♃ | `Jupiter` |
| U+2644 | ♄ | `Saturn` |
| U+2645 | ♅ | `Uranus` |
| U+2646 | ♆ | `Neptune` |
| U+2647 | ♇ | `Pluto` |
| U+2648 | ♈ | `:aries:` |
| U+2649 | ♉ | `:taurus:` |
| U+264A | ♊ | `:gemini:` |
| U+264B | ♋ | `:cancer:` |
| U+264C | ♌ | `:leo:` |
| U+264D | ♍ | `:virgo:` |
| U+264E | ♎ | `:libra:` |
| U+264F | ♏ | `:scorpius:` |
| U+2650 | ♐ | `:sagittarius:` |
| U+2651 | ♑ | `:capricorn:` |
| U+2652 | ♒ | `:aquarius:` |
| U+2653 | ♓ | `:pisces:` |
| U+2654 | ♔ | `K` |
| U+2655 | ♕ | `Q` |
| U+2656 | ♖ | `R` |
| U+2657 | ♗ | `B` |
| U+2658 | ♘ | `N` |
| U+2659 | ♙ | `P` |
| U+265A | ♚ | `k` |
| U+265B | ♛ | `q` |
| U+265C | ♜ | `r` |
| U+265D | ♝ | `b` |
| U+265E | ♞ | `n` |
| U+265F | ♟ | `:chess_pawn:` |
| U+2660 | ♠ | `:spades:` |
| U+2661 | ♡ | `H` |
| U+2662 | ♢ | `D` |
| U+2663 | ♣ | `:clubs:` |
| U+2664 | ♤ | `S` |
| U+2665 | ♥ | `:hearts:` |
| U+2666 | ♦ | `:diamonds:` |
| U+2667 | ♧ | `C` |
| U+2668 | ♨ | `:hotsprings:` |
| U+2669 | ♩ | `#` |
| U+266A | ♪ | `#` |
| U+266B | ♫ | `#` |
| U+266C | ♬ | `#` |
| U+266D | ♭ | `b` |
| U+266E | ♮ | `#` |
| U+266F | ♯ | `#` |
| U+2670 | ♰ | `+` |
| U+2671 | ♱ | `+` |
| U+2672 | ♲ | `*` |
| U+2673 | ♳ | `1` |
| U+2674 | ♴ | `2` |
| U+2675 | ♵ | `3` |
| U+2676 | ♶ | `4` |
| U+2677 | ♷ | `5` |
| U+2678 | ♸ | `6` |
| U+2679 | ♹ | `7` |
| U+267A | ♺ | `*` |
| U+267B | ♻ | `:recycle:` |
| U+267C | ♼ | `*` |
| U+267D | ♽ | `*` |
| U+267E | ♾ | `:infinity:` |
| U+267F | ♿ | `:wheelchair:` |
| U+2680 | ⚀ | `1` |
| U+2681 | ⚁ | `2` |
| U+2682 | ⚂ | `3` |
| U+2683 | ⚃ | `4` |
| U+2684 | ⚄ | `5` |
| U+2685 | ⚅ | `6` |
| U+2686 | ⚆ | `*` |
| U+2687 | ⚇ | `*` |
| U+2688 | ⚈ | `*` |
| U+2689 | ⚉ | `*` |
| U+268A | ⚊ | `YangYao` |
| U+268B | ⚋ | `YinYao` |
| U+268C | ⚌ | `TaiYang` |
| U+268D | ⚍ | `ShaoYin` |
| U+268E | ⚎ | `ShaoYang` |
| U+268F | ⚏ | `TaiYin` |
| U+2690 | ⚐ | `*` |
| U+2691 | ⚑ | `*` |
| U+2692 | ⚒ | `:hammer_pick:` |
| U+2693 | ⚓ | `:anchor:` |
| U+2694 | ⚔ | `:crossed_swords:` |
| U+2695 | ⚕ | `:medical_symbol:` |
| U+2696 | ⚖ | `:scales:` |
| U+2697 | ⚗ | `:alembic:` |
| U+2698 | ⚘ | `*` |
| U+269A | ⚚ | `*` |
| U+269B | ⚛ | `:atom:` |
| U+269C | ⚜ | `:fleur_de_lis:` |
| U+269D | ⚝ | `*` |
| U+269E | ⚞ | `>` |
| U+269F | ⚟ | `<` |
| U+26A2 | ⚢ | `*` |
| U+26A3 | ⚣ | `*` |
| U+26A4 | ⚤ | `*` |
| U+26A5 | ⚥ | `*` |
| U+26A6 | ⚦ | `*` |
| U+26A7 | ⚧ | `:transgender_symbol:` |
| U+26A8 | ⚨ | `*` |
| U+26A9 | ⚩ | `*` |
| U+26AA | ⚪ | `:white_circle:` |
| U+26AB | ⚫ | `:black_circle:` |
| U+26AC | ⚬ | `*` |
| U+26AD | ⚭ | `*` |
| U+26AE | ⚮ | `*` |
| U+26AF | ⚯ | `*` |
| U+26B0 | ⚰ | `:coffin:` |
| U+26B1 | ⚱ | `:urn:` |
| U+26B2 | ⚲ | `*` |
| U+26B3 | ⚳ | `*` |
| U+26B4 | ⚴ | `*` |
| U+26B5 | ⚵ | `*` |
| U+26B6 | ⚶ | `*` |
| U+26B7 | ⚷ | `*` |
| U+26B8 | ⚸ | `*` |
| U+26B9 | ⚹ | `*` |
| U+26BA | ⚺ | `30` |
| U+26BB | ⚻ | `150` |
| U+26BC | ⚼ | `135` |
| U+26BD | ⚽ | `:soccer:` |
| U+26BE | ⚾ | `:baseball:` |
| U+26BF | ⚿ | `*` |
| U+26C0 | ⛀ | `M` |
| U+26C1 | ⛁ | `K` |
| U+26C2 | ⛂ | `m` |
| U+26C3 | ⛃ | `k` |
| U+26C4 | ⛄ | `:snowman:` |
| U+26C5 | ⛅ | `:partly_sunny:` |
| U+26C6 | ⛆ | `*` |
| U+26C7 | ⛇ | `*` |
| U+26C8 | ⛈ | `:thunder_cloud_rain:` |
| U+26C9 | ⛉ | `w` |
| U+26CA | ⛊ | `b` |
| U+26CB | ⛋ | `#` |
| U+26CC | ⛌ | `X` |
| U+26CD | ⛍ | `*` |
| U+26CE | ⛎ | `:ophiuchus:` |
| U+26CF | ⛏ | `:pick:` |
| U+26D0 | ⛐ | `*` |
| U+26D1 | ⛑ | `:helmet_with_cross:` |
| U+26D2 | ⛒ | `*` |
| U+26D3 | ⛓ | `:chains:` |
| U+26D4 | ⛔ | `:no_entry:` |
| U+26D5 | ⛕ | `*` |
| U+26D6 | ⛖ | `*` |
| U+26D7 | ⛗ | `*` |
| U+26D8 | ⛘ | `*` |
| U+26D9 | ⛙ | `*` |
| U+26DA | ⛚ | `*` |
| U+26DB | ⛛ | `v` |
| U+26DC | ⛜ | `*` |
| U+26DD | ⛝ | `X` |
| U+26DE | ⛞ | `\` |
| U+26DF | ⛟ | `*` |
| U+26E0 | ⛠ | `*` |
| U+26E1 | ⛡ | `*` |
| U+26E2 | ⛢ | `Uranus` |
| U+26E3 | ⛣ | `*` |
| U+26E4 | ⛤ | `*` |
| U+26E5 | ⛥ | `*` |
| U+26E6 | ⛦ | `*` |
| U+26E7 | ⛧ | `*` |
| U+26E8 | ⛨ | `+` |
| U+26E9 | ⛩ | `:shinto_shrine:` |
| U+26EA | ⛪ | `:church:` |
| U+26EB | ⛫ | `*` |
| U+26EC | ⛬ | `*` |
| U+26ED | ⛭ | `*` |
| U+26EE | ⛮ | `*` |
| U+26EF | ⛯ | `*` |
| U+26F0 | ⛰ | `:mountain:` |
| U+26F1 | ⛱ | `:beach_umbrella:` |
| U+26F2 | ⛲ | `:fountain:` |
| U+26F3 | ⛳ | `:golf:` |
| U+26F4 | ⛴ | `:ferry:` |
| U+26F5 | ⛵ | `:sailboat:` |
| U+26F6 | ⛶ | `#` |
| U+26F7 | ⛷ | `:skier:` |
| U+26F8 | ⛸ | `:ice_skate:` |
| U+26F9 | ⛹ | `:person_bouncing_ball:` |
| U+26FA | ⛺ | `:tent:` |
| U+26FB | ⛻ | `*` |
| U+26FC | ⛼ | `*` |
| U+26FD | ⛽ | `:fuelpump:` |
| U+26FE | ⛾ | `*` |
| U+26FF | ⛿ | `*` |
| U+2700 | ✀ | `<` |
| U+2701 | ✁ | `<` |
| U+2702 | ✂ | `:scissors:` |
| U+2703 | ✃ | `<` |
| U+2704 | ✄ | `<` |
| U+2706 | ✆ | `@` |
| U+2707 | ✇ | `@` |
| U+2708 | ✈ | `:airplane:` |
| U+2709 | ✉ | `:envelope:` |
| U+270A | ✊ | `:fist:` |
| U+270B | ✋ | `:raised_hand:` |
| U+270C | ✌ | `:v:` |
| U+270D | ✍ | `:writing_hand:` |
| U+270E | ✎ | `\` |
| U+2710 | ✐ | `/` |
| U+2711 | ✑ | `>` |
| U+2712 | ✒ | `:black_nib:` |
| U+2715 | ✕ | `X` |
| U+2716 | ✖ | `:heavy_multiplication_x:` |
| U+2719 | ✙ | `+` |
| U+271A | ✚ | `+` |
| U+271B | ✛ | `+` |
| U+271C | ✜ | `+` |
| U+271D | ✝ | `:cross:` |
| U+271E | ✞ | `+` |
| U+271F | ✟ | `+` |
| U+2720 | ✠ | `+` |
| U+2721 | ✡ | `:star_of_david:` |
| U+2722 | ✢ | `*` |
| U+2723 | ✣ | `*` |
| U+2724 | ✤ | `*` |
| U+2725 | ✥ | `*` |
| U+2726 | ✦ | `*` |
| U+2727 | ✧ | `*` |
| U+2729 | ✩ | `*` |
| U+272A | ✪ | `*` |
| U+272B | ✫ | `*` |
| U+272C | ✬ | `*` |
| U+272D | ✭ | `*` |
| U+272E | ✮ | `*` |
| U+272F | ✯ | `*` |
| U+2730 | ✰ | `*` |
| U+2731 | ✱ | `*` |
| U+2732 | ✲ | `*` |
| U+2733 | ✳ | `:eight_spoked_asterisk:` |
| U+2734 | ✴ | `:eight_pointed_black_star:` |
| U+2735 | ✵ | `*` |
| U+2736 | ✶ | `*` |
| U+2737 | ✷ | `*` |
| U+2738 | ✸ | `*` |
| U+2739 | ✹ | `*` |
| U+273A | ✺ | `*` |
| U+273B | ✻ | `*` |
| U+273C | ✼ | `*` |
| U+273D | ✽ | `*` |
| U+273E | ✾ | `*` |
| U+273F | ✿ | `*` |
| U+2740 | ❀ | `*` |
| U+2741 | ❁ | `*` |
| U+2742 | ❂ | `*` |
| U+2743 | ❃ | `*` |
| U+2744 | ❄ | `:snowflake:` |
| U+2745 | ❅ | `*` |
| U+2746 | ❆ | `*` |
| U+2747 | ❇ | `:sparkle:` |
| U+2748 | ❈ | `*` |
| U+2749 | ❉ | `*` |
| U+274A | ❊ | `*` |
| U+274B | ❋ | `*` |
| U+274D | ❍ | `*` |
| U+274F | ❏ | `#` |
| U+2750 | ❐ | `#` |
| U+2751 | ❑ | `#` |
| U+2752 | ❒ | `#` |
| U+2753 | ❓ | `:question:` |
| U+2754 | ❔ | `:grey_question:` |
| U+2756 | ❖ | `*` |
| U+2758 | ❘ | `\|` |
| U+2759 | ❙ | `\|` |
| U+275A | ❚ | `\|` |
| U+275B | ❛ | `'` |
| U+275C | ❜ | `'` |
| U+275D | ❝ | `"` |
| U+275E | ❞ | `"` |
| U+275F | ❟ | `'` |
| U+2760 | ❠ | `"` |
| U+2761 | ❡ | `P` |
| U+2762 | ❢ | `!` |
| U+2763 | ❣ | `:heart_exclamation:` |
| U+2765 | ❥ | `*` |
| U+2766 | ❦ | `*` |
| U+2767 | ❧ | `*` |
| U+2768 | ❨ | `(` |
| U+2769 | ❩ | `)` |
| U+276A | ❪ | `(` |
| U+276B | ❫ | `)` |
| U+276C | ❬ | `<` |
| U+276D | ❭ | `>` |
| U+276E | ❮ | `<` |
| U+276F | ❯ | `>` |
| U+2770 | ❰ | `<` |
| U+2771 | ❱ | `>` |
| U+2772 | ❲ | `(` |
| U+2773 | ❳ | `)` |
| U+2774 | ❴ | `{` |
| U+2775 | ❵ | `}` |
| U+2776 | ❶ | `1` |
| U+2777 | ❷ | `2` |
| U+2778 | ❸ | `3` |
| U+2779 | ❹ | `4` |
| U+277A | ❺ | `5` |
| U+277B | ❻ | `6` |
| U+277C | ❼ | `7` |
| U+277D | ❽ | `8` |
| U+277E | ❾ | `9` |
| U+277F | ❿ | `10` |
| U+2780 | ➀ | `1` |
| U+2781 | ➁ | `2` |
| U+2782 | ➂ | `3` |
| U+2783 | ➃ | `4` |
| U+2784 | ➄ | `5` |
| U+2785 | ➅ | `6` |
| U+2786 | ➆ | `7` |
| U+2787 | ➇ | `8` |
| U+2788 | ➈ | `9` |
| U+2789 | ➉ | `10` |
| U+278A | ➊ | `1` |
| U+278B | ➋ | `2` |
| U+278C | ➌ | `3` |
| U+278D | ➍ | `4` |
| U+278E | ➎ | `5` |
| U+278F | ➏ | `6` |
| U+2790 | ➐ | `7` |
| U+2791 | ➑ | `8` |
| U+2792 | ➒ | `9` |
| U+2793 | ➓ | `10` |
| U+2795 | ➕ | `:heavy_plus_sign:` |
| U+2796 | ➖ | `:heavy_minus_sign:` |
| U+2797 | ➗ | `:heavy_division_sign:` |
| U+2798 | ➘ | `\` |
| U+2799 | ➙ | `>` |
| U+279A | ➚ | `/` |
| U+279B | ➛ | `>` |
| U+279F | ➟ | `>` |
| U+27A2 | ➢ | `>` |
| U+27A3 | ➣ | `>` |
| U+27A5 | ➥ | `>` |
| U+27A6 | ➦ | `>` |
| U+27A7 | ➧ | `>` |
| U+27A8 | ➨ | `>` |
| U+27A9 | ➩ | `>` |
| U+27AA | ➪ | `>` |
| U+27AB | ➫ | `>` |
| U+27AC | ➬ | `>` |
| U+27AD | ➭ | `>` |
| U+27AE | ➮ | `>` |
| U+27AF | ➯ | `>` |
| U+27B0 | ➰ | `:curly_loop:` |
| U+27B1 | ➱ | `>` |
| U+27B2 | ➲ | `>` |
| U+27B3 | ➳ | `>` |
| U+27B4 | ➴ | `\` |
| U+27B5 | ➵ | `>` |
| U+27B6 | ➶ | `/` |
| U+27B7 | ➷ | `\` |
| U+27B8 | ➸ | `>` |
| U+27B9 | ➹ | `/` |
| U+27BA | ➺ | `>` |
| U+27BB | ➻ | `>` |
| U+27BC | ➼ | `>` |
| U+27BD | ➽ | `>` |
| U+27BE | ➾ | `>` |
| U+27BF | ➿ | `:loop:` |
| U+1F300 | 🌀 | `:cyclone:` |
| U+1F301 | 🌁 | `:foggy:` |
| U+1F302 | 🌂 | `:closed_umbrella:` |
| U+1F303 | 🌃 | `:night_with_stars:` |
| U+1F304 | 🌄 | `:sunrise_over_mountains:` |
| U+1F305 | 🌅 | `:sunrise:` |
| U+1F306 | 🌆 | `:city_dusk:` |
| U+1F307 | 🌇 | `:city_sunset:` |
| U+1F308 | 🌈 | `:rainbow:` |
| U+1F309 | 🌉 | `:bridge_at_night:` |
| U+1F30A | 🌊 | `:ocean:` |
| U+1F30B | 🌋 | `:volcano:` |
| U+1F30C | 🌌 | `:milky_way:` |
| U+1F30D | 🌍 | `:earth_africa:` |
| U+1F30E | 🌎 | `:earth_americas:` |
| U+1F30F | 🌏 | `:earth_asia:` |
| U+1F311 | 🌑 | `:new_moon:` |
| U+1F312 | 🌒 | `:waxing_crescent_moon:` |
| U+1F313 | 🌓 | `:first_quarter_moon:` |
| U+1F314 | 🌔 | `:waxing_gibbous_moon:` |
| U+1F315 | 🌕 | `:full_moon:` |
| U+1F316 | 🌖 | `:waning_gibbous_moon:` |
| U+1F317 | 🌗 | `:last_quarter_moon:` |
| U+1F318 | 🌘 | `:waning_crescent_moon:` |
| U+1F319 | 🌙 | `:crescent_moon:` |
| U+1F31A | 🌚 | `:new_moon_with_face:` |
| U+1F31B | 🌛 | `:first_quarter_moon_with_face:` |
| U+1F31C | 🌜 | `:last_quarter_moon_with_face:` |
| U+1F31D | 🌝 | `:full_moon_with_face:` |
| U+1F31E | 🌞 | `:sun_with_face:` |
| U+1F320 | 🌠 | `:stars:` |
| U+1F321 | 🌡 | `:thermometer:` |
| U+1F322 | 🌢 | `*` |
| U+1F323 | 🌣 | `*` |
| U+1F324 | 🌤 | `:white_sun_small_cloud:` |
| U+1F325 | 🌥 | `:white_sun_cloud:` |
| U+1F326 | 🌦 | `:white_sun_rain_cloud:` |
| U+1F327 | 🌧 | `:cloud_rain:` |
| U+1F328 | 🌨 | `:cloud_snow:` |
| U+1F329 | 🌩 | `:cloud_lightning:` |
| U+1F32A | 🌪 | `:cloud_tornado:` |
| U+1F32B | 🌫 | `:fog:` |
| U+1F32C | 🌬 | `:wind_blowing_face:` |
| U+1F32D | 🌭 | `:hotdog:` |
| U+1F32E | 🌮 | `:taco:` |
| U+1F32F | 🌯 | `:burrito:` |
| U+1F330 | 🌰 | `:chestnut:` |
| U+1F331 | 🌱 | `:seedling:` |
| U+1F332 | 🌲 | `:evergreen_tree:` |
| U+1F333 | 🌳 | `:deciduous_tree:` |
| U+1F334 | 🌴 | `:palm_tree:` |
| U+1F335 | 🌵 | `:cactus:` |
| U+1F336 | 🌶 | `:hot_pepper:` |
| U+1F337 | 🌷 | `:tulip:` |
| U+1F338 | 🌸 | `:cherry_blossom:` |
| U+1F339 | 🌹 | `:rose:` |
| U+1F33A | 🌺 | `:hibiscus:` |
| U+1F33B | 🌻 | `:sunflower:` |
| U+1F33C | 🌼 | `:blossom:` |
| U+1F33D | 🌽 | `:corn:` |
| U+1F33E | 🌾 | `:ear_of_rice:` |
| U+1F33F | 🌿 | `:herb:` |
| U+1F340 | 🍀 | `:four_leaf_clover:` |
| U+1F341 | 🍁 | `:maple_leaf:` |
| U+1F342 | 🍂 | `:fallen_leaf:` |
| U+1F343 | 🍃 | `:leaves:` |
| U+1F344 | 🍄 | `:mushroom:` |
| U+1F345 | 🍅 | `:tomato:` |
| U+1F346 | 🍆 | `:eggplant:` |
| U+1F347 | 🍇 | `:grapes:` |
| U+1F348 | 🍈 | `:melon:` |
| U+1F349 | 🍉 | `:watermelon:` |
| U+1F34A | 🍊 | `:tangerine:` |
| U+1F34B | 🍋 | `:lemon:` |
| U+1F34C | 🍌 | `:banana:` |
| U+1F34D | 🍍 | `:pineapple:` |
| U+1F34E | 🍎 | `:apple:` |
| U+1F34F | 🍏 | `:green_apple:` |
| U+1F350 | 🍐 | `:pear:` |
| U+1F351 | 🍑 | `:peach:` |
| U+1F352 | 🍒 | `:cherries:` |
| U+1F353 | 🍓 | `:strawberry:` |
| U+1F354 | 🍔 | `:hamburger:` |
| U+1F355 | 🍕 | `:pizza:` |
| U+1F356 | 🍖 | `:meat_on_bone:` |
| U+1F357 | 🍗 | `:poultry_leg:` |
| U+1F358 | 🍘 | `:rice_cracker:` |
| U+1F359 | 🍙 | `:rice_ball:` |
| U+1F35A | 🍚 | `:rice:` |
| U+1F35B | 🍛 | `:curry:` |
| U+1F35C | 🍜 | `:ramen:` |
| U+1F35D | 🍝 | `:spaghetti:` |
| U+1F35E | 🍞 | `:bread:` |
| U+1F35F | 🍟 | `:fries:` |
| U+1F360 | 🍠 | `:sweet_potato:` |
| U+1F361 | 🍡 | `:dango:` |
| U+1F362 | 🍢 | `:oden:` |
| U+1F363 | 🍣 | `:sushi:` |
| U+1F364 | 🍤 | `:fried_shrimp:` |
| U+1F365 | 🍥 | `:fish_cake:` |
| U+1F366 | 🍦 | `:icecream:` |
| U+1F367 | 🍧 | `:shaved_ice:` |
| U+1F368 | 🍨 | `:ice_cream:` |
| U+1F369 | 🍩 | `:doughnut:` |
| U+1F36A | 🍪 | `:cookie:` |
| U+1F36B | 🍫 | `:chocolate_bar:` |
| U+1F36C | 🍬 | `:candy:` |
| U+1F36D | 🍭 | `:lollipop:` |
| U+1F36E | 🍮 | `:custard:` |
| U+1F36F | 🍯 | `:honey_pot:` |
| U+1F370 | 🍰 | `:cake:` |
| U+1F371 | 🍱 | `:bento:` |
| U+1F372 | 🍲 | `:stew:` |
| U+1F373 | 🍳 | `:cooking:` |
| U+1F374 | 🍴 | `:fork_and_knife:` |
| U+1F375 | 🍵 | `:tea:` |
| U+1F376 | 🍶 | `:sake:` |
| U+1F377 | 🍷 | `:wine_glass:` |
| U+1F378 | 🍸 | `:cocktail:` |
| U+1F379 | 🍹 | `:tropical_drink:` |
| U+1F37A | 🍺 | `:beer:` |
| U+1F37B | 🍻 | `:beers:` |
| U+1F37C | 🍼 | `:baby_bottle:` |
| U+1F37D | 🍽 | `:fork_knife_plate:` |
| U+1F37E | 🍾 | `:champagne:` |
| U+1F37F | 🍿 | `:popcorn:` |
| U+1F380 | 🎀 | `:ribbon:` |
| U+1F381 | 🎁 | `:gift:` |
| U+1F382 | 🎂 | `:birthday:` |
| U+1F383 | 🎃 | `:jack_o_lantern:` |
| U+1F384 | 🎄 | `:christmas_tree:` |
| U+1F385 | 🎅 | `:santa:` |
| U+1F386 | 🎆 | `:fireworks:` |
| U+1F387 | 🎇 | `:sparkler:` |
| U+1F388 | 🎈 | `:balloon:` |
| U+1F38A | 🎊 | `:confetti_ball:` |
| U+1F38B | 🎋 | `:tanabata_tree:` |
| U+1F38C | 🎌 | `:crossed_flags:` |
| U+1F38D | 🎍 | `:bamboo:` |
| U+1F38E | 🎎 | `:dolls:` |
| U+1F38F | 🎏 | `:flags:` |
| U+1F390 | 🎐 | `:wind_chime:` |
| U+1F391 | 🎑 | `:rice_scene:` |
| U+1F392 | 🎒 | `:school_satchel:` |
| U+1F393 | 🎓 | `:mortar_board:` |
| U+1F394 | 🎔 | `*` |
| U+1F395 | 🎕 | `*` |
| U+1F396 | 🎖 | `:military_medal:` |
| U+1F397 | 🎗 | `:reminder_ribbon:` |
| U+1F398 | 🎘 | `*` |
| U+1F399 | 🎙 | `:microphone2:` |
| U+1F39A | 🎚 | `:level_slider:` |
| U+1F39B | 🎛 | `:control_knobs:` |
| U+1F39C | 🎜 | `#` |
| U+1F39D | 🎝 | `#` |
| U+1F39E | 🎞 | `:film_frames:` |
| U+1F39F | 🎟 | `:tickets:` |
| U+1F3A0 | 🎠 | `:carousel_horse:` |
| U+1F3A1 | 🎡 | `:ferris_wheel:` |
| U+1F3A2 | 🎢 | `:roller_coaster:` |
| U+1F3A3 | 🎣 | `:fishing_pole_and_fish:` |
| U+1F3A4 | 🎤 | `:microphone:` |
| U+1F3A5 | 🎥 | `:movie_camera:` |
| U+1F3A6 | 🎦 | `:cinema:` |
| U+1F3A7 | 🎧 | `:headphones:` |
| U+1F3A8 | 🎨 | `:art:` |
| U+1F3A9 | 🎩 | `:tophat:` |
| U+1F3AA | 🎪 | `:circus_tent:` |
| U+1F3AB | 🎫 | `:ticket:` |
| U+1F3AC | 🎬 | `:clapper:` |
| U+1F3AD | 🎭 | `:performing_arts:` |
| U+1F3AE | 🎮 | `:video_game:` |
| U+1F3B0 | 🎰 | `:slot_machine:` |
| U+1F3B1 | 🎱 | `:8ball:` |
| U+1F3B2 | 🎲 | `:game_die:` |
| U+1F3B3 | 🎳 | `:bowling:` |
| U+1F3B4 | 🎴 | `:flower_playing_cards:` |
| U+1F3B5 | 🎵 | `:musical_note:` |
| U+1F3B6 | 🎶 | `:notes:` |
| U+1F3B7 | 🎷 | `:saxophone:` |
| U+1F3B8 | 🎸 | `:guitar:` |
| U+1F3B9 | 🎹 | `:musical_keyboard:` |
| U+1F3BA | 🎺 | `:trumpet:` |
| U+1F3BB | 🎻 | `:violin:` |
| U+1F3BC | 🎼 | `:musical_score:` |
| U+1F3BD | 🎽 | `:running_shirt_with_sash:` |
| U+1F3BE | 🎾 | `:tennis:` |
| U+1F3BF | 🎿 | `:ski:` |
| U+1F3C0 | 🏀 | `:basketball:` |
| U+1F3C1 | 🏁 | `:checkered_flag:` |
| U+1F3C2 | 🏂 | `:snowboarder:` |
| U+1F3C3 | 🏃 | `:person_running:` |
| U+1F3C4 | 🏄 | `:person_surfing:` |
| U+1F3C5 | 🏅 | `:medal:` |
| U+1F3C7 | 🏇 | `:horse_racing:` |
| U+1F3C8 | 🏈 | `:football:` |
| U+1F3C9 | 🏉 | `:rugby_football:` |
| U+1F3CA | 🏊 | `:person_swimming:` |
| U+1F3CB | 🏋 | `:person_lifting_weights:` |
| U+1F3CC | 🏌 | `:person_golfing:` |
| U+1F3CD | 🏍 | `:motorcycle:` |
| U+1F3CE | 🏎 | `:race_car:` |
| U+1F3CF | 🏏 | `:cricket_game:` |
| U+1F3D0 | 🏐 | `:volleyball:` |
| U+1F3D1 | 🏑 | `:field_hockey:` |
| U+1F3D2 | 🏒 | `:hockey:` |
| U+1F3D3 | 🏓 | `:ping_pong:` |
| U+1F3D4 | 🏔 | `:mountain_snow:` |
| U+1F3D5 | 🏕 | `:camping:` |
| U+1F3D6 | 🏖 | `:beach:` |
| U+1F3D7 | 🏗 | `:construction_site:` |
| U+1F3D8 | 🏘 | `:homes:` |
| U+1F3D9 | 🏙 | `:cityscape:` |
| U+1F3DA | 🏚 | `:house_abandoned:` |
| U+1F3DB | 🏛 | `:classical_building:` |
| U+1F3DC | 🏜 | `:desert:` |
| U+1F3DD | 🏝 | `:island:` |
| U+1F3DE | 🏞 | `:park:` |
| U+1F3DF | 🏟 | `:stadium:` |
| U+1F3E0 | 🏠 | `:house:` |
| U+1F3E1 | 🏡 | `:house_with_garden:` |
| U+1F3E2 | 🏢 | `:office:` |
| U+1F3E3 | 🏣 | `:post_office:` |
| U+1F3E4 | 🏤 | `:european_post_office:` |
| U+1F3E5 | 🏥 | `:hospital:` |
| U+1F3E6 | 🏦 | `:bank:` |
| U+1F3E7 | 🏧 | `:atm:` |
| U+1F3E8 | 🏨 | `:hotel:` |
| U+1F3E9 | 🏩 | `:love_hotel:` |
| U+1F3EA | 🏪 | `:convenience_store:` |
| U+1F3EB | 🏫 | `:school:` |
| U+1F3EC | 🏬 | `:department_store:` |
| U+1F3ED | 🏭 | `:factory:` |
| U+1F3EE | 🏮 | `:izakaya_lantern:` |
| U+1F3EF | 🏯 | `:japanese_castle:` |
| U+1F3F0 | 🏰 | `:european_castle:` |
| U+1F3F1 | 🏱 | `*` |
| U+1F3F2 | 🏲 | `*` |
| U+1F3F3 | 🏳 | `:flag_white:` |
| U+1F3F4 | 🏴 | `:flag_black:` |
| U+1F3F5 | 🏵 | `:rosette:` |
| U+1F3F6 | 🏶 | `*` |
| U+1F3F7 | 🏷 | `:label:` |
| U+1F3F8 | 🏸 | `:badminton:` |
| U+1F3F9 | 🏹 | `:bow_and_arrow:` |
| U+1F3FA | 🏺 | `:amphora:` |
| U+1F400 | 🐀 | `:rat:` |
| U+1F401 | 🐁 | `:mouse2:` |
| U+1F402 | 🐂 | `:ox:` |
| U+1F403 | 🐃 | `:water_buffalo:` |
| U+1F404 | 🐄 | `:cow2:` |
| U+1F405 | 🐅 | `:tiger2:` |
| U+1F406 | 🐆 | `:leopard:` |
| U+1F407 | 🐇 | `:rabbit2:` |
| U+1F408 | 🐈 | `:cat2:` |
| U+1F409 | 🐉 | `:dragon:` |
| U+1F40A | 🐊 | `:crocodile:` |
| U+1F40B | 🐋 | `:whale2:` |
| U+1F40C | 🐌 | `:snail:` |
| U+1F40D | 🐍 | `:snake:` |
| U+1F40E | 🐎 | `:racehorse:` |
| U+1F40F | 🐏 | `:ram:` |
| U+1F410 | 🐐 | `:goat:` |
| U+1F411 | 🐑 | `:sheep:` |
| U+1F412 | 🐒 | `:monkey:` |
| U+1F413 | 🐓 | `:rooster:` |
| U+1F414 | 🐔 | `:chicken:` |
| U+1F415 | 🐕 | `:dog2:` |
| U+1F416 | 🐖 | `:pig2:` |
| U+1F417 | 🐗 | `:boar:` |
| U+1F418 | 🐘 | `:elephant:` |
| U+1F419 | 🐙 | `:octopus:` |
| U+1F41A | 🐚 | `:shell:` |
| U+1F41C | 🐜 | `:ant:` |
| U+1F41D | 🐝 | `:bee:` |
| U+1F41F | 🐟 | `:fish:` |
| U+1F420 | 🐠 | `:tropical_fish:` |
| U+1F421 | 🐡 | `:blowfish:` |
| U+1F422 | 🐢 | `:turtle:` |
| U+1F423 | 🐣 | `:hatching_chick:` |
| U+1F424 | 🐤 | `:baby_chick:` |
| U+1F425 | 🐥 | `:hatched_chick:` |
| U+1F426 | 🐦 | `:bird:` |
| U+1F427 | 🐧 | `:penguin:` |
| U+1F428 | 🐨 | `:koala:` |
| U+1F429 | 🐩 | `:poodle:` |
| U+1F42A | 🐪 | `:dromedary_camel:` |
| U+1F42B | 🐫 | `:camel:` |
| U+1F42C | 🐬 | `:dolphin:` |
| U+1F42D | 🐭 | `:mouse:` |
| U+1F42E | 🐮 | `:cow:` |
| U+1F42F | 🐯 | `:tiger:` |
| U+1F430 | 🐰 | `:rabbit:` |
| U+1F431 | 🐱 | `:cat:` |
| U+1F432 | 🐲 | `:dragon_face:` |
| U+1F433 | 🐳 | `:whale:` |
| U+1F434 | 🐴 | `:horse:` |
| U+1F435 | 🐵 | `:monkey_face:` |
| U+1F436 | 🐶 | `:dog:` |
| U+1F437 | 🐷 | `:pig:` |
| U+1F438 | 🐸 | `:frog:` |
| U+1F439 | 🐹 | `:hamster:` |
| U+1F43A | 🐺 | `:wolf:` |
| U+1F43B | 🐻 | `:bear:` |
| U+1F43C | 🐼 | `:panda_face:` |
| U+1F43D | 🐽 | `:pig_nose:` |
| U+1F43E | 🐾 | `:feet:` |
| U+1F43F | 🐿 | `:chipmunk:` |
| U+1F441 | 👁 | `:eye:` |
| U+1F442 | 👂 | `:ear:` |
| U+1F443 | 👃 | `:nose:` |
| U+1F444 | 👄 | `:lips:` |
| U+1F445 | 👅 | `:tongue:` |
| U+1F446 | 👆 | `:point_up_2:` |
| U+1F447 | 👇 | `:point_down:` |
| U+1F448 | 👈 | `:point_left:` |
| U+1F449 | 👉 | `:point_right:` |
| U+1F44A | 👊 | `:punch:` |
| U+1F44C | 👌 | `:ok_hand:` |
| U+1F44F | 👏 | `:clap:` |
| U+1F450 | 👐 | `:open_hands:` |
| U+1F451 | 👑 | `:crown:` |
| U+1F452 | 👒 | `:womans_hat:` |
| U+1F453 | 👓 | `:eyeglasses:` |
| U+1F454 | 👔 | `:necktie:` |
| U+1F455 | 👕 | `:shirt:` |
| U+1F456 | 👖 | `:jeans:` |
| U+1F457 | 👗 | `:dress:` |
| U+1F458 | 👘 | `:kimono:` |
| U+1F459 | 👙 | `:bikini:` |
| U+1F45A | 👚 | `:womans_clothes:` |
| U+1F45B | 👛 | `:purse:` |
| U+1F45C | 👜 | `:handbag:` |
| U+1F45D | 👝 | `:pouch:` |
| U+1F45E | 👞 | `:mans_shoe:` |
| U+1F45F | 👟 | `:athletic_shoe:` |
| U+1F460 | 👠 | `:high_heel:` |
| U+1F461 | 👡 | `:sandal:` |
| U+1F462 | 👢 | `:boot:` |
| U+1F463 | 👣 | `:footprints:` |
| U+1F464 | 👤 | `:bust_in_silhouette:` |
| U+1F465 | 👥 | `:busts_in_silhouette:` |
| U+1F466 | 👦 | `:boy:` |
| U+1F467 | 👧 | `:girl:` |
| U+1F468 | 👨 | `:man:` |
| U+1F469 | 👩 | `:woman:` |
| U+1F46A | 👪 | `:family:` |
| U+1F46B | 👫 | `:couple:` |
| U+1F46C | 👬 | `:two_men_holding_hands:` |
| U+1F46D | 👭 | `:two_women_holding_hands:` |
| U+1F46E | 👮 | `:police_officer:` |
| U+1F46F | 👯 | `:people_with_bunny_ears_partying:` |
| U+1F470 | 👰 | `:person_with_veil:` |
| U+1F471 | 👱 | `:blond_haired_person:` |
| U+1F472 | 👲 | `:man_with_chinese_cap:` |
| U+1F473 | 👳 | `:person_wearing_turban:` |
| U+1F474 | 👴 | `:older_man:` |
| U+1F475 | 👵 | `:older_woman:` |
| U+1F476 | 👶 | `:baby:` |
| U+1F477 | 👷 | `:construction_worker:` |
| U+1F478 | 👸 | `:princess:` |
| U+1F479 | 👹 | `:japanese_ogre:` |
| U+1F47A | 👺 | `:japanese_goblin:` |
| U+1F47B | 👻 | `:ghost:` |
| U+1F47C | 👼 | `:angel:` |
| U+1F47D | 👽 | `:alien:` |
| U+1F47E | 👾 | `:space_invader:` |
| U+1F47F | 👿 | `:imp:` |
| U+1F480 | 💀 | `:skull:` |
| U+1F481 | 💁 | `:person_tipping_hand:` |
| U+1F482 | 💂 | `:guard:` |
| U+1F483 | 💃 | `:dancer:` |
| U+1F484 | 💄 | `:lipstick:` |
| U+1F485 | 💅 | `:nail_care:` |
| U+1F486 | 💆 | `:person_getting_massage:` |
| U+1F487 | 💇 | `:person_getting_haircut:` |
| U+1F488 | 💈 | `:barber:` |
| U+1F489 | 💉 | `:syringe:` |
| U+1F48A | 💊 | `:pill:` |
| U+1F48B | 💋 | `:kiss:` |
| U+1F48C | 💌 | `:love_letter:` |
| U+1F48D | 💍 | `:ring:` |
| U+1F48E | 💎 | `:gem:` |
| U+1F48F | 💏 | `:couplekiss:` |
| U+1F490 | 💐 | `:bouquet:` |
| U+1F491 | 💑 | `:couple_with_heart:` |
| U+1F492 | 💒 | `:wedding:` |
| U+1F493 | 💓 | `:heartbeat:` |
| U+1F494 | 💔 | `:broken_heart:` |
| U+1F495 | 💕 | `:two_hearts:` |
| U+1F496 | 💖 | `:sparkling_heart:` |
| U+1F497 | 💗 | `:heartpulse:` |
| U+1F498 | 💘 | `:cupid:` |
| U+1F499 | 💙 | `:blue_heart:` |
| U+1F49A | 💚 | `:green_heart:` |
| U+1F49B | 💛 | `:yellow_heart:` |
| U+1F49C | 💜 | `:purple_heart:` |
| U+1F49D | 💝 | `:gift_heart:` |
| U+1F49E | 💞 | `:revolving_hearts:` |
| U+1F49F | 💟 | `:heart_decoration:` |
| U+1F4A0 | 💠 | `:diamond_shape_with_a_dot_inside:` |
| U+1F4A2 | 💢 | `:anger:` |
| U+1F4A3 | 💣 | `:bomb:` |
| U+1F4A4 | 💤 | `:zzz:` |
| U+1F4A6 | 💦 | `:sweat_drops:` |
| U+1F4A7 | 💧 | `:droplet:` |
| U+1F4A8 | 💨 | `:dash:` |
| U+1F4A9 | 💩 | `:poop:` |
| U+1F4AB | 💫 | `:dizzy:` |
| U+1F4AD | 💭 | `:thought_balloon:` |
| U+1F4AE | 💮 | `:white_flower:` |
| U+1F4B1 | 💱 | `:currency_exchange:` |
| U+1F4B2 | 💲 | `:heavy_dollar_sign:` |
| U+1F4B3 | 💳 | `:credit_card:` |
| U+1F4B4 | 💴 | `:yen:` |
| U+1F4B5 | 💵 | `:dollar:` |
| U+1F4B6 | 💶 | `:euro:` |
| U+1F4B7 | 💷 | `:pound:` |
| U+1F4B8 | 💸 | `:money_with_wings:` |
| U+1F4B9 | 💹 | `:chart:` |
| U+1F4BA | 💺 | `:seat:` |
| U+1F4BC | 💼 | `:briefcase:` |
| U+1F4BD | 💽 | `:minidisc:` |
| U+1F4BE | 💾 | `:floppy_disk:` |
| U+1F4BF | 💿 | `:cd:` |
| U+1F4C0 | 📀 | `:dvd:` |
| U+1F4C5 | 📅 | `:date:` |
| U+1F4C6 | 📆 | `:calendar:` |
| U+1F4C7 | 📇 | `:card_index:` |
| U+1F4CB | 📋 | `:clipboard:` |
| U+1F4CD | 📍 | `:round_pushpin:` |
| U+1F4CE | 📎 | `:paperclip:` |
| U+1F4CF | 📏 | `:straight_ruler:` |
| U+1F4D0 | 📐 | `:triangular_ruler:` |
| U+1F4D1 | 📑 | `:bookmark_tabs:` |
| U+1F4D2 | 📒 | `:ledger:` |
| U+1F4D3 | 📓 | `:notebook:` |
| U+1F4D4 | 📔 | `:notebook_with_decorative_cover:` |
| U+1F4D5 | 📕 | `:closed_book:` |
| U+1F4D6 | 📖 | `:book:` |
| U+1F4D7 | 📗 | `:green_book:` |
| U+1F4D8 | 📘 | `:blue_book:` |
| U+1F4D9 | 📙 | `:orange_book:` |
| U+1F4DA | 📚 | `:books:` |
| U+1F4DB | 📛 | `:name_badge:` |
| U+1F4DC | 📜 | `:scroll:` |
| U+1F4DE | 📞 | `:telephone_receiver:` |
| U+1F4DF | 📟 | `:pager:` |
| U+1F4E0 | 📠 | `:fax:` |
| U+1F4E1 | 📡 | `:satellite:` |
| U+1F4E2 | 📢 | `:loudspeaker:` |
| U+1F4E3 | 📣 | `:mega:` |
| U+1F4E4 | 📤 | `:outbox_tray:` |
| U+1F4E5 | 📥 | `:inbox_tray:` |
| U+1F4E8 | 📨 | `:incoming_envelope:` |
| U+1F4E9 | 📩 | `:envelope_with_arrow:` |
| U+1F4EA | 📪 | `:mailbox_closed:` |
| U+1F4EB | 📫 | `:mailbox:` |
| U+1F4EC | 📬 | `:mailbox_with_mail:` |
| U+1F4ED | 📭 | `:mailbox_with_no_mail:` |
| U+1F4EE | 📮 | `:postbox:` |
| U+1F4EF | 📯 | `:postal_horn:` |
| U+1F4F0 | 📰 | `:newspaper:` |
| U+1F4F2 | 📲 | `:calling:` |
| U+1F4F3 | 📳 | `:vibration_mode:` |
| U+1F4F4 | 📴 | `:mobile_phone_off:` |
| U+1F4F5 | 📵 | `:no_mobile_phones:` |
| U+1F4F6 | 📶 | `:signal_strength:` |
| U+1F4F7 | 📷 | `:camera:` |
| U+1F4F8 | 📸 | `:camera_with_flash:` |
| U+1F4F9 | 📹 | `:video_camera:` |
| U+1F4FA | 📺 | `:tv:` |
| U+1F4FB | 📻 | `:radio:` |
| U+1F4FC | 📼 | `:vhs:` |
| U+1F4FD | 📽 | `:projector:` |
| U+1F4FE | 📾 | `*` |
| U+1F4FF | 📿 | `:prayer_beads:` |
| U+1F500 | 🔀 | `:twisted_rightwards_arrows:` |
| U+1F501 | 🔁 | `:repeat:` |
| U+1F502 | 🔂 | `:repeat_one:` |
| U+1F503 | 🔃 | `:arrows_clockwise:` |
| U+1F505 | 🔅 | `:low_brightness:` |
| U+1F506 | 🔆 | `:high_brightness:` |
| U+1F507 | 🔇 | `:mute:` |
| U+1F508 | 🔈 | `:speaker:` |
| U+1F509 | 🔉 | `:sound:` |
| U+1F50A | 🔊 | `:loud_sound:` |
| U+1F50B | 🔋 | `:battery:` |
| U+1F50C | 🔌 | `:electric_plug:` |
| U+1F50E | 🔎 | `:mag_right:` |
| U+1F50F | 🔏 | `:lock_with_ink_pen:` |
| U+1F510 | 🔐 | `:closed_lock_with_key:` |
| U+1F514 | 🔔 | `:bell:` |
| U+1F515 | 🔕 | `:no_bell:` |
| U+1F516 | 🔖 | `:bookmark:` |
| U+1F518 | 🔘 | `:radio_button:` |
| U+1F519 | 🔙 | `:back:` |
| U+1F51A | 🔚 | `:end:` |
| U+1F51B | 🔛 | `:on:` |
| U+1F51C | 🔜 | `:soon:` |
| U+1F51D | 🔝 | `:top:` |
| U+1F51E | 🔞 | `:underage:` |
| U+1F51F | 🔟 | `:keycap_ten:` |
| U+1F520 | 🔠 | `:capital_abcd:` |
| U+1F521 | 🔡 | `:abcd:` |
| U+1F522 | 🔢 | `:1234:` |
| U+1F523 | 🔣 | `:symbols:` |
| U+1F524 | 🔤 | `:abc:` |
| U+1F526 | 🔦 | `:flashlight:` |
| U+1F528 | 🔨 | `:hammer:` |
| U+1F529 | 🔩 | `:nut_and_bolt:` |
| U+1F52A | 🔪 | `:knife:` |
| U+1F52B | 🔫 | `:gun:` |
| U+1F52C | 🔬 | `:microscope:` |
| U+1F52D | 🔭 | `:telescope:` |
| U+1F52E | 🔮 | `:crystal_ball:` |
| U+1F52F | 🔯 | `:six_pointed_star:` |
| U+1F530 | 🔰 | `:beginner:` |
| U+1F531 | 🔱 | `:trident:` |
| U+1F532 | 🔲 | `:black_square_button:` |
| U+1F533 | 🔳 | `:white_square_button:` |
| U+1F534 | 🔴 | `:red_circle:` |
| U+1F535 | 🔵 | `:blue_circle:` |
| U+1F536 | 🔶 | `:large_orange_diamond:` |
| U+1F537 | 🔷 | `:large_blue_diamond:` |
| U+1F538 | 🔸 | `:small_orange_diamond:` |
| U+1F539 | 🔹 | `:small_blue_diamond:` |
| U+1F53A | 🔺 | `:small_red_triangle:` |
| U+1F53B | 🔻 | `:small_red_triangle_down:` |
| U+1F53C | 🔼 | `:arrow_up_small:` |
| U+1F53D | 🔽 | `:arrow_down_small:` |
| U+1F53E | 🔾 | `*` |
| U+1F53F | 🔿 | `*` |
| U+1F540 | 🕀 | `+` |
| U+1F541 | 🕁 | `+` |
| U+1F542 | 🕂 | `+` |
| U+1F543 | 🕃 | `*` |
| U+1F544 | 🕄 | `*` |
| U+1F545 | 🕅 | `M` |
| U+1F546 | 🕆 | `+` |
| U+1F547 | 🕇 | `+` |
| U+1F548 | 🕈 | `+` |
| U+1F549 | 🕉 | `:om_symbol:` |
| U+1F54A | 🕊 | `:dove:` |
| U+1F54B | 🕋 | `:kaaba:` |
| U+1F54C | 🕌 | `:mosque:` |
| U+1F54D | 🕍 | `:synagogue:` |
| U+1F54E | 🕎 | `:menorah:` |
| U+1F54F | 🕏 | `*` |
| U+1F550 | 🕐 | `:clock1:` |
| U+1F551 | 🕑 | `:clock2:` |
| U+1F552 | 🕒 | `:clock3:` |
| U+1F553 | 🕓 | `:clock4:` |
| U+1F554 | 🕔 | `:clock5:` |
| U+1F555 | 🕕 | `:clock6:` |
| U+1F556 | 🕖 | `:clock7:` |
| U+1F557 | 🕗 | `:clock8:` |
| U+1F558 | 🕘 | `:clock9:` |
| U+1F559 | 🕙 | `:clock10:` |
| U+1F55A | 🕚 | `:clock11:` |
| U+1F55B | 🕛 | `:clock12:` |
| U+1F55C | 🕜 | `:clock130:` |
| U+1F55D | 🕝 | `:clock230:` |
| U+1F55E | 🕞 | `:clock330:` |
| U+1F55F | 🕟 | `:clock430:` |
| U+1F560 | 🕠 | `:clock530:` |
| U+1F561 | 🕡 | `:clock630:` |
| U+1F562 | 🕢 | `:clock730:` |
| U+1F563 | 🕣 | `:clock830:` |
| U+1F564 | 🕤 | `:clock930:` |
| U+1F565 | 🕥 | `:clock1030:` |
| U+1F566 | 🕦 | `:clock1130:` |
| U+1F567 | 🕧 | `:clock1230:` |
| U+1F568 | 🕨 | `*` |
| U+1F569 | 🕩 | `*` |
| U+1F56A | 🕪 | `*` |
| U+1F56B | 🕫 | `@` |
| U+1F56C | 🕬 | `@` |
| U+1F56D | 🕭 | `*` |
| U+1F56E | 🕮 | `*` |
| U+1F56F | 🕯 | `:candle:` |
| U+1F570 | 🕰 | `:clock:` |
| U+1F571 | 🕱 | `*` |
| U+1F572 | 🕲 | `*` |
| U+1F573 | 🕳 | `:hole:` |
| U+1F574 | 🕴 | `:levitate:` |
| U+1F575 | 🕵 | `:detective:` |
| U+1F576 | 🕶 | `:dark_sunglasses:` |
| U+1F577 | 🕷 | `:spider:` |
| U+1F578 | 🕸 | `:spider_web:` |
| U+1F579 | 🕹 | `:joystick:` |
| U+1F57A | 🕺 | `:man_dancing:` |
| U+1F57B | 🕻 | `@` |
| U+1F57C | 🕼 | `@` |
| U+1F57D | 🕽 | `@` |
| U+1F57E | 🕾 | `@` |
| U+1F57F | 🕿 | `@` |
| U+1F580 | 🖀 | `@` |
| U+1F581 | 🖁 | `@` |
| U+1F582 | 🖂 | `@` |
| U+1F583 | 🖃 | `@` |
| U+1F584 | 🖄 | `@` |
| U+1F585 | 🖅 | `@` |
| U+1F586 | 🖆 | `@` |
| U+1F587 | 🖇 | `:paperclips:` |
| U+1F588 | 🖈 | `*` |
| U+1F589 | 🖉 | `*` |
| U+1F58A | 🖊 | `:pen_ballpoint:` |
| U+1F58B | 🖋 | `:pen_fountain:` |
| U+1F58C | 🖌 | `:paintbrush:` |
| U+1F58D | 🖍 | `:crayon:` |
| U+1F58E | 🖎 | `*` |
| U+1F58F | 🖏 | `*` |
| U+1F590 | 🖐 | `:hand_splayed:` |
| U+1F591 | 🖑 | `*` |
| U+1F592 | 🖒 | `^` |
| U+1F593 | 🖓 | `v` |
| U+1F594 | 🖔 | `V` |
| U+1F595 | 🖕 | `:middle_finger:` |
| U+1F596 | 🖖 | `:vulcan:` |
| U+1F597 | 🖗 | `v` |
| U+1F598 | 🖘 | `<` |
| U+1F599 | 🖙 | `>` |
| U+1F59A | 🖚 | `<` |
| U+1F59B | 🖛 | `>` |
| U+1F59C | 🖜 | `<` |
| U+1F59D | 🖝 | `>` |
| U+1F59E | 🖞 | `^` |
| U+1F59F | 🖟 | `v` |
| U+1F5A0 | 🖠 | `^` |
| U+1F5A1 | 🖡 | `v` |
| U+1F5A2 | 🖢 | `^` |
| U+1F5A3 | 🖣 | `v` |
| U+1F5A4 | 🖤 | `:black_heart:` |
| U+1F5A5 | 🖥 | `:desktop:` |
| U+1F5A6 | 🖦 | `*` |
| U+1F5A7 | 🖧 | `*` |
| U+1F5A8 | 🖨 | `:printer:` |
| U+1F5A9 | 🖩 | `*` |
| U+1F5AA | 🖪 | `*` |
| U+1F5AB | 🖫 | `*` |
| U+1F5AC | 🖬 | `*` |
| U+1F5AD | 🖭 | `*` |
| U+1F5AE | 🖮 | `*` |
| U+1F5AF | 🖯 | `*` |
| U+1F5B0 | 🖰 | `*` |
| U+1F5B1 | 🖱 | `:mouse_three_button:` |
| U+1F5B2 | 🖲 | `:trackball:` |
| U+1F5B3 | 🖳 | `*` |
| U+1F5B4 | 🖴 | `*` |
| U+1F5B5 | 🖵 | `*` |
| U+1F5B6 | 🖶 | `*` |
| U+1F5B7 | 🖷 | `*` |
| U+1F5B8 | 🖸 | `*` |
| U+1F5B9 | 🖹 | `#` |
| U+1F5BA | 🖺 | `#` |
| U+1F5BB | 🖻 | `#` |
| U+1F5BC | 🖼 | `:frame_photo:` |
| U+1F5BD | 🖽 | `#` |
| U+1F5BE | 🖾 | `#` |
| U+1F5BF | 🖿 | `#` |
| U+1F5C0 | 🗀 | `#` |
| U+1F5C1 | 🗁 | `#` |
| U+1F5C2 | 🗂 | `:dividers:` |
| U+1F5C3 | 🗃 | `:card_box:` |
| U+1F5C4 | 🗄 | `:file_cabinet:` |
| U+1F5C5 | 🗅 | `#` |
| U+1F5C6 | 🗆 | `#` |
| U+1F5C7 | 🗇 | `#` |
| U+1F5C8 | 🗈 | `#` |
| U+1F5C9 | 🗉 | `#` |
| U+1F5CA | 🗊 | `#` |
| U+1F5CB | 🗋 | `#` |
| U+1F5CC | 🗌 | `#` |
| U+1F5CD | 🗍 | `#` |
| U+1F5CE | 🗎 | `#` |
| U+1F5CF | 🗏 | `#` |
| U+1F5D0 | 🗐 | `#` |
| U+1F5D2 | 🗒 | `:notepad_spiral:` |
| U+1F5D3 | 🗓 | `:calendar_spiral:` |
| U+1F5D4 | 🗔 | `#` |
| U+1F5D5 | 🗕 | `-` |
| U+1F5D6 | 🗖 | `+` |
| U+1F5D7 | 🗗 | `#` |
| U+1F5D8 | 🗘 | `*` |
| U+1F5D9 | 🗙 | `X` |
| U+1F5DA | 🗚 | `aA` |
| U+1F5DB | 🗛 | `Aa` |
| U+1F5DC | 🗜 | `:compression:` |
| U+1F5DD | 🗝 | `:key2:` |
| U+1F5DE | 🗞 | `:newspaper2:` |
| U+1F5DF | 🗟 | `#` |
| U+1F5E0 | 🗠 | `#` |
| U+1F5E1 | 🗡 | `:dagger:` |
| U+1F5E2 | 🗢 | `*` |
| U+1F5E3 | 🗣 | `:speaking_head:` |
| U+1F5E4 | 🗤 | `v` |
| U+1F5E5 | 🗥 | `^` |
| U+1F5E6 | 🗦 | `>` |
| U+1F5E7 | 🗧 | `<` |
| U+1F5E8 | 🗨 | `:speech_left:` |
| U+1F5E9 | 🗩 | `@` |
| U+1F5EA | 🗪 | `@` |
| U+1F5EB | 🗫 | `@` |
| U+1F5EC | 🗬 | `@` |
| U+1F5ED | 🗭 | `@` |
| U+1F5EE | 🗮 | `@` |
| U+1F5EF | 🗯 | `:anger_right:` |
| U+1F5F0 | 🗰 | `*` |
| U+1F5F1 | 🗱 | `*` |
| U+1F5F2 | 🗲 | `*` |
| U+1F5F3 | 🗳 | `:ballot_box:` |
| U+1F5F4 | 🗴 | `x` |
| U+1F5F5 | 🗵 | `x` |
| U+1F5F6 | 🗶 | `x` |
| U+1F5F7 | 🗷 | `x` |
| U+1F5F8 | 🗸 | `v` |
| U+1F5F9 | 🗹 | `v` |
| U+1F5FA | 🗺 | `:map:` |
| U+1F5FB | 🗻 | `:mount_fuji:` |
| U+1F5FC | 🗼 | `:tokyo_tower:` |
| U+1F5FD | 🗽 | `:statue_of_liberty:` |
| U+1F5FE | 🗾 | `:japan:` |
| U+1F5FF | 🗿 | `:moyai:` |
| U+1F681 | 🚁 | `:helicopter:` |
| U+1F682 | 🚂 | `:steam_locomotive:` |
| U+1F683 | 🚃 | `:railway_car:` |
| U+1F684 | 🚄 | `:bullettrain_side:` |
| U+1F685 | 🚅 | `:bullettrain_front:` |
| U+1F686 | 🚆 | `:train2:` |
| U+1F687 | 🚇 | `:metro:` |
| U+1F688 | 🚈 | `:light_rail:` |
| U+1F689 | 🚉 | `:station:` |
| U+1F68A | 🚊 | `:tram:` |
| U+1F68B | 🚋 | `:train:` |
| U+1F68C | 🚌 | `:bus:` |
| U+1F68D | 🚍 | `:oncoming_bus:` |
| U+1F68E | 🚎 | `:trolleybus:` |
| U+1F68F | 🚏 | `:busstop:` |
| U+1F690 | 🚐 | `:minibus:` |
| U+1F691 | 🚑 | `:ambulance:` |
| U+1F692 | 🚒 | `:fire_engine:` |
| U+1F693 | 🚓 | `:police_car:` |
| U+1F694 | 🚔 | `:oncoming_police_car:` |
| U+1F695 | 🚕 | `:taxi:` |
| U+1F696 | 🚖 | `:oncoming_taxi:` |
| U+1F697 | 🚗 | `:red_car:` |
| U+1F698 | 🚘 | `:oncoming_automobile:` |
| U+1F699 | 🚙 | `:blue_car:` |
| U+1F69A | 🚚 | `:truck:` |
| U+1F69B | 🚛 | `:articulated_lorry:` |
| U+1F69C | 🚜 | `:tractor:` |
| U+1F69D | 🚝 | `:monorail:` |
| U+1F69E | 🚞 | `:mountain_railway:` |
| U+1F69F | 🚟 | `:suspension_railway:` |
| U+1F6A0 | 🚠 | `:mountain_cableway:` |
| U+1F6A1 | 🚡 | `:aerial_tramway:` |
| U+1F6A2 | 🚢 | `:ship:` |
| U+1F6A3 | 🚣 | `:person_rowing_boat:` |
| U+1F6A4 | 🚤 | `:speedboat:` |
| U+1F6A5 | 🚥 | `:traffic_light:` |
| U+1F6A6 | 🚦 | `:vertical_traffic_light:` |
| U+1F6A8 | 🚨 | `:rotating_light:` |
| U+1F6A9 | 🚩 | `:triangular_flag_on_post:` |
| U+1F6AA | 🚪 | `:door:` |
| U+1F6AB | 🚫 | `:no_entry_sign:` |
| U+1F6AC | 🚬 | `:smoking:` |
| U+1F6AD | 🚭 | `:no_smoking:` |
| U+1F6AE | 🚮 | `:put_litter_in_its_place:` |
| U+1F6AF | 🚯 | `:do_not_litter:` |
| U+1F6B0 | 🚰 | `:potable_water:` |
| U+1F6B1 | 🚱 | `:non_potable_water:` |
| U+1F6B2 | 🚲 | `:bike:` |
| U+1F6B3 | 🚳 | `:no_bicycles:` |
| U+1F6B4 | 🚴 | `:person_biking:` |
| U+1F6B5 | 🚵 | `:person_mountain_biking:` |
| U+1F6B6 | 🚶 | `:person_walking:` |
| U+1F6B7 | 🚷 | `:no_pedestrians:` |
| U+1F6B8 | 🚸 | `:children_crossing:` |
| U+1F6B9 | 🚹 | `:mens:` |
| U+1F6BA | 🚺 | `:womens:` |
| U+1F6BB | 🚻 | `:restroom:` |
| U+1F6BC | 🚼 | `:baby_symbol:` |
| U+1F6BD | 🚽 | `:toilet:` |
| U+1F6BE | 🚾 | `:wc:` |
| U+1F6BF | 🚿 | `:shower:` |
| U+1F6C0 | 🛀 | `:bath:` |
| U+1F6C1 | 🛁 | `:bathtub:` |
| U+1F6C2 | 🛂 | `:passport_control:` |
| U+1F6C3 | 🛃 | `:customs:` |
| U+1F6C4 | 🛄 | `:baggage_claim:` |
| U+1F6C5 | 🛅 | `:left_luggage:` |
| U+1F6C6 | 🛆 | `^` |
| U+1F6C7 | 🛇 | `X` |
| U+1F6C8 | 🛈 | `i` |
| U+1F6C9 | 🛉 | `m` |
| U+1F6CA | 🛊 | `f` |
| U+1F6CB | 🛋 | `:couch:` |
| U+1F6CC | 🛌 | `:sleeping_accommodation:` |
| U+1F6CD | 🛍 | `:shopping_bags:` |
| U+1F6CE | 🛎 | `:bellhop:` |
| U+1F6CF | 🛏 | `:bed:` |
| U+1F6D0 | 🛐 | `:place_of_worship:` |
| U+1F6D1 | 🛑 | `:octagonal_sign:` |
| U+1F6D2 | 🛒 | `:shopping_cart:` |
| U+1F6D3 | 🛓 | `^` |
| U+1F6D4 | 🛔 | `^` |
| U+1F6D5 | 🛕 | `:hindu_temple:` |
| U+1F6D6 | 🛖 | `:hut:` |
| U+1F6D7 | 🛗 | `:elevator:` |
| U+1F6DC | 🛜 | `:wireless:` |
| U+1F6DD | 🛝 | `:playground_slide:` |
| U+1F6DE | 🛞 | `:wheel:` |
| U+1F6DF | 🛟 | `:ring_buoy:` |
| U+1F6E0 | 🛠 | `:tools:` |
| U+1F6E1 | 🛡 | `:shield:` |
| U+1F6E2 | 🛢 | `:oil:` |
| U+1F6E3 | 🛣 | `:motorway:` |
| U+1F6E4 | 🛤 | `:railway_track:` |
| U+1F6E5 | 🛥 | `:motorboat:` |
| U+1F6E6 | 🛦 | `^` |
| U+1F6E7 | 🛧 | `^` |
| U+1F6E8 | 🛨 | `^` |
| U+1F6E9 | 🛩 | `:airplane_small:` |
| U+1F6EA | 🛪 | `^` |
| U+1F6EB | 🛫 | `:airplane_departure:` |
| U+1F6EC | 🛬 | `:airplane_arriving:` |
| U+1F6F0 | 🛰 | `:satellite_orbital:` |
| U+1F6F1 | 🛱 | `#` |
| U+1F6F2 | 🛲 | `#` |
| U+1F6F3 | 🛳 | `:cruise_ship:` |
| U+1F6F4 | 🛴 | `:scooter:` |
| U+1F6F5 | 🛵 | `:motor_scooter:` |
| U+1F6F6 | 🛶 | `:canoe:` |
| U+1F6F7 | 🛷 | `:sled:` |
| U+1F6F8 | 🛸 | `:flying_saucer:` |
| U+1F6F9 | 🛹 | `:skateboard:` |
| U+1F6FA | 🛺 | `:auto_rickshaw:` |
| U+1F6FB | 🛻 | `:pickup_truck:` |
| U+1F6FC | 🛼 | `:roller_skate:` |

### Table sourcing (AnyAscii)

[AnyAscii](https://github.com/anyascii/anyascii) tag **0.3.3** is the source of
**every substitution value** in the six tables above — WHOLESALE, not a curated
subset. All 2606 entries are the AnyAscii 0.3.3 replacement verbatim, across the
13 Unicode blocks the plugin already touched. Reproduce with
`python3 scripts/vendor-anyascii.py` (or verify with `--check`); the per-entry
provenance is `scripts/anyascii-manifest.json` (codepoint, exact TS spelling,
category, the upstream value `aa`).

Examples of the values this brings in: `→` is now `>` (was `->`), `≠` is `=`
(was `!=`), `👍` is `:thumbsup:` (was `:+1:`), `∀` is `V` (was `all`), `↵` is
`<` (was a real newline), `⬛` is `:black_large_square:` (was `#`), `◉` is `*`
(previously deleted), `∫` is `S` (previously deleted), `🍕` is `:pizza:`
(previously deleted).

#### What is never imported

- **Latin letters (the Latin-1 exception).** U+00A0-U+036F is inside the strip
  keep-set, so `é` `ł` `ø` `ß` survive the pipeline intact. AnyAscii
  transliterates them (`é` → `e`), which would corrupt the very text the
  keep-set preserves, so those entries are excluded. The only Latin-1 entries
  in the tables are symbols (`×` `÷` `±` `¬` `«` `»` `·` `¡` `¿` NBSP), never
  letters.
- **Scripts (Greek, Cyrillic, Arabic, Hebrew, CJK, kana, Hangul, Thai,
  Devanagari, …).** Romanising them would fight the pipeline: the strip deletes
  those characters, and AnyAscii's transliteration (which is its core business)
  is deliberately ignored.
- **Blocks outside the 13 open ones.** Emoticons, Enclosed Alphanumeric
  Supplement, Supplemental Symbols and Pictographs, Currency Symbols, Block
  Elements and the rest stay unrepresented — no fourteenth block is opened.
- **Empty AnyAscii replacements.** Where AnyAscii maps to `""` (ZWSP, emoji
  modifiers and friends) the strip already deletes the character.
- **The euro sign `€` (U+20AC).** Deliberately unmapped: spelled out as `EUR`
  it reads as injected prose, and a bare number is already unambiguous once the
  sign is dropped. Currency Symbols is outside the 13 open blocks, so the strip
  deletes it. This is an explicit decision, not an upstream gap — the generator
  asserts it.

#### The assumed conventions

The values are upstream, but three things are this plugin's choice, documented
rather than silent:

- **`:shortcode:` names are treated as Discord-style labels.** AnyAscii emits
  names like `:thumbsup:`, `:left_right_arrow:`, `:black_large_square:`,
  `:lady_beetle:`, `:mobile_phone:`; the plugin passes them through as useful
  ASCII labels, on the assumption the audience reads Discord/Slack shortcodes.
- **Category placement of wholesale entries follows a block map**: General
  Punctuation + Letterlike Symbols → `punctuation`; Box Drawing → `frames`;
  Geometric Shapes → `shapes`; Arrows + Miscellaneous Symbols and Arrows →
  `arrows`; Mathematical Operators → `math`; Dingbats + Miscellaneous Symbols +
  Miscellaneous Symbols and Pictographs + Miscellaneous Technical + Transport and
  Map → `emojis`.
- **`frames` and `shapes` are a split**, not a source: Box Drawing and
  Geometric Shapes got their own flags (both default `true`) so ASCII-art frames
  and geometric marks can be kept or dropped independently. The block set stays
  at 13.

Realistic consequence, stated plainly: silhouette emoji in the pictographic
blocks now take their shortcode even when the glyph is not the canonical one,
and the appearance-based symbols (`◉` `◆` `▚`) collapse to their ASCII
approximation. That is the trade of sourcing wholesale instead of curating
glyph by glyph.

Pinned input is `vendor/anyascii/table-0.3.3.tsv` (SHA-256 verified on every
run). The generator fails on any drift: table hash change, a target that no
longer matches the table, a spelling that decodes elsewhere, a non-ASCII target,
a duplicate key, a scope violation (<2 entries per block, unknown block,
13-block drift), a Latin letter or script entry, the euro sign, or any
in-scope candidate left uncurated (completeness).

Licence: AnyAscii is **ISC** (Hunter WB) — see `LICENSE.anyascii`. The plugin
itself stays **MIT** (see `LICENSE`).

### What is deliberately not mapped

With WHOLESALE sourcing, the tables capture every non-empty AnyAscii
replacement inside the 13 open blocks. What is still absent is absent because
it is *excluded*, not overlooked:

- **Everything outside the 13 open blocks** — Emoticons (U+1F600-U+1F64F),
  Enclosed Alphanumerics/Supplement, Supplemental Symbols and Pictographs,
  Block Elements (shade blocks `░ ▒ ▓`), Currency Symbols and the rest. This is
  the guardrail: a block is only ever entered with two or more entries, and no
  new block opens.
- **Latin letters** — the Latin-1 exception above.
- **Scripts** — Greek, Cyrillic, Arabic, Hebrew, CJK, kana and Hangul are left
  to the strip.
- **The euro sign `€`** — the explicit decision above.
- **Empty AnyAscii replacements** — the strip handles them.

There is no longer a hand-picked "ambiguous, so refused" list: `∓ ∛ ⊗ ◉ ☕`
and the pedestal arrows `⇪ ⇫ ⇬ ⇭` are all mapped now, to their AnyAscii
appearance forms.

### Open blocks only

The tables are filled block by block, never opened for a new one: a block is
only ever represented with two or more entries, or not at all. WHOLESALE
saturates the 13 blocks that were already in play without opening a fourteenth,
which is why Emoticons, Enclosed Alphanumeric Supplement, Supplemental Symbols
and Pictographs and Currency Symbols remain absent. The generator enforces both
the 13-block set and the ≥2-per-block invariant on every run.

See [`src/substitutions.ts`](src/substitutions.ts) for the authoritative list.

## How it works

The plugin uses three hooks:

1. **`experimental.text.complete`** — fired by OpenCode after each AI text part finishes streaming. The plugin rewrites `output.text` in place before it is persisted, applying substitutions and, if enabled, the opt-in `stripNonLatin` pass.

2. **`tool.execute.before`** — fired before any tool executes. The plugin rewrites:
   - `output.args.content` for the `write` tool
   - `output.args.newString` for the `edit` tool (never `oldString` — it must match existing file content exactly)

   This hook applies substitutions only, never `stripNonLatin`. See [`### stripNonLatin`](#stripnonlatin).

3. **`tool.execute.after`** — fired after any tool returns, with
   `output.title` and `output.output`. The plugin rewrites both through the
   same `substitute` → optional `stripNonLatin` pipeline used for AI text.

### tool.execute.after: tool results

`bash`, `read`, `grep`, `glob`, `list`, `webfetch` and MCP tools surface
whatever they found, verbatim. None of that goes through
`experimental.text.complete`, so without this hook a `cat` of a file containing
CJK, or a `ls` of a Japanese directory name, rendered raw in the TUI. This
hook is the only interception point the host offers for tool results.

`stripNonLatin` applies here, and unlike the `before` hook it applies to
**every** tool — this hook has no access to file payloads, only to the two
strings the TUI renders, so there is nothing to protect.

Three consequences, stated plainly:

- **It is not display-only.** A tool result is stored in the transcript and
  replayed to the model on later turns. After stripping, the model sees
  `see file foo` where the tool actually returned `foo のドキュメント`. That is
  the intended trade — the option is opt-in — but `stripNonLatin` is genuinely
  lossy for any turn that continues past a tool call. Nothing is destroyed on
  disk: file payloads are still never stripped.
- **Redacted results go through the same pass.** The host replaces sensitive
  tool output with a redacted placeholder and still calls this hook, and
  `input.tool` does not report whether a payload was redacted, so the pass
  cannot be skipped selectively. In practice this is inert — placeholders are
  ASCII — but it does mean the hook runs over content the plugin cannot see,
  which is why it is limited to the two `string` fields.
- **`metadata` is left alone.** It is structured data the TUI consumes (diff
  metadata, truncation flags, paths). Rewriting it risks the renderer for no
  display gain.

### Known limitation: streaming

`experimental.text.complete` fires **once per text part, after streaming has
finished**. The TUI has already rendered every token by then, so characters
emitted mid-stream are displayed with their original typography and only the
final, persisted copy is rewritten — the next render of that message shows the
ASCII version, the scrollback you already watched does not.

There is no per-chunk hook in the host to do better. `tool.execute.after` does
not have this problem: tool output is rendered after the tool has returned, so
the rewrite happens before anything is displayed.

### apply_patch is not rewritten

`apply_patch` is **not** handled, and its `args.patchText` payload is passed
through verbatim.

A unified diff is machine-parsed, not prose. Its `-` removal lines and its
context lines must match the target file **byte for byte**, otherwise the patch
is rejected. Substituting inside `patchText` rewrites those lines, so any file
that legitimately contains a typographic character breaks the patch. With
default options and this file on disk:

```
function greet() {
  console.log("hello — world");
}
```

a patch whose removal line is `-  console.log("hello — world");` came out of
the plugin as `-  console.log("hello - world");`, which no longer matches the
file, and the `+` line was mangled the same way. The patch failed to apply.

This is a bug fix: the plugin previously rewrote `patchText`. If you need
typographic characters converted inside a patch, put the already-ASCII text in
the patch yourself — `write` and `edit` remain fully substituted, and neither
involves matching a removal line against existing bytes.

Substitution uses a single compiled regex built from all active mappings, so there is no O(n) string-replace loop per character.

## License

MIT (see `LICENSE`). The substitution tables are sourced from AnyAscii tag
0.3.3, which is ISC — see `LICENSE.anyascii` and
[Table sourcing (AnyAscii)](#table-sourcing-anyascii).
