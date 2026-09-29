# opencode-ascii

An [OpenCode](https://opencode.ai) plugin that automatically substitutes unicode characters with ASCII-safe equivalents in AI responses and file edits.

## Why?

LLMs love to reach for typographic characters — em-dashes, curly quotes, arrows, emoji — that look great in a browser but cause friction in terminals, code, config files, and plain-text tooling. This plugin intercepts output at three points:

- **AI text responses** (`experimental.text.complete`) — rewrites text parts before they are stored.
- **File write/edit tool calls** (`tool.execute.before`) — rewrites `write` and `edit` tool arguments before execution. `apply_patch` is deliberately left alone; see [apply_patch is not rewritten](#apply_patch-is-not-rewritten).
- **Tool results** (`tool.execute.after`) — rewrites the rendered `title` and `output` of any tool result (`bash`, `read`, `grep`, webfetch, MCP tools), which no other hook reaches.

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
| `stripNonLatin` | boolean | `false` | Strip non-Latin characters from AI text responses and tool results (never from files) |

### stripNonLatin

`stripNonLatin` is **opt-in** and applies to **AI text responses and tool
results**. It is never applied to `write` or `edit` tool arguments, and
`apply_patch` is not rewritten at all.

Within an AI text part or a tool result it runs as a second pass, *after* the
substitutions above:

```
substitute (punctuation/arrows/math/emojis)  ->  NFKC-fold U+FF00-U+FFEF  ->  strip everything outside the allowlisted blocks
```

**That order is load-bearing.** The strip **only ever deletes** — it never
rewrites a character into another one. Turning `—` into `-` or `🚀` into
`:rocket:` is the sole job of the four tables, which run first. So in the real pipeline the em dash is already `-` and
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
- **Every emoji outside the kept blocks.** The `emojis` table covers the curated
  set; in the pipeline the mapped ones have already become ASCII `:shortcode:`,
  so what the strip deletes is the original codepoint, never the label it turned
  into. With `emojis: false, stripNonLatin: true` *all* raw emoji are removed.
- **Symbols and operators** outside the kept blocks — `█` (Block Elements), the
  shade blocks, `─` (Box Drawing), `→` (Arrows), `≠` (Mathematical Operators) —
  because substitution maps the curated tables and the strip takes the rest.
  Superscript and subscript digits (U+2070, U+2080) are in a later block and go
  too, unlike U+00B2 `²`, which is in Latin-1 and stays.
- **The euro sign `€`** — deliberately unmapped (the curated tables do not cover
  the Currency Symbols block), so the strip removes it. `£` `¥` `¢` `©` `®` are
  in Latin-1 and survive.

#### The one fold: fullwidth and halfwidth forms

U+FF00-U+FFEF is the single deliberate exception, and it is a **fold, not a
substitution**. No category covers the fullwidth block — none of the four
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

MIT
