# opencode-ascii

An [OpenCode](https://opencode.ai) **V2** plugin that automatically substitutes unicode characters with ASCII-safe equivalents in AI responses and file edits. It targets the V2 plugin API (`@opencode/plugin`) and does not load in V1; 0.2.0 is the last V1-compatible version.

## Why?

LLMs love to reach for typographic characters — em-dashes, curly quotes, arrows, emoji — that look great in a browser but cause friction in terminals, code, config files, and plain-text tooling. Tool output has the same problem, and harder: `cat`-ing a file, `ls`-ing a directory or `grep`-ping a repo surfaces whatever the project contains, with no model involved to substitute anything. This plugin intercepts output at three points:

- **Assistant text and compaction summaries** (`ctx.session.hook("context")`, plus the same callback on the `compaction` and `generate` request kinds and an inert registration on `title`) — rewrites assistant `text` parts and provider `compaction` content parts (`type: "compaction"`) in the transcript sent to the model. The fallback `<conversation-checkpoint>` summary replays as a user text message and is left raw. User-authored text and tool messages are untouched (provider `compaction` parts are the one exception), and **titles and reasoning parts are left raw** (see [AI text in V2](#ai-text-in-v2)). V2 has no post-stream hook, so already-stored and already-rendered output is untouched.
- **File write/edit tool calls** (`ctx.tool.hook("execute.before")`) — rewrites `write` and `edit` tool input before execution. `patch` (called `apply_patch` in V1) is deliberately left alone; see [patch is not rewritten](#patch-is-not-rewritten).
- **Tool results** (`ctx.tool.hook("execute.after")`) — rewrites the model-visible body of a tool result (`result.content` parts, including the host's serialization of a structured `output`). The `result.output` value itself is never mutated.

## Installation

Requires OpenCode **v2.0.30 or newer** (V2 plugin API). Point OpenCode at a
local clone of this fork; the npm caveat below explains why there is no package
name to install.

> **The npm name `opencode-ascii` is owned by [d3vv3](https://github.com/d3vv3/opencode-ascii).**
> This fork cannot publish under that name, and the registry refuses the upload.
> The published package is the **V1-only** release, so a V2 config listing
> `"plugins": ["opencode-ascii"]` loads a plugin that fails on the V2 API.
> Everything documented below — the `stripNonLatin` option, the `frames` and
> `shapes` categories, and the result-rewriting feature (V1
> `tool.execute.after`; V2 `ctx.tool.hook("execute.after")`) — exists only from
> **0.2.0**, which is **not on npm**; the V2 hook names apply from **0.3.0**.
> Install from a clone.

### Installing from a local clone

Point the plugin at the clone's directory, not at a file. `index.js` at the
repository root re-exports the built `dist/` entry, and `dist/` is committed, so
no build step is needed as long as you have not edited `src/`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "/absolute/path/to/opencode-ascii", "options": { "stripNonLatin": true } }
  ]
}
```

V2 requires a directory for a local plugin, so the V1 form — an absolute path to
`dist/index.js` — is rejected and the entry is skipped. If you do edit `src/`,
rebuild before restarting OpenCode — the directory entry serves `dist/`, and
OpenCode will not rebuild it for you:

```sh
npm run build
```

## Configuration

All six substitution categories are **enabled by default**. Disable any category by passing options:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-ascii",
      "options": {
        "punctuation": true,
        "frames": true,
        "shapes": true,
        "arrows": true,
        "math": true,
        "emojis": false
      }
    }
  ]
}
```

| Option        | Type    | Default | Description                                  |
|---------------|---------|---------|----------------------------------------------|
| `punctuation` | boolean | `true`  | Em/en dashes, ellipsis, curly/smart quotes   |
| `frames`      | boolean | `true`  | Box-drawing frames `┌─┐` → `+-+`, `─` → `-` |
| `shapes`      | boolean | `true`  | Geometric shapes `●` → `*`, `■` → `#`      |
| `arrows`      | boolean | `true`  | `→` → `>`, `←` → `<`, `⇄` → `=`, etc.       |
| `math`        | boolean | `true`  | `≠` → `=`, `≤` → `<=`, `×` → `*`, etc.   |
| `emojis`      | boolean | `true`  | Emoji and symbols → ASCII (`✓` → `v`, `☐` → `#`; 709 entries) |
| `stripNonLatin` | boolean | `false` | Strip non-Latin-script characters from AI text (model-visible transcript) and tool results (never written back to files) |

### stripNonLatin

`stripNonLatin` is **opt-in** and applies to **AI text (the transcript sent to
the model) and tool results**. It is never applied to `write` or `edit` tool input, and
`patch`'s input is not rewritten at all (its result content is still rewritten
by `execute.after`, like every tool result).

Within an AI text part or a tool result it runs as a second pass, *after* the
substitutions above:

```
substitute (punctuation/frames/shapes/arrows/math/emojis)  ->  strip everything outside the allowlisted blocks
```

**That order is load-bearing.** The strip **only ever deletes** — it never
rewrites a character into another one. Turning `—` into `-` or `✓` into `v` is
the sole job of the six tables, which run first. So in the real pipeline the em
dash is already `-` and the mapped emoji is already ASCII by the time the strip
sees the text, and nothing the tables produce can be caught by it. Only what
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
| 5 | General Punctuation (1 of 3)  | U+2000-U+200A  | en/em spaces                      |
| 6 | General Punctuation (2 of 3)  | U+2010-U+2027  | `—` `–` `…` `“”` `‘’` `•` `′` `″` `†` `‹›` `‰` |
| 7 | General Punctuation (3 of 3)  | U+2030-U+205E  | `⁃`                               |

**Blocks 2 to 4 are consecutive, so they collapse into a single range
U+00A0-U+024F** — each block starts at exactly the codepoint after the previous
one ends. Basic Latin is *not* adjacent to them (the C1 gap separates it), so
the allowlist is five ranges, not one, with exactly three holes. IPA
Extensions, Spacing Modifier Letters and Combining Diacritical Marks
(U+0250-U+036F) continue the run numerically but are **not** kept; see
[What it removes](#what-it-removes).

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

- **IPA Extensions, Spacing Modifier Letters and Combining Diacritical Marks**
  (U+0250-U+036F) — the three blocks that continue the Latin run numerically
  but are not kept. IPA letters (`ə` `ʃ` `ʔ`) and modifier letters (`ʰ` `ː`)
  are deleted, not transliterated, and a combining mark is deleted leaving its
  base: `e` + U+0301 becomes `e`. A precomposed `é` in Latin-1 is untouched.
- **Every other script** — Greek, Cyrillic, Arabic, Hebrew, CJK, kana, Hangul,
  Thai, Devanagari, … Greek and Coptic starts at U+0370, immediately above the
  removed U+0250-U+036F run.
- **The C1 controls** U+0080-U+009F, as above.
- **CJK punctuation** (U+3000-U+303F, U+30FB): `、` `。` `「」` `『』` `《》`
  `〈〉` `【】` `・`, and the ideographic space.
- **The invisible and format characters of General Punctuation**, as above. This
  is what removes the last of the emoji residue: an emoji ZWJ sequence like
  👨‍👩‍👧 is deleted completely, and `⚠️` loses its variation selector U+FE0F,
  rather than leaving bare zero-width joiners behind.
- **Emoji and symbols not in an open block.** The emoji table covers 709
  characters after every `:shortcode:` target was dropped (see
  [Table sourcing](#table-sourcing-anyascii)). Emoji that only ever mapped to a
  label — `🚀` `🔥` `✅` `👍` … — are now unmapped, so substitution leaves them
  and the strip deletes them. The Emoticons, Enclosed Alphanumeric Supplement
  and Supplemental Symbols and Pictographs blocks stay out for the same reason.
  With `emojis: false, stripNonLatin: true` *all* raw emoji are removed.
- **Symbols and operators** outside the kept blocks and outside the 13 open
  ones — `█` (Block Elements), the shade blocks, the C1 controls — because
  substitution now maps everything the open blocks contain and the strip takes
  the rest. Superscript and subscript digits (U+2070, U+2080) are in a later
  block and go too, unlike U+00B2 `²`, which is in Latin-1 and stays.
- **Fullwidth and halfwidth forms** U+FF00-U+FFEF — outside both the
  substitution blocks and the kept blocks, so they are deleted like any other
  out-of-scope character. `ＡＢＣ` becomes `` (empty), not `ABC`; the block is
  never folded.

#### What it never touches

Files. File content legitimately contains non-Latin text — translated
documentation, string tables, i18n fixtures — and deleting those characters
would be silent, irreversible data loss. A `write` or `edit` payload carrying
Japanese, Russian, or Arabic text is passed through untouched, even with
`stripNonLatin: true`; only the substitutions above are applied to it. Same for
`patch`, whose diff must match the target file byte for byte.

This holds across both file hooks: `execute.before` never substitutes past
`input.content` / `input.newString`, and `execute.after` only touches the result
body, which cannot modify a file payload on disk (though it does rewrite the
model-visible `read` result).

## Substitution reference

1712 entries across thirteen Unicode blocks in six categories, every value the AnyAscii 0.3.3 replacement verbatim except the `:shortcode:` labels, which are dropped wholesale. Each category can be disabled independently; see [Configuration](#configuration). The tables below are exhaustive — every row is a substitution the plugin applies. For provenance and the exclusion rules, see [Table sourcing (AnyAscii)](#table-sourcing-anyascii).

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

### Shapes (81)

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

### Arrows (362)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2192  | → | `>` |
| U+2190  | ← | `<` |
| U+2191  | ↑ | `^` |
| U+2193  | ↓ | `v` |
| U+21D2  | ⇒ | `>` |
| U+21D0  | ⇐ | `<` |
| U+21D4  | ⇔ | `-` |
| U+21C4  | ⇄ | `=` |

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

### Emojis and symbols (709)

| Unicode | Character | ASCII |
|---------|-----------|-------|
| U+2713  | ✓ | `v` |
| U+2139  | ℹ | `i` |
| U+2605  | ★ | `*` |
| U+2606  | ☆ | `*` |
| U+2610  | ☐ | `#` |
| U+2612  | ☒ | `x` |
| U+2318  | ⌘ | `#` |

and many more! Any symbol or emoji whose only AnyAscii value was a
Discord-style `:shortcode:` label (`🚀`, `🔥`, `✅`, `👍`, …) is **not** in the
tables at all — see [Table sourcing (AnyAscii)](#table-sourcing-anyascii).

See [`src/substitutions.ts`](src/substitutions.ts) for the full list.

### Table sourcing (AnyAscii)

[AnyAscii](https://github.com/anyascii/anyascii) tag **0.3.3** is the source of
**every substitution value** in the six tables above — WHOLESALE, not a curated
subset. All 1712 entries are the AnyAscii 0.3.3 replacement verbatim, across the
13 Unicode blocks the plugin already touched, after every Discord-style
`:shortcode:` target was dropped. Reproduce with
`python3 scripts/vendor-anyascii.py` (or verify with `--check`); the vendored
reference is `vendor/anyascii/table-0.3.3-subset.tsv`, one AnyAscii row per
mapped codepoint, and `--check` recoups every table value against it.

> **Re-vendoring note.** The subset is *not* a straight slice of upstream: it is
> upstream filtered through the exclusion rules in
> `scripts/vendor-anyascii.py` (Latin letters, out-of-scope blocks, empty
> replacements, `:shortcode:` labels). To bump the AnyAscii tag, regenerate the
> full table, re-filter it with those rules and re-pin `PINNED_SHA256`,
> `PINNED_COUNTS` and `FULL_TABLE_SHA256/ROWS`; do not copy the raw mapped rows.

Examples of the values this brings in: `→` is now `>` (was `->`), `≠` is `=`
(was `!=`), `∀` is `V` (was `all`), `↵` is `<` (was a real newline), `◉` is `*`
(previously deleted), `∫` is `S` (previously deleted), `⇄` is `=`.

#### What is never imported

- **Latin letters (the Latin-1 exception).** U+00A0-U+024F is inside the strip
  keep-set, so `é` `ł` `ø` `ß` survive the pipeline intact. AnyAscii
  transliterates them (`é` → `e`), which would corrupt the very text the
  keep-set preserves, so those entries are excluded. The same exclusion covers
  the Latin letters of U+0250-U+036F (IPA Extensions, Spacing Modifier
  Letters): the strip deletes those blocks outright, so transliterating them
  would leave ASCII residue instead. The only Latin-1 entries in the tables are
  symbols (`×` `÷` `±` `¬` `«` `»` `·` `¡` `¿` NBSP), never letters.
- **Blocks outside the 13 open ones.** Emoticons, Enclosed Alphanumeric
  Supplement, Supplemental Symbols and Pictographs, Currency Symbols, Block
  Elements, and every script block (Greek, Cyrillic, Arabic, Hebrew, CJK, kana,
  Hangul, Thai, Devanagari, …) stay unrepresented — no fourteenth block is
  opened, so a script entry is refused as out-of-scope. AnyAscii's
  transliteration, its core business, is deliberately ignored.
- **Empty AnyAscii replacements.** Where AnyAscii maps to `""` (ZWSP, emoji
  modifiers and friends) the strip already deletes the character.
- **Discord-style `:shortcode:` labels.** AnyAscii maps many symbols and emoji
  to `:rocket:`, `:thumbsup:`, `:black_large_square:`; those targets are dropped
  wholesale, so the characters are unmapped. The generator rejects any target
  matching `^:[a-z0-9_]+:$`.

#### The assumed conventions

The values are upstream, but two things are this plugin's choice, documented
rather than silent:

- **Dropping `:shortcode:` labels.** Instead of passing Discord/Slack shortcodes
  through as ASCII, every `:label:` target is refused (same list as the
  exclusion rule above).
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

Realistic consequence, stated plainly: the appearance-based symbols (`◉` `◆`)
still collapse to their ASCII approximation, and every emoji whose only upstream
value was a label is absent from the tables entirely, so the strip deletes it.
That is the trade of sourcing wholesale instead of curating glyph by glyph.

Pinned input is `vendor/anyascii/table-0.3.3-subset.tsv` — the mapped
non-`:shortcode:` rows of the AnyAscii tag 0.3.3 table (full table: 123799 rows,
SHA-256 63d405125a149ed646b6f932be96414e2db4b9ff5c3cb1fac49f6386a6fb1fa9, not
checked in; identity pinned in `scripts/vendor-anyascii.py`). The subset file is
SHA-256 verified on every run. The generator fails on any drift: subset hash change, a target that no
longer matches the subset, a spelling that decodes elsewhere, a non-ASCII target,
a duplicate key, a scope violation (<2 entries per block, unknown block,
13-block drift), a Latin letter, a `:shortcode:` label, or any
subset row left uncurated (completeness).

Licence: AnyAscii is **ISC** (Hunter WB) — see `LICENSE.anyascii`. The plugin
itself stays **MIT** (see `LICENSE`).

### Open blocks only

The tables are filled block by block, never opened for a new one: a block is
only ever represented with two or more entries, or not at all. WHOLESALE
saturates the 13 blocks that were already in play without opening a fourteenth,
which is why Emoticons, Enclosed Alphanumeric Supplement, Supplemental Symbols
and Pictographs and Currency Symbols remain absent. The generator enforces both
the 13-block set and the ≥2-per-block invariant on every run.

What is absent is absent because it is *excluded* (see
[What is never imported](#what-is-never-imported)), not overlooked. There is no
hand-picked "ambiguous, so refused" list: `∓` `∛` `⊗` `◉` and the
appearance-based symbols map to their AnyAscii forms.

See [`src/substitutions.ts`](src/substitutions.ts) for the authoritative list.

## How it works

The plugin registers six V2 hooks during `setup(ctx)`:

1. **`ctx.session.hook("context")`** — runs immediately before each agent-loop
   model request. The plugin rewrites the `text` parts of `assistant` messages
   in `event.messages`, applying substitutions and, if enabled, the opt-in
   `stripNonLatin` pass. User and tool messages, `event.system`, and reasoning
   parts (`type: "reasoning"`) are left alone. Compaction content parts
   (`type: "compaction"`) that carry a string summary are rewritten in any role.

   The same callback is registered for the **`compaction`**, **`generate`** and
   **`title`** request kinds as well. On OpenCode 2.0.30 these are separate
   hooks, and a transform meant to cover every request must register for each
   one. That means the `compaction` request's input transcript is rewritten, so
   the summary is generated from ASCII text (the replayed fallback summary
   itself arrives as a user text message and is left raw). The `title`
   registration is **inert**:
   `SessionTitle.generate` builds a single `user` message — wrapped as
   `"Original request: … Recent conversation: User: … Assistant: …"` when the
   session has a custom title, the raw user text otherwise — which never
   matches the assistant-text filter. All four kinds carry `event.messages`;
   the filter simply has nothing to match in the title prompt.

   Rewriting compaction summaries is a **deliberate risk**: a provider may
   treat the summary `text` as an opaque checkpoint and expect it back
   byte-identical. V1 never touched compaction parts. The host offers no
   separate model-visible field for the summary, so the alternative is to leave
   it raw; this plugin chooses to rewrite it.

2. **`ctx.tool.hook("execute.before")`** — fired before any tool executes. The
   plugin rewrites:
   - `event.input.content` for the `write` tool
   - `event.input.newString` for the `edit` tool (never `oldString` — it must match existing file content exactly)

   This hook applies substitutions only, never `stripNonLatin`. See [`stripNonLatin`](#stripnonlatin).

3. **`ctx.tool.hook("execute.after")`** — fired after a tool completes, with
   `event.result`. The plugin rewrites `result.content` (an array of content
   parts; a bare string is also tolerated defensively) through the same
   `substitute` → optional `stripNonLatin` pipeline used for AI text.
   `result.output` is never touched — it is the tool's declared structured
   value (V1's display body was `output.output`, which maps to `result.content`
   in V2). Failed calls (`status: "error"`) and `metadata` are left alone.

### AI text in V2

V1's `experimental.text.complete` rewrote each assistant text part after
streaming and before it was stored. **V2 has no equivalent hook** — the
migration guide lists no direct replacement and says to re-evaluate plugins that
used it. The narrowest V2 surface that carries assistant text is the `context`
hook's outgoing transcript, so that is where the text pass now runs. The same
callback is registered for the `compaction`, `generate` and `title` request
kinds, because each is a separate request and "a hook that should apply to every
request must register for each kind". All four exist on OpenCode 2.0.30. What
the rewrite actually reaches is narrower than the registration:

- assistant **`text` parts** and provider **`compaction` content parts**
  (`type: "compaction"`) in the outgoing transcript are rewritten, so what the
  model receives on later turns from those fields is ASCII (and `stripNonLatin`
  applies). The fallback `<conversation-checkpoint>` summary replays as a user
  text message and is left raw;
- **titles are left raw.** The `title` request is a single `user` message, built
  from the user's own language; rewriting it would neither match the
  assistant-text filter nor be desirable;
- **reasoning parts are left raw.** `type: "reasoning"` text is replayed to the
  model, but rewriting provider reasoning text is unsafe, so it passes through
  verbatim;
- the text already persisted and rendered for the turn that produced it is **not**
  rewritten, and it is not rewritten for display later either;
- the rewrite happens on a copy assembled for the request, so it is not
  destructive: the stored message keeps its original characters.

This is a deliberate, documented behaviour change from 0.2.0. It is also why the
plugin cannot claim to fix unicode already sitting in a session: the host offers
no post-stream, pre-persistence text hook, and no message-edit API.

### ctx.tool.hook("execute.after"): tool results

`shell`, `read`, `grep`, `glob`, `list`, `webfetch` and MCP tools surface
whatever they found, verbatim. None of that is rewritten by the `context` hook,
so without this hook a `cat` of a file containing CJK, or a `ls` of a Japanese
directory name, reached the model raw. This hook is the interception point the
host offers for tool results.

One consequence worth knowing: because `read` results are rewritten to ASCII
while `edit`'s `oldString` must match the existing file byte for byte, a model
that builds `oldString` from a rewritten `read` result can fail to match a file
containing unicode. This matches V1 behaviour.

`stripNonLatin` applies here, and unlike the `before` hook it applies to
**every** tool — the hook only reads `event.result` and never touches
`event.input`, so a file payload cannot be reached; there is nothing to protect.

Three consequences, stated plainly:

- **It is not display-only.** A tool result is stored in the transcript and
  replayed to the model on later turns. After stripping, the model sees
  `see file foo` where the tool actually returned `foo のドキュメント`. That is
  the intended trade — the option is opt-in — but `stripNonLatin` is genuinely
  lossy for any turn that continues past a tool call. Nothing is destroyed on
  disk: file payloads are still never stripped.
- **`result.output` is never mutated.** V2 tools return structured results:
  `read`, for example, puts the file in `output` as `{ type: "file", content:
  "…" }` and also exposes `content` as text parts. The plugin rewrites the
  `content` parts only — never a field inside a structured `output` payload.
  One nuance to know: when a tool returns no `content`, the host serializes its
  output into a text `content` part before this hook runs, and the plugin
  rewrites that serialization — so the model-visible form can change (and, for
  JSON-valued tools, can lose JSON validity), while `result.output` itself
  stays untouched. The plugin never recurses into a structured payload to
  guess which field is display text.
- **`metadata` is left alone.** It is structured data the TUI consumes (diff
  metadata, truncation flags, paths). Rewriting it risks the renderer for no
  display gain.

### Known limitation: no display rewriting

The `context` hook runs per model request, so the TUI renders the assistant's
tokens exactly as the provider produced them, with their original typography.
Only the copy sent to the model is substituted. There is no per-chunk or
display-time hook in the V2 host to do better, and the TUI plugin slots expose
no message-rendering boundary. Tool results do not have this problem: the
`execute.after` rewrite happens before the result is stored or rendered.

### patch is not rewritten

The V2 tool is named `patch` (V1 called it `apply_patch`). Its input is **not**
handled: the `input.patchText` payload is passed through verbatim (the patch
tool's result content is still rewritten by `execute.after`, like every tool
result).

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
