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

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2014  | — | `-` |
| U+2013  | – | `-` |
| U+2026  | … | `...` |
| U+201C  | “ | '"' |
| U+201D  | ” | '"' |
| U+2018  | ‘ | "'" |
| U+2019  | ’ | "'" |
| U+00AB  | « | `<<` |
| U+00BB  | » | `>>` |
| U+2022  | • | `*` |

### Frames (128)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2500  | ─ | `-` |
| U+2502  | │ | `|` |
| U+250C  | ┌ | `+` |
| U+2518  | ┘ | `+` |
| U+251C  | ├ | `+` |
| U+253C  | ┼ | `+` |
| U+2501  | ━ | `-` |
| U+2503  | ┃ | `|` |
| U+2550  | ═ | `-` |
| U+2551  | ║ | `|` |

### Shapes (89)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+25CF  | ● | `*` |
| U+25CB  | ○ | `*` |
| U+25A0  | ■ | `#` |
| U+25A1  | □ | `#` |
| U+25C6  | ◆ | `*` |
| U+25C7  | ◇ | `*` |
| U+25E2  | ◢ | `/` |
| U+25E3  | ◣ | `\` |
| U+2B1B  | ⬛ | `:black_large_square:` |
| U+2B1C  | ⬜ | `:white_large_square:` |

### Arrows (377)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2192  | → | `>` |
| U+2190  | ← | `<` |
| U+2191  | ↑ | `^` |
| U+2193  | ↓ | `v` |
| U+21D2  | ⇒ | `>` |
| U+21D0  | ⇐ | `<` |
| U+21D4  | ⇔ | `-` |
| U+2194  | ↔ | `:left_right_arrow:` |

### Math operators (260)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2260  | ≠ | `=` |
| U+2264  | ≤ | `<=` |
| U+2265  | ≥ | `>=` |
| U+00D7  | × | `*` |
| U+00F7  | ÷ | `/` |
| U+00B1  | ± | `+-` |
| U+2212  | − | `-` |
| U+221E  | ∞ | `inf` |
| U+2248  | ≈ | `~` |
| U+221A  | √ | `sqrt` |

### Emojis (1580)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2713  | ✓ | `v` |
| U+274C  | ❌ | `:x:` |
| U+26A0  | ⚠ | `:warning:` |
| U+2139  | ℹ | `i` |
| U+2B50  | ⭐ | `:star:` |
| U+1F525  | 🔥 | `:fire:` |
| U+1F680  | 🚀 | `:rocket:` |
| U+1F41B  | 🐛 | `:bug:` |
| U+1F4DD  | 📝 | `:pencil:` |
| U+1F512  | 🔒 | `:lock:` |
| U+1F513  | 🔓 | `:unlock:` |
| U+1F4C1  | 📁 | `:file_folder:` |
| U+1F4C4  | 📄 | `:page_facing_up:` |
| U+1F44D  | 👍 | `:thumbsup:` |
| U+1F44E  | 👎 | `:thumbsdown:` |

and many more!

See [`src/substitutions.ts`](src/substitutions.ts) for the full list.

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

Pinned input is `vendor/anyascii/table-0.3.3-subset.tsv` — the mapped rows of
the AnyAscii tag 0.3.3 table (full table: 123799 rows, SHA-256
63d405125a149ed646b6f932be96414e2db4b9ff5c3cb1fac49f6386a6fb1fa9, not checked
in; identity recorded in `scripts/anyascii-manifest.json`). The subset file is
SHA-256 verified on every run. The generator fails on any drift: subset hash change, a target that no
longer matches the subset, a spelling that decodes elsewhere, a non-ASCII target,
a duplicate key, a scope violation (<2 entries per block, unknown block,
13-block drift), a Latin letter or script entry, the euro sign, or any
subset row left uncurated (completeness).

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
