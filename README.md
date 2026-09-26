# opencode-ascii

An [OpenCode](https://opencode.ai) plugin that automatically substitutes unicode characters with ASCII-safe equivalents in AI responses and file edits.

## Why?

LLMs love to reach for typographic characters — em-dashes, curly quotes, arrows, emoji — that look great in a browser but cause friction in terminals, code, config files, and plain-text tooling. This plugin intercepts output at two points:

- **AI text responses** (`experimental.text.complete`) — rewrites text parts before they are stored.
- **File write/edit tool calls** (`tool.execute.before`) — rewrites `write` and `edit` tool arguments before execution. `apply_patch` is deliberately left alone; see [apply_patch is not rewritten](#apply_patch-is-not-rewritten).

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

All four substitution categories are **enabled by default**. Disable any category by passing options:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["opencode-ascii", {
      "punctuation": true,
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
| `arrows`      | boolean | `true`  | `→` → `->`, `←` → `<-`, `⇒` → `=>`, etc.  |
| `math`        | boolean | `true`  | `≠` → `!=`, `≤` → `<=`, `×` → `*`, etc.   |
| `emojis`      | boolean | `true`  | Common emoji -> `:shortcode:` labels         |
| `stripNonLatin` | boolean | `false` | Strip non-Latin-script characters from AI text responses (never from files) |

### stripNonLatin

`stripNonLatin` is **opt-in** and applies to **AI text responses only**
(`experimental.text.complete`). It is never applied to `write` or `edit` tool
arguments, and `apply_patch` is not rewritten at all.

Within an AI text part it runs as a second pass, *after* the substitutions
above:

```
substitute (punctuation/arrows/math/emojis)  ->  strip non-Latin scripts
```

It removes every character that is not in the Unicode **Latin**, **Common**,
or **Inherited** scripts. That keeps accented Latin text (`Café déjà vu`,
`«naïve»`), ASCII punctuation, digits, whitespace, and combining marks
(decomposed `é` keeps its accent), while dropping CJK, Cyrillic, Arabic,
Hebrew, Greek, and other scripts.

Files are never touched by this option. File content legitimately contains
non-Latin text — translated documentation, string tables, i18n fixtures — and
deleting those characters would be silent, irreversible data loss. A `write`
or `edit` payload carrying Japanese, Russian, or Arabic text is passed
through untouched, even with `stripNonLatin: true`; only the substitutions
above are applied to it.

Note that most pictographic emoji are `Script=Common` and survive stripping
untouched. In the normal pipeline this does not matter: the `emojis` category
replaces them with `:shortcode:` labels *before* stripping runs. With
`emojis: false` and `stripNonLatin: true`, raw emoji pass through.

## Substitution reference

### Punctuation

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2014  | — | `-` |
| U+2013  | – | `-` |
| U+2026  | … | `...` |
| U+201C  | " | `"` |
| U+201D  | " | `"` |
| U+2018  | ' | `'` |
| U+2019  | ' | `'` |
| U+00AB  | « | `"` |
| U+00BB  | » | `"` |
| U+2022  | • | `-` |

### Arrows

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2192  | → | `->` |
| U+2190  | ← | `<-` |
| U+2191  | ↑ | `^` |
| U+2193  | ↓ | `v` |
| U+21D2  | ⇒ | `=>` |
| U+21D0  | ⇐ | `<=` |
| U+21D4  | ⇔ | `<=>` |
| U+2194  |  | `<->` |

### Math operators

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2260  | ≠ | `!=` |
| U+2264  | ≤ | `<=` |
| U+2265  | ≥ | `>=` |
| U+00D7  | × | `*` |
| U+00F7  | ÷ | `/` |
| U+00B1  | ± | `+/-` |
| U+2212  | − | `-` |
| U+221E  | ∞ | `inf` |
| U+2248  | ≈ | `~=` |
| U+221A  | √ | `sqrt` |

### Emojis

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2713  | ✓ | `:white_check_mark:` |
| U+274C  | ❌ | `:x:` |
| U+26A0  | ⚠ | `:warning:` |
| U+2139  | ℹ | `:information_source:` |
| U+2B50  | ⭐ | `:star:` |
| U+1F525 | 🔥 | `:fire:` |
| U+1F680 | 🚀 | `:rocket:` |
| U+1F41B | 🐛 | `:bug:` |
| U+1F4DD | 📝 | `:memo:` |
| U+1F512 | 🔒 | `:lock:` |
| U+1F513 | 🔓 | `:unlock:` |
| U+1F4C1 | 📁 | `:file_folder:` |
| U+1F4C4 | 📄 | `:page_facing_up:` |
| U+1F44D | 👍 | `:+1:` |
| U+1F44E | 👎 | `:-1:` |

and many more!

See [`src/substitutions.ts`](src/substitutions.ts) for the full list.

## How it works

The plugin uses two hooks:

1. **`experimental.text.complete`** — fired by OpenCode after each AI text part finishes streaming. The plugin rewrites `output.text` in place before it is persisted, applying substitutions and, if enabled, the opt-in `stripNonLatin` pass.

2. **`tool.execute.before`** — fired before any tool executes. The plugin rewrites:
   - `output.args.content` for the `write` tool
   - `output.args.newString` for the `edit` tool (never `oldString` — it must match existing file content exactly)

   This hook applies substitutions only, never `stripNonLatin`. See [`### stripNonLatin`](#stripnonlatin).

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

MIT
