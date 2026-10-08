import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUNCTUATION,
  FRAMES,
  SHAPES,
  ARROWS,
  MATH,
  EMOJIS,
  buildSubstitutions,
  buildRegex,
  applySubstitutions,
  stripNonLatinChars,
} from "../src/substitutions";

const here = dirname(fileURLToPath(import.meta.url));
const ALL = [...PUNCTUATION, ...FRAMES, ...SHAPES, ...ARROWS, ...MATH, ...EMOJIS];
const CATEGORIES = { punctuation: PUNCTUATION, frames: FRAMES, shapes: SHAPES, arrows: ARROWS, math: MATH, emojis: EMOJIS };

// ---------------------------------------------------------------------------
// Table integrity
// ---------------------------------------------------------------------------

describe("substitution tables", () => {
  it("are non-empty [string, string] pairs keyed by one codepoint", () => {
    for (const [from, to] of ALL) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
      expect([...from]).toHaveLength(1);
    }
  });

  it("encode supplementary-plane keys as valid surrogate pairs", () => {
    for (const [from] of ALL) {
      const cp = from.codePointAt(0)!;
      if (cp > 0xffff) expect(String.fromCodePoint(cp)).toBe(from);
    }
  });

  it("carry no duplicate key", () => {
    const seen = new Set<number>();
    const dup = new Set<number>();
    for (const [from] of ALL) {
      const cp = from.codePointAt(0)!;
      if (seen.has(cp)) dup.add(cp);
      seen.add(cp);
    }
    expect([...dup]).toEqual([]);
    expect(seen.size).toBe(ALL.length);
  });

  it("target pure ASCII and never a :shortcode: label", () => {
    for (const [from, to] of ALL) {
      expect(/^[\x20-\x7E\n]*$/.test(to), `${from} -> ${JSON.stringify(to)}`).toBe(true);
      expect(/^:[a-z0-9_]+:$/.test(to), `shortcode ${to}`).toBe(false);
    }
  });

  it("match the vendored AnyAscii subset row for row", () => {
    const raw = readFileSync(join(here, "..", "vendor", "anyascii", "table-0.3.3-subset.tsv"), "utf-8");
    const rows = new Map<string, string>();
    for (const line of raw.split("\n")) {
      if (!line) continue;
      const tab = line.indexOf("\t");
      rows.set(line.slice(0, tab), tab === -1 ? "" : line.slice(tab + 1));
    }
    expect(rows.size).toBe(ALL.length);
    for (const [from, to] of ALL) expect(rows.get(from), JSON.stringify(from)).toBe(to);
  });
});

// ---------------------------------------------------------------------------
// buildSubstitutions
// ---------------------------------------------------------------------------

