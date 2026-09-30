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
} from "../src/substitutions";

// Directory of this test file, for locating the vendored AnyAscii subset.
const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Array structure
// ---------------------------------------------------------------------------

describe("substitution arrays", () => {
  it("PUNCTUATION entries are all [string, string] pairs", () => {
    for (const [from, to] of PUNCTUATION) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
      expect(from.length).toBeGreaterThan(0);
    }
  });

  it("ARROWS entries are all [string, string] pairs", () => {
    for (const [from, to] of ARROWS) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
    }
  });

  it("FRAMES entries are all [string, string] pairs", () => {
    for (const [from, to] of FRAMES) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
      expect(from.length).toBeGreaterThan(0);
    }
  });

  it("SHAPES entries are all [string, string] pairs", () => {
    for (const [from, to] of SHAPES) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
      expect(from.length).toBeGreaterThan(0);
    }
  });

  it("MATH entries are all [string, string] pairs", () => {
    for (const [from, to] of MATH) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
    }
  });

  it("EMOJIS entries are all [string, string] pairs", () => {
    for (const [from, to] of EMOJIS) {
      expect(typeof from).toBe("string");
      expect(typeof to).toBe("string");
    }
  });

  it("supplementary-plane characters are single codepoints (not mis-escaped)", () => {
    // Every entry whose 'from' side is a supplementary plane character
    // must have .length === 2 (JS surrogate pair), NOT 3 or more
    // (which would indicate the \uXXXX mis-encoding concatenated extra chars).
    for (const [from] of [...PUNCTUATION, ...FRAMES, ...SHAPES, ...ARROWS, ...MATH, ...EMOJIS]) {
      const cp = from.codePointAt(0) ?? 0;
      if (cp > 0xffff) {
        // Surrogate pair = 2 UTF-16 code units. A mis-escaped \u1F680 would be
        // \u1F68 (1 unit) + "0" (1 unit) = 2 units but wrong character.
        // So we also verify the codepoint is actually what we expect.
        expect(from.length).toBe(2); // surrogate pair
        // Confirm it round-trips correctly
        expect(String.fromCodePoint(cp)).toBe(from);
      }
    }
  });

  it("rocket emoji 🚀 is correctly encoded in EMOJIS", () => {
    const rocket = EMOJIS.find(([k]) => k === "🚀");
    expect(rocket).toBeDefined();
    expect(rocket![0]).toBe("🚀");
    expect(rocket![1]).toBe(":rocket:");
  });

  it("light bulb emoji 💡 is correctly encoded in EMOJIS", () => {
    const bulb = EMOJIS.find(([k]) => k === "💡");
    expect(bulb).toBeDefined();
    expect(bulb![0]).toBe("💡");
  });
});

// ---------------------------------------------------------------------------
// buildSubstitutions
// ---------------------------------------------------------------------------

