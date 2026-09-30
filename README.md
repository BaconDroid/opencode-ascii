# opencode-ascii

An [OpenCode](https://opencode.ai) plugin that automatically substitutes unicode characters with ASCII-safe equivalents in AI responses and file edits.

## Why?

LLMs love to reach for typographic characters — em-dashes, curly quotes, arrows, emoji — that look great in a browser but cause friction in terminals, code, config files, and plain-text tooling. This plugin intercepts output at two points:

- **AI text responses** (`experimental.text.complete`) — rewrites text parts before they are stored.
- **File write/edit tool calls** (`tool.execute.before`) — rewrites `write`, `edit`, `multiedit`, and `apply_patch` tool arguments before execution.

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
| `arrows`      | boolean | `true`  | `→` → `>`, `←` → `<`, `⇒` → `>`, etc.  |
| `math`        | boolean | `true`  | `≠` → `=`, `≤` → `<=`, `×` → `*`, etc.   |
| `emojis`      | boolean | `true`  | Common emoji -> `:shortcode:` labels         |

## Substitution reference

Representative samples — the full tables live in [`src/substitutions.ts`](src/substitutions.ts) (2606 entries) and the vendored AnyAscii rows in [`vendor/anyascii/table-0.3.3-subset.tsv`](vendor/anyascii/table-0.3.3-subset.tsv).

### Punctuation (172)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2014  | — | `-` |
| U+2013  | – | `-` |
| U+2015  | ― | `-` |
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
| U+2510  | ┐ | `+` |
| U+2514  | └ | `+` |
| U+2518  | ┘ | `+` |
| U+251C  | ├ | `+` |
| U+2524  | ┤ | `+` |
| U+252C  | ┬ | `+` |
| U+2534  | ┴ | `+` |
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
| U+25CA  | ◊ | `*` |
| U+25CE  | ◎ | `*` |
| U+25C9  | ◉ | `*` |
| U+25E2  | ◢ | `/` |
| U+25E3  | ◣ | `\` |
| U+25E4  | ◤ | `/` |
| U+25E5  | ◥ | `\` |
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

Every substitution value is the [AnyAscii](https://github.com/anyascii/anyascii) replacement verbatim, tag **0.3.3** — 2606 entries across 13 Unicode blocks in six categories. The vendored rows backing the tables are checked in at [`vendor/anyascii/table-0.3.3-subset.tsv`](vendor/anyascii/table-0.3.3-subset.tsv) (one row per mapped codepoint).

Never imported, by rule:

- **Latin letters** (U+00A0-U+036F) — accented text (`é`, `Ł`, `œ`) is not transliteration material.
- **Scripts** — Greek, Cyrillic, Arabic, Hebrew, CJK, kana, Hangul, Thai, Devanagari, … are never romanised here.
- **Blocks outside the 13 already covered** — no new block is ever opened.
- **Empty replacements** — there is nothing to map.
- **The euro sign U+20AC** — explicit decision: no `EUR` spelling.

Assumed, not upstream: the `:shortcode:` names are treated as Discord-style labels, wholesale entries are placed into categories by block, and Box Drawing / Geometric Shapes are split into the `frames` / `shapes` flags.

## How it works

The plugin uses two hooks:

1. **`experimental.text.complete`** — fired by OpenCode after each AI text part finishes streaming. The plugin rewrites `output.text` in place before it is persisted.

2. **`tool.execute.before`** — fired before any tool executes. The plugin rewrites:
   - `output.args.content` for the `write` tool
   - `output.args.newString` for the `edit` tool (never `oldString` — it must match existing file content exactly)
   - each `output.args.edits[].newString` for the `multiedit` tool
   - `output.args.patchText` for the `apply_patch` tool

Substitution uses a single compiled regex built from all active mappings, so there is no O(n) string-replace loop per character.

## License

MIT (see `LICENSE`). The substitution values are sourced from AnyAscii tag 0.3.3, which is ISC — see `LICENSE.anyascii` and [Table sourcing (AnyAscii)](#table-sourcing-anyascii).