describe("buildSubstitutions", () => {
  const SAMPLE: Array<[keyof typeof CATEGORIES, string]> = [
    ["punctuation", "—"],
    ["frames", "┌"],
    ["shapes", "●"],
    ["arrows", "→"],
    ["math", "≠"],
    ["emojis", "✓"],
  ];

  it("enables all six categories by default", () => {
    const keys = new Set(buildSubstitutions({}).map(([k]) => k));
    for (const [, ch] of SAMPLE) expect(keys.has(ch), ch).toBe(true);
  });

  it("drops exactly the disabled category", () => {
    for (const [cat, ch] of SAMPLE) {
      const keys = new Set(buildSubstitutions({ [cat]: false }).map(([k]) => k));
      expect(keys.has(ch), cat).toBe(false);
      for (const [other, otherCh] of SAMPLE) {
        if (other !== cat) expect(keys.has(otherCh), `${cat} killed ${other}`).toBe(true);
      }
    }
    const off = Object.fromEntries(SAMPLE.map(([cat]) => [cat, false]));
    expect(buildSubstitutions(off).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildRegex / applySubstitutions
// ---------------------------------------------------------------------------

describe("buildRegex / applySubstitutions", () => {
  it("compiles one global character class that matches every key and nothing else", () => {
    const subs = buildSubstitutions({});
    const regex = buildRegex(subs);
    expect(regex.flags).toContain("g");
    // A single class (not an alternation) is the performance contract.
    expect(regex.source.startsWith("[")).toBe(true);
    for (const [from] of subs) expect(`a${from}b`.match(regex), JSON.stringify(from)).not.toBeNull();
    for (const ch of ["A", "é", "λ", "€", "世", "🧠", "\u0000"]) expect(ch.match(regex), ch).toBeNull();
  });

  it("replaces every match in one pass, leaving the rest byte-identical", () => {
    const subs = buildSubstitutions({});
    const map = new Map(subs);
    const regex = buildRegex(subs);
    const run = (text: string) => {
      regex.lastIndex = 0;
      return applySubstitutions(text, regex, map);
    };
    expect(run("dash — arrow → check ✓ 世界")).toBe("dash - arrow > check v 世界");
    expect(run("no unicode here")).toBe("no unicode here");
    expect(run("")).toBe("");
    // Repeated calls must reset the stateful /g lastIndex.
    expect(run("a — b")).toBe("a - b");
    expect(run("a — b")).toBe("a - b");
  });
});

// ---------------------------------------------------------------------------
// stripNonLatinChars
// ---------------------------------------------------------------------------

describe("stripNonLatinChars", () => {
  function sweep(lo: number, hi: number, want: (ch: string) => string): void {
    for (let c = lo; c <= hi; c++) {
      const ch = String.fromCharCode(c);
      expect(stripNonLatinChars(`a${ch}b`), `U+${c.toString(16)}`).toBe(want(ch));
    }
  }

  it("keeps Basic Latin", () => {
    sweep(0x00, 0x7f, (ch) => `a${ch}b`);
  });

  it("keeps the Latin blocks U+00A0-U+024F", () => {
    sweep(0xa0, 0x24f, (ch) => `a${ch}b`);
  });

  it("deletes the C1 controls U+0080-U+009F", () => {
    sweep(0x80, 0x9f, () => "ab");
  });

  it("deletes the hole U+0250-U+1FFF (IPA, Spacing Modifier, Combining, scripts, CJK)", () => {
    sweep(0x250, 0x1fff, () => "ab");
    expect(stripNonLatinChars("a\u036f/b")).toBe("a/b"); // combining mark dropped, base kept
  });

  it("keeps the visible General Punctuation runs and deletes the invisible ones", () => {
    for (const [lo, hi] of [[0x2000, 0x200a], [0x2010, 0x2027], [0x2030, 0x205e]] as const) {
      sweep(lo, hi, (ch) => `a${ch}b`);
    }
    for (const [lo, hi] of [[0x200b, 0x200f], [0x2028, 0x202f], [0x205f, 0x206f]] as const) {
      sweep(lo, hi, () => "ab");
    }
  });

  it("deletes the fullwidth/halfwidth block instead of folding it", () => {
    sweep(0xff00, 0xffef, () => "ab");
    expect(stripNonLatinChars("（ABC）")).toBe("ABC");
  });

  it("deletes symbols, emoji and shortcode-only emoji outside the kept blocks", () => {
    expect(stripNonLatinChars("a≠b")).toBe("ab");
    expect(stripNonLatinChars("a√b")).toBe("ab");
    expect(stripNonLatinChars("a─b")).toBe("ab");
    expect(stripNonLatinChars("a►b")).toBe("ab");
    expect(stripNonLatinChars("a█b")).toBe("ab");
    // Bare strip deletes every non-kept codepoint, mapped or not.
    expect(stripNonLatinChars("launch 🚀 check ✓ now")).toBe("launch  check  now");
    expect(stripNonLatinChars("👨‍👩‍👧")).toBe("");
    expect(stripNonLatinChars("⚠️ x")).toBe(" x");
  });

  it("is idempotent, only deletes, and is a no-op on ASCII", () => {
    expect(stripNonLatinChars("")).toBe("");
    expect(stripNonLatinChars("const x = 1; // fine")).toBe("const x = 1; // fine");
    const once = stripNonLatinChars("a ≠ 你 b Привет 🚀");
    expect(stripNonLatinChars(once)).toBe(once);

    const input = "a—b≠c→d🚀eＡf«g»h＋i🧠j";
    const out = stripNonLatinChars(input);
    let i = 0;
    for (const ch of out) {
      const at = input.indexOf(ch, i);
      expect(at, JSON.stringify(ch)).toBeGreaterThanOrEqual(0);
      i = at + 1;
    }
    expect(stripNonLatinChars("hello 世界、。「」 ＡＢＣ 🧠 Привет")).toBe("hello" + " ".repeat(4));
  });
});

// ---------------------------------------------------------------------------
// Scope invariant (blocks) and pinned counts
// ---------------------------------------------------------------------------

const UNICODE_BLOCKS: Array<[number, number, string]> = [
  [0x0000, 0x007f, "Basic Latin"],
  [0x0080, 0x00ff, "Latin-1 Supplement"],
  [0x0100, 0x017f, "Latin Extended-A"],
  [0x0180, 0x024f, "Latin Extended-B"],
  [0x0250, 0x02af, "IPA Extensions"],
  [0x02b0, 0x02ff, "Spacing Modifier Letters"],
  [0x0300, 0x036f, "Combining Diacritical Marks"],
  [0x0370, 0x03ff, "Greek and Coptic"],
  [0x0400, 0x04ff, "Cyrillic"],
  [0x0590, 0x05ff, "Hebrew"],
  [0x0600, 0x06ff, "Arabic"],
  [0x2000, 0x206f, "General Punctuation"],
  [0x2070, 0x209f, "Superscripts and Subscripts"],
  [0x20a0, 0x20cf, "Currency Symbols"],
  [0x20d0, 0x20ff, "Combining Diacritical Marks for Symbols"],
  [0x2100, 0x214f, "Letterlike Symbols"],
  [0x2150, 0x218f, "Number Forms"],
  [0x2190, 0x21ff, "Arrows"],
  [0x2200, 0x22ff, "Mathematical Operators"],
  [0x2300, 0x23ff, "Miscellaneous Technical"],
  [0x2400, 0x243f, "Control Pictures"],
  [0x2440, 0x245f, "Optical Character Recognition"],
  [0x2460, 0x24ff, "Enclosed Alphanumerics"],
  [0x2500, 0x257f, "Box Drawing"],
  [0x2580, 0x259f, "Block Elements"],
  [0x25a0, 0x25ff, "Geometric Shapes"],
  [0x2600, 0x26ff, "Miscellaneous Symbols"],
  [0x2700, 0x27bf, "Dingbats"],
  [0x27c0, 0x27ef, "Miscellaneous Math Symbols-A"],
  [0x27f0, 0x27ff, "Supplemental Arrows-A"],
  [0x2800, 0x28ff, "Braille Patterns"],
  [0x2900, 0x297f, "Supplemental Arrows-B"],
  [0x2980, 0x29ff, "Miscellaneous Math Symbols-B"],
  [0x2a00, 0x2aff, "Supplemental Math Operators"],
  [0x2b00, 0x2bff, "Miscellaneous Symbols and Arrows"],
  [0x1f000, 0x1f02f, "Mahjong Tiles"],
  [0x1f0a0, 0x1f0ff, "Playing Cards"],
  [0x1f100, 0x1f1ff, "Enclosed Alphanumeric Supplement"],
  [0x1f200, 0x1f2ff, "Enclosed Ideographic Supplement"],
  [0x1f300, 0x1f5ff, "Miscellaneous Symbols and Pictographs"],
  [0x1f600, 0x1f64f, "Emoticons"],
  [0x1f650, 0x1f67f, "Ornamental Dingbats"],
  [0x1f680, 0x1f6ff, "Transport and Map"],
  [0x1f700, 0x1f77f, "Alchemical Symbols"],
  [0x1f780, 0x1f7ff, "Geometric Shapes Extended"],
  [0x1f800, 0x1f8ff, "Supplemental Arrows-C"],
  [0x1f900, 0x1f9ff, "Supplemental Symbols and Pictographs"],
  [0x1fa00, 0x1fa6f, "Chess Symbols"],
  [0x1fa70, 0x1faff, "Symbols and Pictographs Extended-A"],
];

function blockOf(cp: number): string {
  for (const [lo, hi, name] of UNICODE_BLOCKS) if (cp >= lo && cp <= hi) return name;
  return `unlisted block (U+${cp.toString(16).toUpperCase()})`;
}

describe("scope invariant", () => {
  const byBlock = new Map<string, string[]>();
  for (const [from] of ALL) {
    const name = blockOf(from.codePointAt(0)!);
    if (!byBlock.has(name)) byBlock.set(name, []);
    byBlock.get(name)!.push(from);
  }

  it("every represented block has two or more entries", () => {
    const thin = [...byBlock].filter(([, chars]) => chars.length < 2).map(([name]) => name);
    expect(thin).toEqual([]);
  });

  it("resolves every entry to a known block", () => {
    const unknown = ALL.map(([from]) => from).filter((ch) => blockOf(ch.codePointAt(0)!).startsWith("unlisted"));
    expect(unknown).toEqual([]);
  });

  it("covers the pinned 13 blocks and per-category counts", () => {
    expect(byBlock.size).toBe(13);
    expect(ALL.length).toBe(1712);
    expect(PUNCTUATION.length).toBe(172);
    expect(FRAMES.length).toBe(128);
    expect(SHAPES.length).toBe(81);
    expect(ARROWS.length).toBe(362);
    expect(MATH.length).toBe(260);
    expect(EMOJIS.length).toBe(709);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: substitute first, then strip
// ---------------------------------------------------------------------------

describe("pipeline", () => {
  function run(text: string, config = {}): string {
    const subs = buildSubstitutions(config);
    const map = new Map(subs);
    const regex = buildRegex(subs);
    regex.lastIndex = 0;
    return stripNonLatinChars(applySubstitutions(text, regex, map));
  }

  it("produces pure ASCII for a mixed torture string", () => {
    const out = run("Status — 50%\n· 世界：ok、ok\n· ＡＢＣ 🧠 «done» ✓ αβγ ≠ 1");
    expect(out).toBe("Status - 50%\n- okok\n-   <<done>> v  = 1");
    expect(/^[\x20-\x7E\n]*$/.test(out)).toBe(true);
  });

  it("keeps ASCII art, accented Latin and precomposed accents readable", () => {
    expect(run("CI ┌────┐ passed")).toBe("CI +----+ passed");
    expect(run("status ● on ○ off ■ □")).toBe("status * on * off # #");
    expect(run("Café déjà vu — naïve 42")).toBe("Café déjà vu - naïve 42");
    expect(run("cafe\u0301")).toBe("cafe");
    expect(run("caf\u00e9")).toBe("caf\u00e9");
    expect(run("Łódź — ā œ")).toBe("Łódź - ā œ");
  });

  it("strips emoji that only ever mapped to a :shortcode: label", () => {
    expect(run("deploy 🚀 fire 🔥 check ✓")).toBe("deploy  fire  check v");
  });

  it("isolates each category flag", () => {
    const OFF = { punctuation: false, frames: false, shapes: false, arrows: false, math: false, emojis: false };
    // All off: substitution is inert and the strip deletes the non-kept glyphs.
    expect(run("a┌b ● ✓", OFF)).toBe("ab  ");
    expect(run("a┌b", { ...OFF, frames: true })).toBe("a+b");
    expect(run("a●b", { ...OFF, shapes: true })).toBe("a*b");
    expect(run("a—b", { ...OFF, punctuation: true })).toBe("a-b");
    expect(run("a—b", OFF)).toBe("a—b");
  });

  it("maps ↵ to <, so no table entry changes line structure", () => {
    const out = run("first↵second");
    expect(out).toBe("first<second");
    expect(out.indexOf("\n")).toBe(-1);
  });
});