describe("buildSubstitutions", () => {
  it("returns all 6 categories by default (empty config)", () => {
    const subs = buildSubstitutions({});
    const fromSet = new Set(subs.map(([k]) => k));
    // Should contain entries from every category
    expect(fromSet.has("—")).toBe(true); // em dash -- PUNCTUATION
    expect(fromSet.has("┌")).toBe(true); // corner  -- FRAMES
    expect(fromSet.has("●")).toBe(true); // circle  -- SHAPES
    expect(fromSet.has("→")).toBe(true); // arrow ->  ARROWS
    expect(fromSet.has("≠")).toBe(true); // !=        MATH
    expect(fromSet.has("🚀")).toBe(true); // 🚀       EMOJIS
  });

  it("respects punctuation: false", () => {
    const subs = buildSubstitutions({ punctuation: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("—")).toBe(false); // em dash excluded
    expect(fromSet.has("→")).toBe(true); // arrows still in
  });

  it("respects frames: false", () => {
    const subs = buildSubstitutions({ frames: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("┌")).toBe(false); // corner excluded
    expect(fromSet.has("─")).toBe(false); // rule excluded
    expect(fromSet.has("—")).toBe(true); // punctuation still in
    expect(fromSet.has("●")).toBe(true); // shapes still in
  });

  it("respects shapes: false", () => {
    const subs = buildSubstitutions({ shapes: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("●")).toBe(false); // circle excluded
    expect(fromSet.has("■")).toBe(false); // square excluded
    expect(fromSet.has("┌")).toBe(true); // frames still in
    expect(fromSet.has("—")).toBe(true); // punctuation still in
  });

  it("respects arrows: false", () => {
    const subs = buildSubstitutions({ arrows: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("→")).toBe(false);
    expect(fromSet.has("—")).toBe(true);
  });

  it("respects math: false", () => {
    const subs = buildSubstitutions({ math: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("≠")).toBe(false);
    expect(fromSet.has("—")).toBe(true);
  });

  it("respects emojis: false", () => {
    const subs = buildSubstitutions({ emojis: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("🚀")).toBe(false);
    expect(fromSet.has("—")).toBe(true);
  });

  it("returns empty array when all categories disabled", () => {
    const subs = buildSubstitutions({
      punctuation: false,
      frames: false,
      shapes: false,
      arrows: false,
      math: false,
      emojis: false,
    });
    expect(subs.length).toBe(0);
  });

  it("isolates each of the 6 flags (one on, five off)", () => {
    // Only the enabled category converts; the rest stay raw.
    const OFF = {
      punctuation: false,
      frames: false,
      shapes: false,
      arrows: false,
      math: false,
      emojis: false,
    };
    const run = (text: string, config = {}) => {
      const subs = buildSubstitutions(config);
      const map = new Map<string, string>(subs);
      const regex = buildRegex(subs);
      regex.lastIndex = 0;
      return applySubstitutions(text, regex, map);
    };
    expect(run("a—b", { ...OFF, punctuation: true })).toBe("a-b");
    expect(run("a—b", OFF)).toBe("a—b");
    expect(run("a┌b", { ...OFF, frames: true })).toBe("a+b");
    expect(run("a┌b", OFF)).toBe("a┌b");
    expect(run("a●b", { ...OFF, shapes: true })).toBe("a*b");
    expect(run("a●b", OFF)).toBe("a●b");
    expect(run("a→b", { ...OFF, arrows: true })).toBe("a>b");
    expect(run("a→b", OFF)).toBe("a→b");
    expect(run("a≠b", { ...OFF, math: true })).toBe("a=b");
    expect(run("a≠b", OFF)).toBe("a≠b");
    expect(run("a🚀b", { ...OFF, emojis: true })).toBe("a:rocket:b");
    expect(run("a🚀b", OFF)).toBe("a🚀b");
  });
});

// ---------------------------------------------------------------------------
// buildRegex
// ---------------------------------------------------------------------------

describe("buildRegex", () => {
  it("returns a global regex", () => {
    const subs = buildSubstitutions({});
    const regex = buildRegex(subs);
    expect(regex.flags).toContain("g");
  });

  it("matches characters from the substitution set", () => {
    const subs: Array<[string, string]> = [["—", "--"]];
    const regex = buildRegex(subs);
    expect("—".match(regex)).not.toBeNull();
    expect("hello".match(regex)).toBeNull();
  });

  it("matches supplementary plane emoji correctly", () => {
    const subs: Array<[string, string]> = [["🚀", ":rocket:"]];
    const regex = buildRegex(subs);
    expect("launch 🚀 now".match(regex)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applySubstitutions
// ---------------------------------------------------------------------------

describe("applySubstitutions", () => {
  function makeEngine(pairs: Array<[string, string]>) {
    const map = new Map<string, string>(pairs);
    const regex = buildRegex(pairs);
    return (text: string) => {
      regex.lastIndex = 0;
      return applySubstitutions(text, regex, map);
    };
  }

  it("replaces em dash with double hyphen", () => {
    const sub = makeEngine([["—", "--"]]);
    expect(sub("foo — bar")).toBe("foo -- bar");
  });

  it("replaces right arrow", () => {
    const sub = makeEngine([["→", "->"]]);
    expect(sub("go → next")).toBe("go -> next");
  });

  it("replaces not-equal sign", () => {
    const sub = makeEngine([["≠", "!="]]);
    expect(sub("x ≠ y")).toBe("x != y");
  });

  it("replaces rocket emoji (supplementary plane)", () => {
    const sub = makeEngine([["🚀", ":rocket:"]]);
    expect(sub("launch 🚀 now")).toBe("launch :rocket: now");
  });

  it("replaces multiple different characters in one pass", () => {
    const sub = makeEngine([
      ["—", "--"],
      ["→", "->"],
      ["🚀", ":rocket:"],
    ]);
    expect(sub("— → 🚀")).toBe("-- -> :rocket:");
  });

  it("leaves unrecognised characters untouched", () => {
    const sub = makeEngine([["—", "--"]]);
    expect(sub("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    const sub = makeEngine([["—", "--"]]);
    expect(sub("")).toBe("");
  });

  it("handles text with no unicode", () => {
    const subs = buildSubstitutions({});
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);
    const text = "const x = 'hello world';";
    regex.lastIndex = 0;
    expect(applySubstitutions(text, regex, map)).toBe(text);
  });

  it("handles repeated substitution calls with the same regex (lastIndex reset)", () => {
    const pairs: Array<[string, string]> = [["—", "--"]];
    const map = new Map<string, string>(pairs);
    const regex = buildRegex(pairs);
    for (let i = 0; i < 5; i++) {
      regex.lastIndex = 0;
      expect(applySubstitutions("a — b", regex, map)).toBe("a -- b");
    }
  });
});

// ---------------------------------------------------------------------------
// Full pipeline (buildSubstitutions -> buildRegex -> applySubstitutions)
// ---------------------------------------------------------------------------

describe("full pipeline", () => {
  it("substitutes all 6 categories in a single text", () => {
    const subs = buildSubstitutions({});
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const input = "dash — frame ┌ shape ● arrow → not-equal ≠ rocket 🚀";
    regex.lastIndex = 0;
    const result = applySubstitutions(input, regex, map);
    expect(result).toBe("dash - frame + shape * arrow > not-equal = rocket :rocket:");
  });

  it("PUNCTUATION: covers the most common cases", () => {
    const subs = buildSubstitutions({
      arrows: false,
      math: false,
      emojis: false,
    });
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const cases: [string, string][] = [
      ["—", "-"], // em dash
      ["–", "-"], // en dash
      ["…", "..."], // ellipsis
      ["\u201C", '"'], // left double quotation mark (")
      ["\u201D", '"'], // right double quotation mark (")
      ["\u2018", "'"], // left single quotation mark (')
      ["\u2019", "'"], // right single quotation mark (')
      ["\u00AB", "<<"], // left-pointing double angle quotation mark («)
      ["\u00BB", ">>"], // right-pointing double angle quotation mark (»)
      ["\u2022", "*"], // bullet (•)
      ["\u2502", "|"], // box drawings light vertical (│)
      ["\u25BA", ">"], // black right-pointing pointer (►)
    ];

    for (const [unicode, ascii] of cases) {
      regex.lastIndex = 0;
      expect(applySubstitutions(unicode, regex, map)).toBe(ascii);
    }
  });

  it("ARROWS: covers common arrow characters", () => {
    const subs = buildSubstitutions({
      punctuation: false,
      math: false,
      emojis: false,
    });
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const cases: [string, string][] = [
      ["→", ">"], // rightwards arrow
      ["←", "<"], // leftwards arrow
      ["↔", ":left_right_arrow:"], // left right arrow
      ["⇒", ">"], // rightwards double arrow
      ["▼", "v"], // black down-pointing triangle
      ["▲", "^"], // black up-pointing triangle
    ];

    for (const [unicode, ascii] of cases) {
      regex.lastIndex = 0;
      expect(applySubstitutions(unicode, regex, map)).toBe(ascii);
    }
  });

  it("MATH: covers key math symbols", () => {
    const subs = buildSubstitutions({
      punctuation: false,
      arrows: false,
      emojis: false,
    });
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const cases: [string, string][] = [
      ["≠", "="], // not equal
      ["≤", "<="], // less-than or equal
      ["≥", ">="], // greater-than or equal
      ["×", "*"], // multiplication
      ["÷", "/"], // division
    ];

    for (const [unicode, ascii] of cases) {
      regex.lastIndex = 0;
      expect(applySubstitutions(unicode, regex, map)).toBe(ascii);
    }
  });
});

// ---------------------------------------------------------------------------
// FRAMES / SHAPES samples (AnyAscii values, measured against the tables)
// ---------------------------------------------------------------------------

describe("frames and shapes samples", () => {
  function sub(text: string, config = {}): string {
    const subs = buildSubstitutions(config);
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);
    regex.lastIndex = 0;
    return applySubstitutions(text, regex, map);
  }

  it("FRAMES: rules become - and |, joints become +", () => {
    const cases: Array<[string, string]> = [
      ["─", "-"], // light horizontal
      ["│", "|"], // light vertical
      ["━", "-"], // heavy horizontal
      ["┃", "|"], // heavy vertical
      ["┌", "+"], // corner
      ["┐", "+"], // corner
      ["└", "+"], // corner
      ["┘", "+"], // corner
      ["├", "+"], // tee
      ["┼", "+"], // cross
      ["═", "-"], // double horizontal
      ["║", "|"], // double vertical
      ["╔", "+"], // double corner
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
  });

  it("FRAMES: an ASCII-art frame stays readable", () => {
    expect(sub("┌────┐")).toBe("+----+");
    expect(sub("│ CI │")).toBe("| CI |");
  });

  it("SHAPES: filled and hollow pairs map by appearance", () => {
    const cases: Array<[string, string]> = [
      ["●", "*"], // black circle
      ["○", "*"], // white circle
      ["■", "#"], // black square
      ["□", "#"], // white square
      ["◆", "*"], // black diamond
      ["◇", "*"], // white diamond
      ["◊", "*"], // lozenge
      ["◎", "*"], // bullseye
      ["◉", "*"], // fisheye
      ["◢", "/"], // lower right triangle
      ["◣", "\\"], // lower left triangle
      ["⬛", ":black_large_square:"],
      ["⬜", ":white_large_square:"],
      ["▪", ":black_small_square:"],
      ["▫", ":white_small_square:"],
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
  });
});

// ---------------------------------------------------------------------------
// Table guardrails: scope, shape and provenance of the wholesale tables
// ---------------------------------------------------------------------------

describe("wholesale table guardrails", () => {
  const ALL = [
    ...PUNCTUATION,
    ...FRAMES,
    ...SHAPES,
    ...ARROWS,
    ...MATH,
    ...EMOJIS,
  ] as Array<[string, string]>;

  // The 13 open Unicode blocks. No entry may come from outside this set and
  // no block may be represented by a single entry.
  const OPEN_BLOCKS: Array<[string, number, number]> = [
    ["Latin-1 Supplement", 0x0080, 0x00ff],
    ["General Punctuation", 0x2000, 0x206f],
    ["Letterlike Symbols", 0x2100, 0x214f],
    ["Arrows", 0x2190, 0x21ff],
    ["Mathematical Operators", 0x2200, 0x22ff],
    ["Miscellaneous Technical", 0x2300, 0x23ff],
    ["Box Drawing", 0x2500, 0x257f],
    ["Geometric Shapes", 0x25a0, 0x25ff],
    ["Miscellaneous Symbols", 0x2600, 0x26ff],
    ["Dingbats", 0x2700, 0x27bf],
    ["Miscellaneous Symbols and Arrows", 0x2b00, 0x2bff],
    ["Miscellaneous Symbols and Pictographs", 0x1f300, 0x1f5ff],
    ["Transport and Map", 0x1f680, 0x1f6ff],
  ];

  function blockOf(cp: number): string | null {
    for (const [name, lo, hi] of OPEN_BLOCKS) {
      if (cp >= lo && cp <= hi) return name;
    }
    return null;
  }

  it("every entry lives in one of the 13 open blocks", () => {
    for (const [from] of ALL) {
      const cp = from.codePointAt(0)!;
      expect(blockOf(cp), `U+${cp.toString(16)}`).not.toBeNull();
    }
  });

  it("every open block has at least 2 entries", () => {
    const counts = new Map<string, number>();
    for (const [from] of ALL) {
      const name = blockOf(from.codePointAt(0)!)!;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(
      OPEN_BLOCKS.map(([name]) => name).sort(),
    );
    for (const [name] of OPEN_BLOCKS) {
      expect(counts.get(name) ?? 0, name).toBeGreaterThanOrEqual(2);
    }
  });

  it("every target is non-empty ASCII", () => {
    for (const [from, to] of ALL) {
      const cp = from.codePointAt(0)!;
      expect(to.length, `U+${cp.toString(16)}`).toBeGreaterThan(0);
      expect(to, `U+${cp.toString(16)}`).toMatch(/^[\x20-\x7E]*$/);
    }
  });

  it("no duplicate keys across the six tables", () => {
    const seen = new Map<string, number>();
    for (const [from] of ALL) {
      const cp = from.codePointAt(0)!;
      expect(seen.has(from), `duplicate U+${cp.toString(16)}`).toBe(false);
      seen.set(from, cp);
    }
  });

  it("every value matches the vendored AnyAscii subset row", () => {
    // Wholesale proof: vendor/anyascii/table-0.3.3-subset.tsv holds one
    // AnyAscii 0.3.3 row per mapped codepoint; each table value must equal
    // its row verbatim, and the row count must equal the table size.
    const raw = readFileSync(
      join(here, "..", "vendor", "anyascii", "table-0.3.3-subset.tsv"),
      "utf-8",
    );
    const rows = new Map<string, string>();
    for (const line of raw.split("\n")) {
      if (!line) continue;
      const tab = line.indexOf("\t");
      rows.set(line.slice(0, tab), tab === -1 ? "" : line.slice(tab + 1));
    }
    expect(rows.size).toBe(ALL.length);
    for (const [from, to] of ALL) {
      expect(rows.get(from), JSON.stringify(from)).toBe(to);
    }
  });
});
