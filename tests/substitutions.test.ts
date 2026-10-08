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

  it("EMOJIS emoji codepoints above U+FFFF are single surrogate pairs (not mis-escaped)", () => {
    // A mis-escaped \u1F680 would be \u1F68 + "0": still 2 units but the
    // wrong character, so length alone is not enough — the codepoint must
    // round-trip too.
    for (const [from] of EMOJIS) {
      const cp = from.codePointAt(0) ?? 0;
      if (cp > 0xffff) {
        expect(from.length).toBe(2); // surrogate pair
        expect(String.fromCodePoint(cp)).toBe(from);
      }
    }
  });

  it("drops emoji whose only AnyAscii value was a :shortcode: label", () => {
    // 🚀 -> :rocket: and 💡 -> :bulb: upstream. A label is not a
    // transliteration, so rule 6 in scripts/vendor-anyascii.py drops them and
    // they stay unmapped. No EMOJIS value may be a :shortcode: at all.
    const keys = EMOJIS.map(([from]) => from);
    expect(keys).not.toContain("🚀");
    expect(keys).not.toContain("💡");
    expect(EMOJIS.every(([, to]) => !/^:[a-z0-9_]+:$/.test(to))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildSubstitutions
// ---------------------------------------------------------------------------

describe("buildSubstitutions", () => {
  it("returns all 6 categories by default (empty config)", () => {
    const subs = buildSubstitutions({});
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("—")).toBe(true); // em dash -- PUNCTUATION
    expect(fromSet.has("┌")).toBe(true); // corner -- FRAMES
    expect(fromSet.has("●")).toBe(true); // black circle -- SHAPES
    expect(fromSet.has("→")).toBe(true); // arrow ->  ARROWS
    expect(fromSet.has("≠")).toBe(true); // !=        MATH
    expect(fromSet.has("✓")).toBe(true); // check     EMOJIS
  });

  it("has the AnyAscii-sourced per-category counts", () => {
    // Pinned so a silent add or remove is visible in the diff. WHOLESALE
    // AnyAscii 0.3.3, minus every :shortcode: target (rule 4): every value is
    // upstream verbatim across the 13 open blocks — punctuation 172, frames
    // 128, shapes 81, arrows 362, math 260, emojis 709, total 1712.
    expect(PUNCTUATION.length).toBe(172);
    expect(FRAMES.length).toBe(128);
    expect(SHAPES.length).toBe(81);
    expect(ARROWS.length).toBe(362);
    expect(MATH.length).toBe(260);
    expect(EMOJIS.length).toBe(709);
    expect(buildSubstitutions({}).length).toBe(1712);
  });

  it("respects punctuation: false", () => {
    const subs = buildSubstitutions({ punctuation: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("—")).toBe(false); // em dash excluded
    expect(fromSet.has("→")).toBe(true); // arrows still in
    expect(fromSet.has("┌")).toBe(true); // frames still in (own flag)
    expect(fromSet.has("●")).toBe(true); // shapes still in (own flag)
  });

  it("respects frames: false", () => {
    const subs = buildSubstitutions({ frames: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("┌")).toBe(false); // corner excluded
    expect(fromSet.has("─")).toBe(false); // light horizontal excluded
    expect(fromSet.has("━")).toBe(false); // heavy horizontal excluded
    expect(fromSet.has("—")).toBe(true); // punctuation still in
    expect(fromSet.has("●")).toBe(true); // shapes still in
  });

  it("respects shapes: false", () => {
    const subs = buildSubstitutions({ shapes: false });
    const fromSet = new Set(subs.map(([k]) => k));
    expect(fromSet.has("●")).toBe(false); // black circle excluded
    expect(fromSet.has("□")).toBe(false); // white square excluded
    expect(fromSet.has("⬜")).toBe(false); // white large square excluded
    expect(fromSet.has("—")).toBe(true); // punctuation still in
    expect(fromSet.has("┌")).toBe(true); // frames still in
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
    expect(fromSet.has("✓")).toBe(false);
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

  it("coalesces the full table into 125 pinned ranges", () => {
    // The performance cliff this locks: an alternation of all 1712 entries
    // pushes V8 onto the interpreter (measured 648 ms per 100 KB of matching
    // text vs 0.5 ms as a class, byte-identical output), while a class
    // compiles to a range table. These bounds are the contract — a table edit
    // that opens a gap or a new run must update them deliberately.
    const ranges = classRanges(buildRegex(buildSubstitutions({})).source);
    expect(ranges.length).toBe(125);
    expect(ranges).toEqual([
      [0x00a0, 0x00a1],
      [0x00ab, 0x00ac],
      [0x00b1, 0x00b1],
      [0x00b7, 0x00b7],
      [0x00bb, 0x00bb],
      [0x00bf, 0x00bf],
      [0x00d7, 0x00d7],
      [0x00f7, 0x00f7],
      [0x2000, 0x200a],
      [0x2010, 0x2029],
      [0x202f, 0x205f],
      [0x2100, 0x214f],
      [0x2190, 0x2193],
      [0x219a, 0x21a8],
      [0x21ab, 0x2319],
      [0x231c, 0x2327],
      [0x2329, 0x23ce],
      [0x23d0, 0x23e8],
      [0x23f4, 0x23f7],
      [0x23fb, 0x23ff],
      [0x2500, 0x257f],
      [0x25a0, 0x25a9],
      [0x25ac, 0x25b5],
      [0x25b7, 0x25bf],
      [0x25c1, 0x25fa],
      [0x25ff, 0x25ff],
      [0x2605, 0x260d],
      [0x260f, 0x2610],
      [0x2612, 0x2613],
      [0x2616, 0x2617],
      [0x2619, 0x261c],
      [0x261e, 0x261f],
      [0x2621, 0x2621],
      [0x2624, 0x2625],
      [0x2627, 0x2629],
      [0x262b, 0x262d],
      [0x2630, 0x2637],
      [0x263b, 0x263f],
      [0x2641, 0x2641],
      [0x2643, 0x2647],
      [0x2654, 0x265e],
      [0x2661, 0x2662],
      [0x2664, 0x2664],
      [0x2667, 0x2667],
      [0x2669, 0x267a],
      [0x267c, 0x267d],
      [0x2680, 0x2691],
      [0x2698, 0x2698],
      [0x269a, 0x269a],
      [0x269d, 0x269f],
      [0x26a2, 0x26a6],
      [0x26a8, 0x26a9],
      [0x26ac, 0x26af],
      [0x26b2, 0x26bc],
      [0x26bf, 0x26c3],
      [0x26c6, 0x26c7],
      [0x26c9, 0x26cd],
      [0x26d0, 0x26d0],
      [0x26d2, 0x26d2],
      [0x26d5, 0x26e8],
      [0x26eb, 0x26ef],
      [0x26f6, 0x26f6],
      [0x26fb, 0x26fc],
      [0x26fe, 0x2701],
      [0x2703, 0x2704],
      [0x2706, 0x2707],
      [0x270e, 0x270e],
      [0x2710, 0x2711],
      [0x2713, 0x2713],
      [0x2715, 0x2715],
      [0x2717, 0x271c],
      [0x271e, 0x2720],
      [0x2722, 0x2727],
      [0x2729, 0x2732],
      [0x2735, 0x2743],
      [0x2745, 0x2746],
      [0x2748, 0x274b],
      [0x274d, 0x274d],
      [0x274f, 0x2752],
      [0x2756, 0x2756],
      [0x2758, 0x2762],
      [0x2765, 0x2794],
      [0x2798, 0x27a0],
      [0x27a2, 0x27af],
      [0x27b1, 0x27be],
      [0x2b00, 0x2b04],
      [0x2b08, 0x2b1a],
      [0x2b1d, 0x2b4f],
      [0x2b51, 0x2b54],
      [0x2b56, 0x2b73],
      [0x2b76, 0x2b95],
      [0x2b97, 0x2bff],
      [0x1f322, 0x1f323],
      [0x1f394, 0x1f395],
      [0x1f398, 0x1f398],
      [0x1f39c, 0x1f39d],
      [0x1f3f1, 0x1f3f2],
      [0x1f3f6, 0x1f3f6],
      [0x1f4fe, 0x1f4fe],
      [0x1f53e, 0x1f548],
      [0x1f54f, 0x1f54f],
      [0x1f568, 0x1f56e],
      [0x1f571, 0x1f572],
      [0x1f57b, 0x1f586],
      [0x1f588, 0x1f589],
      [0x1f58e, 0x1f58f],
      [0x1f591, 0x1f594],
      [0x1f597, 0x1f5a3],
      [0x1f5a6, 0x1f5a7],
      [0x1f5a9, 0x1f5b0],
      [0x1f5b3, 0x1f5bb],
      [0x1f5bd, 0x1f5c1],
      [0x1f5c5, 0x1f5d0],
      [0x1f5d4, 0x1f5db],
      [0x1f5df, 0x1f5e0],
      [0x1f5e2, 0x1f5e2],
      [0x1f5e4, 0x1f5e7],
      [0x1f5e9, 0x1f5ee],
      [0x1f5f0, 0x1f5f2],
      [0x1f5f4, 0x1f5f9],
      [0x1f6c6, 0x1f6ca],
      [0x1f6d3, 0x1f6d4],
      [0x1f6e6, 0x1f6e8],
      [0x1f6ea, 0x1f6ea],
      [0x1f6f1, 0x1f6f2],
    ]);
  });

  it("matches every table character through the class", () => {
    const subs = buildSubstitutions({});
    const regex = buildRegex(subs);
    for (const [from] of subs) {
      // String.match with /g ignores lastIndex, so the shared stateful
      // regex needs no reset between iterations.
      expect(`a${from}b`.match(regex)).not.toBeNull();
    }
  });

  it("leaves characters outside the class unmatched", () => {
    const subs = buildSubstitutions({});
    const regex = buildRegex(subs);
    // None of these sits inside the 125 ranges above.
    for (const ch of ["A", "é", "λ", "世", "🧠", "🫠", "\u0000"]) {
      expect(ch.match(regex)).toBeNull();
    }
  });
});

/** Parse a character-class source back into its sorted [lo, hi] ranges. */
function classRanges(source: string): Array<[number, number]> {
  const inner = source.slice(1, -1);
  const tokens = inner.match(/\\u(\{[0-9a-f]+\}|[0-9a-f]{4})/g) ?? [];
  const seps = inner.split(/\\u(?:\{[0-9a-f]+\}|[0-9a-f]{4})/g);
  const cps = tokens.map((t) =>
    t.startsWith("\\u{")
      ? parseInt(t.slice(3, -1), 16)
      : parseInt(t.slice(2), 16),
  );
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (i < cps.length) {
    // A "-" separator between two escapes denotes a range; anything else
    // (start, end, or a singleton run) is a boundary.
    if (seps[i + 1] === "-" && i + 1 < cps.length) {
      ranges.push([cps[i], cps[i + 1]]);
      i += 2;
    } else {
      ranges.push([cps[i], cps[i]]);
      i += 1;
    }
  }
  return ranges;
}

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
// stripNonLatinChars
// ---------------------------------------------------------------------------

describe("stripNonLatinChars", () => {
  // -------------------------------------------------------------------
  // Block allowlist: what is KEPT
  //   U+0000-U+007F  Basic Latin / ASCII
  //   U+00A0-U+024F  Latin-1 Supplement, Latin Extended-A, Latin Extended-B
  //   U+2000-U+200A, U+2010-U+2027, U+2030-U+205E  General Punctuation
  //                   minus the invisible/format characters
  // Everything else is deleted, IPA Extensions, Spacing Modifier Letters,
  // Combining Diacritical Marks and the fullwidth/halfwidth block included.
  // -------------------------------------------------------------------

  it("keeps the whole ASCII block U+0000-U+007F", () => {
    for (let c = 0x00; c <= 0x7f; c++) {
      const ch = String.fromCharCode(c);
      expect(stripNonLatinChars(`a${ch}b`)).toBe(`a${ch}b`);
    }
  });

  it("keeps the three Latin blocks in one contiguous range U+00A0-U+024F", () => {
    // Latin-1 Supplement (U+00A0-U+00FF), Latin Extended-A (U+0100-U+017F) and
    // Latin Extended-B (U+0180-U+024F) are consecutive blocks, so a single
    // range covers all three. This sweep checks every codepoint in that range,
    // so a future edit that moves a boundary cannot slip through.
    for (let c = 0xa0; c <= 0x24f; c++) {
      const ch = String.fromCharCode(c);
      expect(stripNonLatinChars(`a${ch}b`), `U+${c.toString(16)}`).toBe(
        `a${ch}b`,
      );
    }
  });

  it("strips everything from U+0250 up to U+1FFF (the hole after the Latin blocks)", () => {
    expect(stripNonLatinChars("aɐb")).toBe("ab"); // U+0250 IPA Extensions
    expect(stripNonLatinChars("aʰb")).toBe("ab"); // U+02B0 Spacing Modifier Letters
    expect(stripNonLatinChars("a\u0300b")).toBe("ab"); // U+0300 Combining Diacritical Marks
    expect(stripNonLatinChars("aͰb")).toBe("ab"); // U+0370 Greek and Coptic
    expect(stripNonLatinChars("aαb")).toBe("ab"); // U+03B1 Greek
    expect(stripNonLatinChars("aПb")).toBe("ab"); // U+041F Cyrillic
    expect(stripNonLatinChars("a√b")).toBe("ab"); // U+221A, just below GP
    expect(stripNonLatinChars("a█b")).toBe("ab"); // U+2588 full block
  });

  it("strips the C1 controls U+0080-U+009F (the hole before the Latin blocks)", () => {
    for (let c = 0x80; c <= 0x9f; c++) {
      const ch = String.fromCharCode(c);
      expect(stripNonLatinChars(`a${ch}b`)).toBe("ab");
    }
    // Called out explicitly: U+0085 NEL is the one that used to corrupt output.
    expect(stripNonLatinChars("ab")).toBe("ab");
  });

  it("keeps precomposed and Latin-1 accents", () => {
    expect(stripNonLatinChars("Café déjà vu ñ ø")).toBe("Café déjà vu ñ ø");
    expect(stripNonLatinChars("Straße × ÷ ± ¬")).toBe("Straße × ÷ ± ¬");
  });

  it("keeps Latin Extended (U+0100-U+024F)", () => {
    expect(stripNonLatinChars("Łódź")).toBe("Łódź");
    expect(stripNonLatinChars("č š ž")).toBe("č š ž");
    expect(stripNonLatinChars("ā œ")).toBe("ā œ");
    expect(stripNonLatinChars("Héłło")).toBe("Héłło");
    expect(stripNonLatinChars("ĂȘŐ ș ț")).toBe("ĂȘŐ ș ț");
  });

  it("removes IPA Extensions (U+0250-U+02AF)", () => {
    expect(stripNonLatinChars("əɛɔʁ")).toBe("");
    expect(stripNonLatinChars("ɸʃʔ")).toBe("");
    // ASCII spaces between removed letters survive.
    expect(stripNonLatinChars("ə ɛ")).toBe(" ");
    // ŋ (U+014B) looks like IPA but is Latin Extended-A, so it stays.
    expect(stripNonLatinChars("ŋ")).toBe("ŋ");
    // θ U+03B8 and χ U+03C7 also look like IPA but live in the Greek block,
    // above the removed range, so they go too.
    expect(stripNonLatinChars("aθb")).toBe("ab");
    expect(stripNonLatinChars("aχb")).toBe("ab");
  });

  it("removes Spacing Modifier Letters (U+02B0-U+02FF)", () => {
    expect(stripNonLatinChars("ʰʷʻ")).toBe("");
    expect(stripNonLatinChars("ʼˈˌˇːˆ")).toBe("");
  });

  it("removes Combining Diacritical Marks (U+0300-U+036F), so decomposed text degrades to its base", () => {
    // "e" + COMBINING ACUTE ACCENT, written with explicit \uXXXX escapes so the
    // decomposed form is unambiguous regardless of how this file is encoded.
    expect(stripNonLatinChars("e\u0301")).toBe("e");
    expect(stripNonLatinChars("e\u0301").length).toBe(1);
    // A precomposed é (U+00E9) lives in Latin-1 and still survives untouched.
    expect(stripNonLatinChars("\u00e9")).toBe("\u00e9");
    expect(stripNonLatinChars("\u00e9").length).toBe(1);
    expect(stripNonLatinChars("a\u0300")).toBe("a"); // grave
    expect(stripNonLatinChars("a\u0302")).toBe("a"); // circumflex
    expect(stripNonLatinChars("a\u0327")).toBe("a"); // cedilla
    expect(stripNonLatinChars("a\u036f")).toBe("a"); // U+036F
  });

  it("keeps General Punctuation (U+2000-U+206F minus the invisible runs)", () => {
    const kept = [
      "—", // U+2014 em dash
      "–", // U+2013 en dash
      "…", // U+2026 ellipsis
      "“", // U+201C left double quote
      "”", // U+201D right double quote
      "‘", // U+2018 left single quote
      "’", // U+2019 right single quote
      "•", // U+2022 bullet
      "′", // U+2032 prime
      "″", // U+2033 double prime
      "«", // U+00AB left guillemet
      "»", // U+00BB right guillemet
      "‹", // U+2039 single left angle quote
      "›", // U+203A single right angle quote
      "†", // U+2020 dagger
      "‰", // U+2030 per mille
      " ", // U+2007 figure space
      " ", // U+2009 thin space
    ];
    for (const ch of kept) {
      expect(stripNonLatinChars(`a${ch}b`)).toBe(`a${ch}b`);
    }
    expect(stripNonLatinChars("wait — “quoted”… done")).toBe(
      "wait — “quoted”… done",
    );
  });

  it("strips the invisible and format characters inside General Punctuation", () => {
    // These are the exclusions carved out of the U+2000-U+206F block: they
    // render as nothing and only confuse downstream tooling.
    const stripped = [
      ["", "U+200B zero width space"],
      ["‌", "U+200C zero width non-joiner"],
      ["‍", "U+200D zero width joiner"],
      ["‎", "U+200E left-to-right mark"],
      ["‏", "U+200F right-to-left mark"],
      [" ", "U+2028 line separator"],
      [" ", "U+2029 paragraph separator"],
      ["‪", "U+202A left-to-right embedding"],
      [" ", "U+202F narrow no-break space"],
      [" ", "U+205F medium mathematical space"],
      ["⁠", "U+2060 word joiner"],
      ["⁦", "U+2066 left-to-right isolate"],
      ["⁧", "U+206B directional isolate"],
    ] as const;
    for (const [ch, label] of stripped) {
      expect(stripNonLatinChars(`a${ch}b`), label).toBe("ab");
    }
  });

  it("strips superscript and subscript digits above the kept blocks", () => {
    expect(stripNonLatinChars("a⁰")).toBe("a"); // U+2070 superscript zero
    expect(stripNonLatinChars("a₀")).toBe("a"); // U+2080 subscript zero
  });

  it("strips ZWJ sequences and variation selectors completely", () => {
    // U+200D sits in the U+200B-U+200F hole and U+FE0F is in no kept block, so
    // emoji sequences leave nothing at all.
    expect(stripNonLatinChars("👨‍👩‍👧")).toBe("");
    expect(stripNonLatinChars("a‍b")).toBe("ab");
    expect(stripNonLatinChars("⚠️ x")).toBe(" x");
  });

  // -------------------------------------------------------------------
  // Block allowlist: what is REMOVED
  // -------------------------------------------------------------------

  it("removes CJK", () => {
    expect(stripNonLatinChars("你好世界")).toBe("");
    expect(stripNonLatinChars("hello 世界 world")).toBe("hello  world");
  });

  it("removes CJK punctuation (U+3000-U+303F and U+30FB)", () => {
    expect(stripNonLatinChars("、")).toBe(""); //  ideographic comma
    expect(stripNonLatinChars("。")).toBe(""); // 。 ideographic full stop
    expect(stripNonLatinChars("「")).toBe(""); // 「 left corner bracket
    expect(stripNonLatinChars("」")).toBe(""); // 」 right corner bracket
    expect(stripNonLatinChars("『")).toBe(""); // 『 left white corner bracket
    expect(stripNonLatinChars("』")).toBe(""); // 』 right white corner bracket
    expect(stripNonLatinChars("《")).toBe(""); // 《 left double angle bracket
    expect(stripNonLatinChars("》")).toBe(""); // 》 right double angle bracket
    expect(stripNonLatinChars("〈")).toBe(""); // 〈 left angle bracket
    expect(stripNonLatinChars("〉")).toBe(""); // 〉 right angle bracket
    expect(stripNonLatinChars("【")).toBe(""); // 【 left lenticular bracket
    expect(stripNonLatinChars("】")).toBe(""); // 】 right lenticular bracket
    expect(stripNonLatinChars("・")).toBe(""); // ・ katakana middle dot
    expect(stripNonLatinChars("　")).toBe(""); // U+3000 ideographic space
  });

  it("strips CJK punctuation from a mixed sentence", () => {
    expect(stripNonLatinChars("foo、bar。baz「qux」")).toBe("foobarbazqux");
  });

  it("removes Cyrillic", () => {
    expect(stripNonLatinChars("Привет")).toBe("");
  });

  it("removes Arabic", () => {
    expect(stripNonLatinChars("مرحبا")).toBe("");
  });

  it("removes Greek, Hebrew, Hangul, kana and astral CJK", () => {
    expect(stripNonLatinChars("αβγ")).toBe(""); // Greek
    expect(stripNonLatinChars("אבג")).toBe(""); // Hebrew
    expect(stripNonLatinChars("한글")).toBe(""); // Hangul
    expect(stripNonLatinChars("アイウ")).toBe(""); // katakana
    expect(stripNonLatinChars("あいう")).toBe(""); // hiragana
    expect(stripNonLatinChars("\u{20000}")).toBe(""); // CJK Ext. B, astral
  });

  it("removes symbols and operators outside the kept blocks", () => {
    expect(stripNonLatinChars("a≠b")).toBe("ab"); // U+2260 not equal
    expect(stripNonLatinChars("a→b")).toBe("ab"); // U+2192 arrow
    expect(stripNonLatinChars("a√b")).toBe("ab"); // U+221A square root
    expect(stripNonLatinChars("a─b")).toBe("ab"); // U+2500 box drawing
    expect(stripNonLatinChars("a│b")).toBe("ab"); // U+2502 box drawing vertical
    expect(stripNonLatinChars("a►b")).toBe("ab"); // U+25BA pointer
    expect(stripNonLatinChars("a█b")).toBe("ab"); // U+2588 full block
  });

  it("strips every emoji, mapped or not (the bare strip is not the pipeline)", () => {
    // Bare, the strip consults no allowlist of emoji: all go. In the real
    // pipeline the `emojis` category rewrites the mapped ones first.
    expect(stripNonLatinChars("launch 🚀 now")).toBe("launch  now");
    expect(stripNonLatinChars("brain 🧠 melt 🫠")).toBe("brain  melt ");
    expect(stripNonLatinChars("ship it 🎉")).toBe("ship it ");
  });

  // -------------------------------------------------------------------
  // Out-of-scope block: fullwidth and halfwidth forms U+FF00-U+FFEF
  // -------------------------------------------------------------------

  it("deletes fullwidth forms instead of folding them", () => {
    // The fullwidth/halfwidth block U+FF00-U+FFEF is outside both the
    // substitution blocks and the kept blocks, so it is deleted like any other
    // out-of-scope character. Surrounding ASCII is untouched.
    expect(stripNonLatinChars("ＡＢＣ")).toBe(""); // fullwidth A B C
    expect(stripNonLatinChars("１２３")).toBe(""); // fullwidth digits
    expect(stripNonLatinChars("！？")).toBe(""); // fullwidth ! ?
    expect(stripNonLatinChars("Ｈｅｌｌｏ")).toBe("");
    expect(stripNonLatinChars("（ABC）")).toBe("ABC");
    expect(stripNonLatinChars("aＡb")).toBe("ab"); // inline, mixed
  });

  it("removes halfwidth katakana", () => {
    // Halfwidth katakana (U+FF66-U+FF9D) and the halfwidth voiced mark
    // (U+FF9E) sit in the deleted fullwidth/halfwidth block.
    expect(stripNonLatinChars("ｱｲｳ")).toBe(""); // ｱｲｳ
    expect(stripNonLatinChars("ｶﾞ")).toBe(""); // ｶ + halfwidth voiced mark
  });

  it("does not alter text outside the fullwidth block", () => {
    // Only out-of-scope characters are deleted; a kept Latin-1 letter passes
    // through byte for byte.
    expect(stripNonLatinChars("\u00e9Ａ")).toBe("\u00e9");
    expect(stripNonLatinChars("\u00e9\u00e9")).toBe("\u00e9\u00e9");
  });

  // -------------------------------------------------------------------
  // Invariants
  // -------------------------------------------------------------------

  it("handles empty string and pure ASCII as no-ops", () => {
    expect(stripNonLatinChars("")).toBe("");
    expect(stripNonLatinChars("const x = 1; // fine")).toBe("const x = 1; // fine");
  });

  it("is idempotent when applied to its own output", () => {
    const once = stripNonLatinChars("a ≠ 你 b Привет");
    expect(stripNonLatinChars(once)).toBe(once);
  });

  it("only ever deletes: the output is a subsequence of the input", () => {
    // The strip must never introduce a character the input did not already
    // contain. Guards against creep towards substituting here instead of in
    // the tables.
    const input = "a—b≠c→d🚀eＡf«g»h＋i🧠j";
    const out = stripNonLatinChars(input);

    let i = 0;
    for (const ch of out) {
      const at = input.indexOf(ch, i);
      expect(at, `character ${JSON.stringify(ch)} not found in order`).toBeGreaterThanOrEqual(0);
      i = at + 1;
    }
  });

  it("leaves only allowlisted blocks behind for a mixed torture string", () => {
    const out = stripNonLatinChars(
      "hello 世界、。、「」『』《》〈〉【】・ ＡＢＣ １２３ ｱｲｳ 🧠 🫠 🎉 Привет مرحبا",
    );
    // Only "hello" and the ASCII/ideographic spaces survive; the fullwidth
    // forms are deleted with the rest.
    expect(out).toBe("hello" + " ".repeat(9));
    // Nothing outside the allowlist survives, except the U+3000 ideographic
    // space and ASCII spaces.
    for (const ch of out) {
      const c = ch.codePointAt(0)!;
      const allowed =
        c <= 0x7f || (c >= 0xa0 && c <= 0x24f) || (c >= 0x2000 && c <= 0x200a) ||
        (c >= 0x2010 && c <= 0x2027) || (c >= 0x2030 && c <= 0x205e);
      expect(allowed, `unexpected surviving codepoint U+${c.toString(16)}`).toBe(true);
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

    const input = "dash — frame ┌ shape ● arrow → not-equal ≠ check ✓";
    regex.lastIndex = 0;
    const result = applySubstitutions(input, regex, map);
    expect(result).toBe("dash - frame + shape * arrow > not-equal = check v");
  });

  it("PUNCTUATION: covers the most common cases", () => {
    const subs = buildSubstitutions({
      frames: false,
      shapes: false,
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
      ["\u25BA", ">"], // black right-pointing pointer (►)
    ];

    for (const [unicode, ascii] of cases) {
      regex.lastIndex = 0;
      expect(applySubstitutions(unicode, regex, map)).toBe(ascii);
    }
  });

  it("FRAMES: rules, corners, tees and crosses", () => {
    const subs = buildSubstitutions({
      punctuation: false,
      shapes: false,
      arrows: false,
      math: false,
      emojis: false,
    });
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const cases: [string, string][] = [
      ["\u2500", "-"], // box drawings light horizontal (─)
      ["\u2502", "|"], // box drawings light vertical (│)
      ["\u250C", "+"], // corner (┌)
      ["\u251C", "+"], // tee (├)
      ["\u253C", "+"], // cross (┼)
      ["\u2501", "-"], // heavy horizontal (━)
      ["\u2503", "|"], // heavy vertical (┃)
    ];

    for (const [unicode, ascii] of cases) {
      regex.lastIndex = 0;
      expect(applySubstitutions(unicode, regex, map)).toBe(ascii);
    }
    regex.lastIndex = 0;
    expect(applySubstitutions("┌────┐", regex, map)).toBe("+----+");
  });

  it("SHAPES: filled and hollow pairs", () => {
    const subs = buildSubstitutions({
      punctuation: false,
      frames: false,
      arrows: false,
      math: false,
      emojis: false,
    });
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const cases: [string, string][] = [
      ["\u25CF", "*"], // black circle (●)
      ["\u25CB", "*"], // white circle (○)
      ["\u25A0", "#"], // black square (■)
      ["\u25A1", "#"], // white square (□)
    ];

    for (const [unicode, ascii] of cases) {
      regex.lastIndex = 0;
      expect(applySubstitutions(unicode, regex, map)).toBe(ascii);
    }
  });

  it("ARROWS: covers common arrow characters", () => {
    const subs = buildSubstitutions({
      punctuation: false,
      frames: false,
      shapes: false,
      math: false,
      emojis: false,
    });
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const cases: [string, string][] = [
      ["→", ">"], // rightwards arrow
      ["←", "<"], // leftwards arrow
      ["↚", "<"], // leftwards arrow with stroke
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
      frames: false,
      shapes: false,
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
// Additions from the completeness audit of the six tables.
//
// Each character below was absent from its table AND outside the strip
// keep-set, so it was deleted with no trace — "CI ┌────┐ passed" rendered as
// "CI ---- passed", asserting the opposite of what was written.
// ---------------------------------------------------------------------------

describe("audit additions", () => {
  function sub(text: string, config = {}): string {
    const subs = buildSubstitutions(config);
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);
    regex.lastIndex = 0;
    return applySubstitutions(text, regex, map);
  }

  it("MATH: set inclusion and equality close the existing asymmetries", () => {
    const cases: Array<[string, string]> = [
      ["⊆", "<"], // subset of or equal to
      ["⊇", ">"], // superset of or equal to
      ["≡", "="], // identical to
      ["∅", "0"], // empty set
      ["≪", "<<"], // much less-than
      ["≫", ">>"], // much greater-than
      ["⋅", "*"], // dot operator
      ["⋯", "-"], // midline horizontal ellipsis
      ["∀", "V"], // for all
    ];
    for (const [unicode, ascii] of cases) expect(sub(unicode)).toBe(ascii);
  });

  it("ARROWS: return-to-line, rotation and dashed variants", () => {
    const cases: Array<[string, string]> = [
      ["↺", "<"], // anticlockwise open circle arrow
      ["↻", ">"], // clockwise open circle arrow
      ["⇠", "<"], // leftwards dashed arrow
      ["⇢", ">"], // rightwards dashed arrow
      ["➜", ">"], // heavy round-tipped rightwards arrow
      ["➤", ">"], // black rightwards arrowhead
    ];
    for (const [unicode, ascii] of cases) expect(sub(unicode)).toBe(ascii);
  });

  it("ARROWS: ↵ maps to < per AnyAscii (no longer a real newline)", () => {
    // No entry in any table changes the line structure of the output anymore.
    expect(sub("foo↵bar")).toBe("foo<bar");
  });

  it("PUNCTUATION: box-drawing corners, tees and crosses collapse to +", () => {
    // Only the junction set: the rest of U+2500-U+257F is decorative dithering
    // with no ASCII counterpart and is deliberately not mapped.
    for (const ch of ["┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼"]) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe("+");
    }
    expect(sub("┌────┐")).toBe("+----+");
    expect(sub("│ ok │")).toBe("| ok |");
    expect(sub("├─ src")).toBe("+- src");
  });

  it("PUNCTUATION: heavy box-drawing rules map like their light twins", () => {
    expect(sub("━")).toBe("-"); // heavy horizontal, twin of ─
    expect(sub("┃")).toBe("|"); // heavy vertical, twin of │
    expect(sub("┌━┐")).toBe("+-+");
    expect(sub("┏┓")).toBe("++");
  });

  it("PUNCTUATION: filled/hollow circle and square pairs", () => {
    const cases: Array<[string, string]> = [
      ["●", "*"], // black circle
      ["○", "*"], // white circle
      ["■", "#"], // black square
      ["□", "#"], // white square
    ];
    for (const [unicode, ascii] of cases) expect(sub(unicode)).toBe(ascii);
    expect(sub("● offline ○ online")).toBe("* offline * online");
  });

  it("PUNCTUATION: Letterlike units and marks that were silently deleted", () => {
    const cases: Array<[string, string]> = [
      ["™", "TM"], // trade mark sign
      ["℃", "C"], // degree celsius
      ["℉", "F"], // degree fahrenheit
      ["№", "No"], // numero sign
    ];
    for (const [unicode, ascii] of cases) expect(sub(unicode)).toBe(ascii);
    expect(sub("25℃")).toBe("25C");
    expect(sub("doc № 4")).toBe("doc No 4");
    expect(sub("v2 released ™")).toBe("v2 released TM");
  });

  it("PUNCTUATION: Letterlike units and marks follow AnyAscii", () => {
    expect(sub("∑")).toBe("S");
    expect(sub("√")).toBe("sqrt");
    expect(sub("∈")).toBe("E");
    expect(sub("№")).toBe("No");
    expect(sub("™")).toBe("TM");
  });

  it("EMOJIS: shortcode-only dev-chat emoji stay unmapped", () => {
    // Every one of these mapped to a :shortcode: upstream; rule 4 drops those
    // targets, so the characters are simply not in the table.
    const cases = ["✨", "👀", "🎯", "🔑", "📌", "🔍", "⏰"];
    for (const ch of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(ch);
    }
    expect(sub("deployed ✨ see 👀")).toBe("deployed ✨ see 👀");
  });

  it("EMOJIS: the block singletons were removed, not padded", () => {
    // Blocks are entered with two or more entries or not at all: 🙄 was the
    // sole Emoticons entry, 🆕 the sole Enclosed Alphanumeric Supplement one,
    // and 🤔 / 🤝 shared Supplemental Symbols and Pictographs — removing one
    // of the pair would have singletoned the other, so both went.
    for (const ch of ["🤔", "🙄", "🆕", "🤝"]) {
      const cp = ch.codePointAt(0)!;
      expect(sub(ch), `U+${cp.toString(16).toUpperCase()}`).toBe(ch);
    }
    const keys = EMOJIS.map(([from]) => from);
    for (const ch of ["🤔", "🙄", "🆕", "🤝"]) {
      expect(keys, `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`).not.toContain(ch);
    }
  });

  it("respects the category flags for the new entries", () => {
    expect(sub("✓", { emojis: false })).toBe("✓"); // ✓ is an EMOJIS entry
    expect(sub("✓")).toBe("v");
    expect(sub("☒", { emojis: false })).toBe("☒");
    expect(sub("⊆", { math: false })).toBe("⊆");
    expect(sub("∀", { math: false })).toBe("∀");
    expect(sub("┌", { frames: false })).toBe("┌"); // ┌ is a FRAMES entry
    expect(sub("┌", { punctuation: false })).toBe("+"); // not punctuation's
    expect(sub("●", { shapes: false })).toBe("●"); // ● is a SHAPES entry
    expect(sub("●", { punctuation: false })).toBe("*"); // not punctuation's
    expect(sub("№", { punctuation: false })).toBe("№");
    expect(sub("⇄", { arrows: false })).toBe("⇄");
    expect(sub("⇠", { arrows: false })).toBe("⇠");
  });

  it("introduces no duplicate key across the six tables", () => {
    // Last writer would win silently, depending on category order.
    const all = [...PUNCTUATION, ...FRAMES, ...SHAPES, ...ARROWS, ...MATH, ...EMOJIS];
    const seen = new Set<number>();
    const dups: number[] = [];
    for (const [from] of all) {
      const cp = from.codePointAt(0)!;
      if (seen.has(cp)) dups.push(cp);
      seen.add(cp);
    }
    expect(dups.map((c) => "U+" + c.toString(16).toUpperCase())).toEqual([]);
    expect(seen.size).toBe(all.length);
  });

  it("produces no non-ASCII target (nothing depends on a second pass)", () => {
    // applySubstitutions does a single pass and never rescans its output, so a
    // non-ASCII target would simply survive into the strip.
    const all = [...PUNCTUATION, ...FRAMES, ...SHAPES, ...ARROWS, ...MATH, ...EMOJIS];
    for (const [from, to] of all) {
      expect(/^[\x20-\x7E\n]*$/.test(to), `${from} -> ${JSON.stringify(to)}`).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Extensions of the thirteen blocks that were already open: no block is
// opened here, which keeps ">= 2 entries per block" satisfiable.
//
// Two defects, separated on purpose: (1) residue — unmapped characters inside
// the keep-set pass through still non-ASCII, asserted against the pipeline
// below; (2) silent deletion — characters outside the keep-set are deleted
// outright under `stripNonLatin: true`.
// ---------------------------------------------------------------------------

describe("open-block extensions", () => {
  function sub(text: string, config = {}): string {
    const subs = buildSubstitutions(config);
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);
    regex.lastIndex = 0;
    return applySubstitutions(text, regex, map);
  }

  function pipeline(text: string, config = {}): string {
    return stripNonLatinChars(sub(text, config));
  }

  const PUNCTUATION_ADDED: Array<[string, string]> = [
    // Written as an escape: a literal no-break space is invisible in the diff,
    // which is the whole reason this entry exists.
    ["\u00A0", " "], // no-break space -- invisible, desynchronises diffs
    ["¡", "!"], // inverted exclamation mark
    ["¿", "?"], // inverted question mark
    ["‐", "-"], // hyphen
    ["‖", "||"], // double vertical line
    ["‵", "`"], // reversed prime (WHOLESALE: backtick)
    ["‼", "!!"], // double exclamation mark
    ["⁄", "/"], // fraction slash
    ["⁇", "??"], // double question mark
    ["℗", "(P)"], // sound recording copyright
  ];

  const ARROWS_ADDED: Array<[string, string]> = [
    ["⇄", "="], // rightwards arrow over leftwards arrow
    ["⇆", "="], // leftwards arrow over rightwards arrow
    ["⇑", "^"], // upwards double arrow
    ["⇓", "v"], // downwards double arrow
    ["⇝", ">"], // rightwards squiggle arrow
    ["⇡", "^"], // upwards dashed arrow
    ["⇣", "v"], // downwards dashed arrow
    ["⇧", "^"], // upwards white arrow
    ["⇩", "v"], // downwards white arrow
    ["△", "^"], // white up-pointing triangle
    ["▴", "^"], // black up-pointing small triangle
    ["▽", "v"], // white down-pointing triangle
    ["▾", "v"], // black down-pointing small triangle
    ["➔", ">"], // heavy wide-headed rightwards arrow
    ["➝", ">"], // triangle-headed rightwards arrow
    ["➞", ">"], // heavy triangle-headed rightwards arrow
    ["➠", ">"], // heavy dashed triangle-headed rightwards arrow
    ["⬌", "-"], // left right black arrow
  ];

  const MATH_ADDED: Array<[string, string]> = [
    ["∥", "||"], // parallel to
    ["≦", "<="], // less-than over equal to
    ["≧", ">="], // greater-than over equal to
  ];

  const EMOJIS_ADDED: Array<[string, string]> = [
    ["☐", "#"], // ballot box (WHOLESALE)
    ["☒", "x"], // ballot box with x (WHOLESALE)
  ];

  it("PUNCTUATION: Latin-1 and General Punctuation", () => {
    for (const [unicode, ascii] of PUNCTUATION_ADDED) {
      expect(sub(unicode), unicode).toBe(ascii);
    }
  });

  it("ARROWS: double, white, dashed and head-style twins", () => {
    for (const [unicode, ascii] of ARROWS_ADDED) {
      expect(sub(unicode), unicode).toBe(ascii);
    }
  });

  it("MATH: stacked relations and the parallel sign", () => {
    for (const [unicode, ascii] of MATH_ADDED) {
      expect(sub(unicode), unicode).toBe(ascii);
    }
  });

  it("EMOJIS: the two unfilled members of the ballot-box family", () => {
    for (const [unicode, ascii] of EMOJIS_ADDED) {
      expect(sub(unicode), unicode).toBe(ascii);
    }
  });

  it("closes the nine keep-set characters that leaked through the full pipeline", () => {
    // Asserted on the pipeline: the only place the leak was observable.
    const leaked: Array<[string, string]> = [
      ["\u00A0", " "],
      ["¡", "!"],
      ["¿", "?"],
      ["‐", "-"],
      ["‖", "||"],
      ["‵", "`"],
      ["‼", "!!"],
      ["⁄", "/"],
      ["⁇", "??"],
    ];
    for (const [unicode, ascii] of leaked) {
      expect(pipeline(`A${unicode}B`), `U+${unicode.codePointAt(0)!.toString(16).toUpperCase()}`).toBe(`A${ascii}B`);
      expect(stripNonLatinChars(`A${unicode}B`)).toBe(`A${unicode}B`);
    }
  });

  it("leaves no non-ASCII behind for any of the 33 added characters", () => {
    const added = [...PUNCTUATION_ADDED, ...ARROWS_ADDED, ...MATH_ADDED, ...EMOJIS_ADDED];
    expect(added).toHaveLength(33);
    const dirty = added
      .filter(([unicode]) => /[^\x20-\x7E\n]/.test(pipeline(unicode)))
      .map(([unicode]) => "U+" + unicode.codePointAt(0)!.toString(16).toUpperCase());
    expect(dirty).toEqual([]);
  });

  it("honours the category switch: each addition is owned by exactly one table", () => {
    const owned: Array<[string, string, string]> = [
      ["‐", "punctuation", "-"],
      ["℗", "punctuation", "(P)"],
      ["┌", "frames", "+"],
      ["─", "frames", "-"],
      ["┏", "frames", "+"],
      ["●", "shapes", "*"],
      ["▢", "shapes", "#"],
      ["◆", "shapes", "*"],
      ["⇑", "arrows", "^"],
      ["▽", "arrows", "v"],
      ["⬌", "arrows", "-"],
      ["⇄", "arrows", "="],
      ["≦", "math", "<="],
      ["∥", "math", "||"],
      ["∫", "math", "S"],
      ["☒", "emojis", "x"],
      ["☐", "emojis", "#"],
      ["⌘", "emojis", "#"],
    ];
    for (const [unicode, category, ascii] of owned) {
      expect(sub(unicode, { [category]: true }), unicode).toBe(ascii);
      expect(sub(unicode, { [category]: false }), unicode).toBe(unicode);
    }
  });

  it("does not reopen any block, and leaves the emptied ones empty", () => {
    const blocks = new Set(
      [...PUNCTUATION, ...FRAMES, ...SHAPES, ...ARROWS, ...MATH, ...EMOJIS].map(
        ([from]) => blockOf(from.codePointAt(0)!),
      ),
    );
    expect(blocks.size).toBe(13);
    expect(blocks.has("Emoticons")).toBe(false);
    expect(blocks.has("Enclosed Alphanumeric Supplement")).toBe(false);
    expect(blocks.has("Supplemental Symbols and Pictographs")).toBe(false);
    expect(blocks.has("Currency Symbols")).toBe(false);
  });

  it("frames and shapes own exactly their blocks", () => {
    // Triangles stay in ARROWS (directional use) and the pointer ► stays in
    // PUNCTUATION.
    const frameBlocks = new Set(
      FRAMES.map(([from]) => blockOf(from.codePointAt(0)!)),
    );
    expect([...frameBlocks]).toEqual(["Box Drawing"]);
    expect(FRAMES.length).toBe(128);
    const shapeBlocks = new Map<string, number>();
    for (const [from] of SHAPES) {
      const b = blockOf(from.codePointAt(0)!);
      shapeBlocks.set(b, (shapeBlocks.get(b) ?? 0) + 1);
    }
    expect([...shapeBlocks.entries()].sort()).toEqual([
      ["Geometric Shapes", 81],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Scope invariant: no Unicode block is ever represented by a single entry.
// A block gets two or more entries, or none at all.
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
  for (const [lo, hi, name] of UNICODE_BLOCKS) {
    if (cp >= lo && cp <= hi) return name;
  }
  return `unlisted block (U+${cp.toString(16).toUpperCase()})`;
}

describe("scope invariant: no block is represented by a single entry", () => {
  function entriesByBlock(): Map<string, string[]> {
    const byBlock = new Map<string, string[]>();
    for (const [[from]] of [
      ...PUNCTUATION,
      ...FRAMES,
      ...SHAPES,
      ...ARROWS,
      ...MATH,
      ...EMOJIS,
    ]) {
      const name = blockOf(from.codePointAt(0)!);
      if (!byBlock.has(name)) byBlock.set(name, []);
      byBlock.get(name)!.push(from);
    }
    return byBlock;
  }

  it("every represented Unicode block has at least 2 entries", () => {
    const offenders: string[] = [];
    for (const [name, chars] of entriesByBlock()) {
      if (chars.length < 2) {
        offenders.push(
          `${name} has ${chars.length} (${chars
            .map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase())
            .join(", ")})`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("resolves every entry to a known Unicode block", () => {
    // A character in an unlisted block would silently escape the check above.
    const unknown = [...PUNCTUATION, ...FRAMES, ...SHAPES, ...ARROWS, ...MATH, ...EMOJIS]
      .map(([from]) => from)
      .filter((ch) => blockOf(ch.codePointAt(0)!).startsWith("unlisted"));
    expect(unknown).toEqual([]);
  });

  it("leaves the three emptied blocks unrepresented", () => {
    // Emoticons, Enclosed Alphanumeric Supplement and Supplemental Symbols and
    // Pictographs used to hold one, one and two entries. They were emptied
    // rather than padded, so the invariant holds without an exception list.
    const byBlock = entriesByBlock();
    expect(byBlock.has("Emoticons")).toBe(false);
    expect(byBlock.has("Enclosed Alphanumeric Supplement")).toBe(false);
    expect(byBlock.has("Supplemental Symbols and Pictographs")).toBe(false);
  });

  it("covers 13 blocks with 1712 entries", () => {
    // Pinned so an accidental add or remove is visible in the diff. The block
    // count stays at 13 because WHOLESALE only fills the open blocks — Latin
    // letters, out-of-scope blocks, empty replacements and :shortcode: labels
    // never enter.
    const byBlock = entriesByBlock();
    expect(byBlock.size).toBe(13);
    const total = [...byBlock.values()].reduce((n, chars) => n + chars.length, 0);
    expect(total).toBe(1712);
    expect(PUNCTUATION.length).toBe(172);
    expect(FRAMES.length).toBe(128);
    expect(SHAPES.length).toBe(81);
    expect(ARROWS.length).toBe(362);
    expect(MATH.length).toBe(260);
    expect(EMOJIS.length).toBe(709);
  });

  it("matches every value to the vendored AnyAscii subset row", () => {
    // One AnyAscii row per mapped codepoint; each table value must equal its
    // row verbatim, and the row count must equal the table size.
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
    const ALL = [
      ...PUNCTUATION,
      ...FRAMES,
      ...SHAPES,
      ...ARROWS,
      ...MATH,
      ...EMOJIS,
    ];
    expect(rows.size).toBe(ALL.length);
    for (const [from, to] of ALL) {
      expect(rows.get(from), JSON.stringify(from)).toBe(to);
    }
  });
});

// ---------------------------------------------------------------------------
// Full pipeline with stripping: substitute FIRST, then strip
// ---------------------------------------------------------------------------

describe("full pipeline with stripNonLatin", () => {
  function runPipeline(text: string, config = {}): string {
    const subs = buildSubstitutions(config);
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);
    regex.lastIndex = 0;
    return stripNonLatinChars(applySubstitutions(text, regex, map));
  }

  it("keeps mapped emoji as ASCII and strips the unmapped ones", () => {
    expect(runPipeline("launch ✓ to 🧠 the 🫠 finish")).toBe(
      "launch v to  the  finish",
    );
  });

  it("strips emoji whose only upstream value was a :shortcode: label", () => {
    // Every one of these was mapped to a :shortcode: upstream. With those
    // targets dropped, substitution leaves the codepoint and the strip deletes
    // it, so nothing stands in for it.
    const stripped = [
      "🚀", "🔥", "✅", "❌", "⚠", "⭐", "📝", "🔒", "📁", "👍",
      "🎉", "💡", "🧠", "🫠", "🤯", "🦄",
    ];
    for (const ch of stripped) {
      expect(runPipeline(`x ${ch} y`), JSON.stringify(ch)).toBe("x  y");
    }
  });

  it("substitutes curated punctuation before stripping, so no word breaks", () => {
    // The bare strip would KEEP all three (kept blocks); substitution converts
    // them first, so the pipeline never shows them raw.
    expect(runPipeline("wait — «ready» now")).toBe("wait - <<ready>> now");
  });

  it("deletes fullwidth forms before the strip sees them", () => {
    expect(runPipeline("ＡＢＣ ok")).toBe(" ok");
    expect(runPipeline("Ｈｅｌｌｏ — Ｗ")).toBe(" - ");
  });

  it("strips CJK punctuation in a sentence", () => {
    expect(runPipeline("これは、テスト。「本文」です。")).toBe("");
  });

  it("leaves Latin-1 accented Latin intact end to end", () => {
    expect(runPipeline("Café déjà vu — naïve 42")).toBe("Café déjà vu - naïve 42");
  });

  it("strips a decomposed combining mark but keeps the precomposed letter", () => {
    // Written with explicit \uXXXX escapes so the intent survives any editor
    // or tooling that would recompose one spelling into the other.
    const decomposed = runPipeline("cafe\u0301"); // c a f e + COMBINING ACUTE
    expect(decomposed).toBe("cafe");
    expect(decomposed.length).toBe(4);

    const precomposed = runPipeline("caf\u00e9"); // c a f + U+00E9
    expect(precomposed).toBe("caf\u00e9");
    expect(precomposed.length).toBe(4);
    expect(precomposed.codePointAt(3)).toBe(0xe9);
  });

  it("keeps Latin Extended but removes IPA and spacing modifiers end to end", () => {
    expect(runPipeline("Łódź — ā œ")).toBe("Łódź - ā œ");
    expect(runPipeline("əɛɔʁ")).toBe("");
    expect(runPipeline("ʰʷʻ")).toBe("");
  });

  it("produces pure ASCII for a mixed torture string", () => {
    const out = runPipeline(
      "Status — 50%\n· 世界：ok、ok\n· ＡＢＣ 🧠 «done» ✓ αβγ ≠ 1",
    );
    expect(out).toBe(
      "Status - 50%\n- okok\n-   <<done>> v  = 1",
    );
    expect(/^[\x20-\x7E\n]*$/.test(out)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Regression: silent deletion inverted sentence meaning ("CI ┌────┐ passed"
  // rendered as "CI ---- passed").
  // -------------------------------------------------------------------------

  it("keeps ASCII-art frames readable instead of collapsing them", () => {
    expect(runPipeline("CI ┌────┐ passed")).toBe("CI +----+ passed");
    expect(runPipeline("tree: ├─ src")).toBe("tree: +- src");
    expect(runPipeline("┌─┐\n│x│\n└─┘")).toBe("+-+\n|x|\n+-+");
    expect(runPipeline("status ● online ○ offline")).toBe(
      "status * online * offline",
    );
  });

  it("keeps shapes readable through the pipeline", () => {
    expect(runPipeline("status ● on ○ off ■ □")).toBe(
      "status * on * off # #",
    );
  });

  it("isolates the six flags through the pipeline", () => {
    // One category on, five off: only its entries convert.
    const OFF = {
      punctuation: false,
      frames: false,
      shapes: false,
      arrows: false,
      math: false,
      emojis: false,
    };
    expect(runPipeline("a┌b", { ...OFF, frames: true })).toBe("a+b");
    expect(runPipeline("a┌b", OFF)).toBe("ab");
    expect(runPipeline("a●b", { ...OFF, shapes: true })).toBe("a*b");
    expect(runPipeline("a●b", OFF)).toBe("ab");
    expect(runPipeline("a—b", { ...OFF, punctuation: true })).toBe("a-b");
    expect(runPipeline("a—b", OFF)).toBe("a—b");
  });

  it("strips unsubstituted frames and shapes when their flag is off", () => {
    expect(runPipeline("┌─┐", { frames: false })).toBe("");
    // Same for shapes: ● is outside the keep-set, so shapes:false deletes it.
    expect(runPipeline("a ● b", { shapes: false })).toBe("a  b");
  });

  it("keeps units and legal marks", () => {
    expect(runPipeline("temp 25℃")).toBe("temp 25C");
    expect(runPipeline("v2 released ™")).toBe("v2 released TM");
    expect(runPipeline("doc № 4")).toBe("doc No 4");
    // The pound sign is Latin-1 and survives; out-of-scope currency like ₹ is
    // deleted by the strip.
    expect(runPipeline("total: ₹100 or £100")).toBe("total: 100 or £100");
  });

  it("keeps set relations and operators", () => {
    expect(runPipeline("set ⊆ {1}")).toBe("set < {1}");
    expect(runPipeline("a ≡ b")).toBe("a = b");
    expect(runPipeline("empty ∅")).toBe("empty 0");
    expect(runPipeline("cost ≪ budget ≫ other")).toBe("cost << budget >> other");
    expect(runPipeline("dot a ⋅ b")).toBe("dot a * b");
    expect(runPipeline("wait ⋯ done")).toBe("wait - done");
  });

  it("strips the shortcode-only dev-chat emoji", () => {
    expect(runPipeline("shipped ✨ see 👀")).toBe("shipped  see ");
    expect(runPipeline("aim 🎯 with 🔑")).toBe("aim  with ");
    expect(runPipeline("📌 note 🔍 search")).toBe(" note  search");
    expect(runPipeline("⏰ time")).toBe(" time");
  });

  it("deletes the emptied-block characters instead of spelling them out", () => {
    // 🆕 🤔 🙄 🤝 left the tables with their blocks.
    expect(runPipeline("see 👀 new 🆕 now")).toBe("see  new  now");
    expect(runPipeline("🤝 deal 🤔 hmm 🙄")).toBe(" deal  hmm ");
  });

  it("maps ↵ to < through the full pipeline (no line-structure change)", () => {
    // No entry in any table changes the line structure of the output anymore.
    const out = runPipeline("first↵second");
    expect(out).toBe("first<second");
    expect(out.indexOf("\n")).toBe(-1);
  });

  it("still strips codepoints outside the open blocks", () => {
    // Anything else keeps the old behaviour: stripped, not approximated. The
    // shade blocks are Block Elements (U+2580-U+259F); 🤯 is in Emoticons.
    expect(runPipeline("progress ▓▓▓░░ 50%")).toBe("progress  50%");
    expect(runPipeline("pizza 🤯")).toBe("pizza ");
    // Empty AnyAscii replacements stay unmapped and are left to the strip.
    expect(runPipeline("a\u200bb")).toBe("ab");
  });

  it("maps the previously-refused in-block characters per AnyAscii", () => {
    expect(runPipeline("target ◉ here")).toBe("target * here");
    expect(runPipeline("integral ∫ f")).toBe("integral S f");
  });
});

// ---------------------------------------------------------------------------
// WHOLESALE flip spot-checks: the renamed values plus a cross-section of the
// families that moved. Every expectation was measured against the compiled
// build, never guessed.
// ---------------------------------------------------------------------------

describe("wholesale flips", () => {
  function sub(text: string, config = {}): string {
    const subs = buildSubstitutions(config);
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);
    regex.lastIndex = 0;
    return applySubstitutions(text, regex, map);
  }

  it("the named key flips", () => {
    expect(sub("→")).toBe(">"); // was "->"
    expect(sub("→")).not.toBe("->");
    expect(sub("≠")).toBe("="); // was "!="
    expect(sub("≠")).not.toBe("!=");
  });

  it("arrows follow appearance, not the old convention", () => {
    const cases: Array<[string, string]> = [
      ["⇄", "="], ["⇆", "="], ["⬌", "-"], ["↺", "<"], ["↻", ">"],
      ["⇠", "<"], ["⇢", ">"], ["➔", ">"], ["➜", ">"], ["➤", ">"],
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
  });

  it("math follows appearance and upstream letters", () => {
    const cases: Array<[string, string]> = [
      ["≠", "="], ["≡", "="], ["⊆", "<"], ["⊇", ">"], ["∅", "0"],
      ["∀", "V"], ["∑", "S"], ["∏", "P"], ["∇", "D"], ["∈", "E"],
      ["∉", "E"], ["⋅", "*"], ["⋯", "-"], ["±", "+-"], ["≈", "~"],
      ["∩", "^"], ["∪", "v"], ["∧", "^"], ["∨", "v"], ["∴", ":"],
      ["∫", "S"], ["∂", "d"], ["∞", "inf"],
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
    expect(sub("≠")).not.toBe("!=");
    expect(sub("∀")).not.toBe("all");
  });

  it("punctuation and Letterlike follow AnyAscii", () => {
    const cases: Array<[string, string]> = [
      ["«", "<<"], ["»", ">>"], ["‹", "<"], ["›", ">"],
      ["•", "*"], ["‣", "*"], ["·", "-"], ["‧", "-"],
      ["‵", "`"], ["″", "''"], ["™", "TM"], ["℗", "(P)"],
      ["℃", "C"], ["℉", "F"], ["№", "No"], ["‖", "||"], ["‼", "!!"],
      ["⁇", "??"], ["⁄", "/"], ["‽", "!?"], ["…", "..."],
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
  });

  it("frames and shapes follow appearance", () => {
    const cases: Array<[string, string]> = [
      ["┏", "+"], ["┓", "+"], ["┗", "+"], ["┛", "+"], ["╬", "+"],
      ["╌", "-"], ["║", "|"],
      ["○", "*"], ["□", "#"], ["◆", "*"], ["◉", "*"], ["◢", "/"], ["◣", "\\"],
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
  });

  it("emoji follow AnyAscii where the value is not a :shortcode:", () => {
    const cases: Array<[string, string]> = [
      ["✓", "v"], ["ℹ", "i"], ["★", "*"], ["☆", "*"],
      ["☐", "#"], ["☒", "x"], ["⌘", "#"],
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
  });

  it("excluded classes stay untouched", () => {
    // Latin letters (Latin-1 exception).
    for (const ch of ["é", "ç", "ñ", "ø", "ß", "Ł", "œ"]) {
      expect(sub(ch), ch).toBe(ch);
    }
    // Scripts.
    for (const ch of ["α", "Ж", "م", "あ", "한", "世", "א"]) {
      expect(sub(ch), ch).toBe(ch);
    }
    // Outside the 13 open blocks (Block Elements).
    for (const ch of ["█", "░", "▒", "▓"]) {
      expect(sub(ch), ch).toBe(ch);
    }
  });
});
