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
    // Every entry whose 'from' side is a supplementary plane character
    // must have .length === 2 (JS surrogate pair), NOT 3 or more
    // (which would indicate the \uXXXX mis-encoding concatenated extra chars).
    for (const [from] of EMOJIS) {
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
    expect(fromSet.has("┌")).toBe(true); // corner -- FRAMES
    expect(fromSet.has("●")).toBe(true); // black circle -- SHAPES
    expect(fromSet.has("→")).toBe(true); // arrow ->  ARROWS
    expect(fromSet.has("≠")).toBe(true); // !=        MATH
    expect(fromSet.has("🚀")).toBe(true); // 🚀       EMOJIS
  });

  it("has the AnyAscii-sourced per-category counts", () => {
    // Pinned so a silent add or remove is visible in the diff. WHOLESALE
    // AnyAscii 0.3.3: every value is upstream verbatim across the 13 open
    // blocks — punctuation 172, frames 128, shapes 89, arrows 377, math 260,
    // emojis 1580, total 2606.
    expect(PUNCTUATION.length).toBe(172);
    expect(FRAMES.length).toBe(128);
    expect(SHAPES.length).toBe(89);
    expect(ARROWS.length).toBe(377);
    expect(MATH.length).toBe(260);
    expect(EMOJIS.length).toBe(1580);
    expect(buildSubstitutions({}).length).toBe(2606);
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
// stripNonLatinChars
// ---------------------------------------------------------------------------

describe("stripNonLatinChars", () => {
  // -------------------------------------------------------------------
  // Block allowlist: what is KEPT
  //   U+0000-U+007F  Basic Latin / ASCII
  //   U+00A0-U+00FF  Latin-1 Supplement
  //   U+2000-U+200A, U+2010-U+2027, U+2030-U+205E  General Punctuation
  //                   minus the invisible/format characters
  // plus an NFKC fold of U+FF00-U+FFEF before the strip.
  // Everything else is deleted.
  // -------------------------------------------------------------------

  it("keeps the whole ASCII block U+0000-U+007F", () => {
    for (let c = 0x00; c <= 0x7f; c++) {
      const ch = String.fromCharCode(c);
      expect(stripNonLatinChars(`a${ch}b`)).toBe(`a${ch}b`);
    }
  });

  it("keeps the six Latin blocks in one contiguous range U+00A0-U+036F", () => {
    // Latin-1 Supplement (U+00A0-U+00FF), Latin Extended-A (U+0100-U+017F),
    // Latin Extended-B (U+0180-U+024F), IPA Extensions (U+0250-U+02AF),
    // Spacing Modifier Letters (U+02B0-U+02FF) and Combining Diacritical
    // Marks (U+0300-U+036F) are consecutive blocks, so a single range covers
    // all six. This sweep checks every codepoint in that range, so a future
    // edit that moves a boundary cannot slip through.
    for (let c = 0xa0; c <= 0x36f; c++) {
      const ch = String.fromCharCode(c);
      expect(stripNonLatinChars(`a${ch}b`), `U+${c.toString(16)}`).toBe(
        `a${ch}b`,
      );
    }
  });

  it("strips everything from U+0370 up to U+1FFF (the hole after the Latin blocks)", () => {
    // Greek and Coptic starts at U+0370. This range also holds Cyrillic,
    // Hebrew, Arabic, the CJK blocks, kana, Hangul and every symbol block.
    expect(stripNonLatinChars("aͰb")).toBe("ab"); // U+0370 Greek and Coptic
    expect(stripNonLatinChars("aαb")).toBe("ab"); // U+03B1 Greek
    expect(stripNonLatinChars("aПb")).toBe("ab"); // U+041F Cyrillic
    expect(stripNonLatinChars("a√b")).toBe("ab"); // U+221A, just below GP
    expect(stripNonLatinChars("a€b")).toBe("ab"); // U+20AC currency sign
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
    // ß and the Latin-1 symbols live in the same kept block.
    expect(stripNonLatinChars("Straße × ÷ ± ¬")).toBe("Straße × ÷ ± ¬");
  });

  it("keeps Latin Extended (U+0100-U+024F)", () => {
    // Extended-A runs U+0100-U+017F and Extended-B U+0180-U+024F; both sit
    // inside the kept range, so Central and Eastern European spellings survive
    // whole. This block was stripped in the previous revision.
    expect(stripNonLatinChars("Łódź")).toBe("Łódź");
    expect(stripNonLatinChars("č š ž")).toBe("č š ž");
    expect(stripNonLatinChars("ā œ")).toBe("ā œ");
    expect(stripNonLatinChars("Héłło")).toBe("Héłło");
    expect(stripNonLatinChars("ĂȘŐ ș ț")).toBe("ĂȘŐ ș ț");
  });

  it("keeps IPA Extensions (U+0250-U+02AF)", () => {
    expect(stripNonLatinChars("ə ɛ ɔ ŋ ʁ")).toBe("ə ɛ ɔ ŋ ʁ");
    expect(stripNonLatinChars("ɸʃʔ")).toBe("ɸʃʔ");
    // θ U+03B8 and χ U+03C7 look like IPA but live in the Greek block, above
    // the kept range, so they go.
    expect(stripNonLatinChars("aθb")).toBe("ab");
    expect(stripNonLatinChars("aχb")).toBe("ab");
  });

  it("keeps Spacing Modifier Letters (U+02B0-U+02FF)", () => {
    expect(stripNonLatinChars("ʰ ʷ ʻ")).toBe("ʰ ʷ ʻ");
    expect(stripNonLatinChars("ʼˈˌˇːˆ")).toBe("ʼˈˌˇːˆ");
  });

  it("keeps Combining Diacritical Marks (U+0300-U+036F), so decomposed text survives", () => {
    // "e" + COMBINING ACUTE ACCENT, written with explicit \uXXXX escapes so the
    // decomposed form is unambiguous regardless of how this file is encoded.
    // The block is the last one in the kept range, so the sequence passes
    // through byte for byte and keeps its accent.
    expect(stripNonLatinChars("e\u0301")).toBe("e\u0301");
    expect(stripNonLatinChars("e\u0301").length).toBe(2);
    // Precomposed U+00E9, in Latin-1 Supplement, is equally untouched.
    expect(stripNonLatinChars("\u00e9")).toBe("\u00e9");
    expect(stripNonLatinChars("\u00e9").length).toBe(1);
    // The rest of the block: grave, circumflex, cedilla, and the last assigned
    // codepoint of the block.
    expect(stripNonLatinChars("a\u0300")).toBe("a\u0300"); // grave
    expect(stripNonLatinChars("a\u0302")).toBe("a\u0302"); // circumflex
    expect(stripNonLatinChars("a\u0327")).toBe("a\u0327"); // cedilla
    expect(stripNonLatinChars("a\u036f")).toBe("a\u036f"); // U+036F
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

  it("strips marks above the Combining Diacritical Marks block", () => {
    // U+0300-U+036F is the last Latin block in the allowlist. U+0370 onwards is
    // not, so a mark used in a non-Latin script is removed while the one used
    // as a Latin accent is kept. Superscript and subscript digits (U+2070,
    // U+2080) are in a later block and go too.
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
    // The ideographic space, comma and full stop, the corner and double-corner
    // brackets, the angle and lenticular brackets, the katakana middle dot.
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
    expect(stripNonLatinChars("a€b")).toBe("ab"); // U+20AC euro sign
    expect(stripNonLatinChars("a█b")).toBe("ab"); // U+2588 full block
  });

  it("strips every emoji, mapped or not (the bare strip is not the pipeline)", () => {
    // With no substitution in front of it the strip has no allowlist of emoji
    // to consult, so all of them go. In the real pipeline the `emojis`
    // category rewrites the mapped ones to :shortcode: first — see the
    // pipeline block below.
    expect(stripNonLatinChars("launch 🚀 now")).toBe("launch  now");
    expect(stripNonLatinChars("brain 🧠 melt 🫠")).toBe("brain  melt ");
    expect(stripNonLatinChars("ship it 🎉")).toBe("ship it ");
  });

  // -------------------------------------------------------------------
  // The NFKC fold of U+FF00-U+FFEF, which runs before the strip
  // -------------------------------------------------------------------

  it("folds fullwidth forms to their ASCII base instead of deleting them", () => {
    // Not a substitution category: no punctuation/arrows/math/emojis entry
    // covers the fullwidth block. NFKC maps every codepoint in it onto a real
    // ASCII counterpart, so folding is strictly better than a dry delete.
    expect(stripNonLatinChars("ＡＢＣ")).toBe("ABC"); // fullwidth A B C
    expect(stripNonLatinChars("１２３")).toBe("123"); // fullwidth digits
    expect(stripNonLatinChars("！？")).toBe("!?"); // fullwidth ! ?
    expect(stripNonLatinChars("Ｈｅｌｌｏ")).toBe("Hello");
    // The fullwidth brackets fold to ASCII; whatever is between them is then
    // judged by the block allowlist, so Latin survives and CJK does not.
    expect(stripNonLatinChars("（ABC）")).toBe("(ABC)");
    expect(stripNonLatinChars("（丸）")).toBe("()");
    expect(stripNonLatinChars("aＡb")).toBe("aAb"); // inline, mixed blocks
  });

  it("removes halfwidth katakana (folds to Katakana, which is then stripped)", () => {
    // U+FF71-U+FF9D are halfwidth katakana: NFKC expands them to fullwidth
    // katakana, which is in no kept block and gets removed. The voiced sound
    // mark U+FF9E decomposes to U+3099, also in no kept block, so it leaves no
    // residue either.
    expect(stripNonLatinChars("ｱｲｳ")).toBe(""); // ｱｲｳ
    expect(stripNonLatinChars("ｶﾞ")).toBe(""); // ｶ + halfwidth voiced mark
  });

  it("does not recompose or alter text outside the fullwidth block", () => {
    // Only the matched U+FF00-U+FFEF runs are normalised. A precomposed é is
    // in a kept block and is passed through byte for byte; the fullwidth run
    // next to it is folded independently.
    expect(stripNonLatinChars("\u00e9Ａ")).toBe("\u00e9A");
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

  it("only ever deletes: the output is a subsequence of the folded input", () => {
    // The strip must never introduce a character the input did not already
    // contain (outside the documented U+FF00-U+FFEF fold). Guards against
    // creep towards substituting here instead of in the tables.
    const input = "a—b≠c→d🚀eＡf«g»h＋i🧠j";
    const folded = input.replace(/[\uFF00-\uFFEF]+/g, (r) => r.normalize("NFKC"));
    const out = stripNonLatinChars(input);

    // Every output character must come from the folded input, in order.
    let i = 0;
    for (const ch of out) {
      const at = folded.indexOf(ch, i);
      expect(at, `character ${JSON.stringify(ch)} not found in order`).toBeGreaterThanOrEqual(0);
      i = at + 1;
    }
  });

  it("leaves only allowlisted blocks behind for a mixed torture string", () => {
    const out = stripNonLatinChars(
      "hello 世界、。、「」『』《》〈〉【】・ ＡＢＣ １２３ ｱｲｳ 🧠 🫠 🎉 Привет مرحبا",
    );
    expect(out).toBe("hello  ABC 123      ");
    // Nothing outside the allowlist survives, except the U+3000 ideographic
    // space and ASCII spaces.
    for (const ch of out) {
      const c = ch.codePointAt(0)!;
      const allowed =
        c <= 0x7f || (c >= 0xa0 && c <= 0x36f) || (c >= 0x2000 && c <= 0x200a) ||
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

    const input = "dash — frame ┌ shape ● arrow → not-equal ≠ rocket 🚀";
    regex.lastIndex = 0;
    const result = applySubstitutions(input, regex, map);
    expect(result).toBe("dash - frame + shape * arrow > not-equal = rocket :rocket:");
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
      ["\u2B1B", ":black_large_square:"], // black large square (⬛)
      ["\u2B1C", ":white_large_square:"], // white large square (⬜)
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
// Before these, each character below was absent from its table AND outside the
// strip keep-set, so `stripNonLatin: true` deleted it with no trace. The
// failure was semantic, not cosmetic: "CI ┌────┐ passed" rendered as
// "CI ---- passed", which asserts the opposite of what was written.
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
    // WHOLESALE AnyAscii 0.3.3 values: single-char relations, not digraphs.
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

  it("ARROWS: hooks, return-to-line, rotation and dashed variants", () => {
    // WHOLESALE AnyAscii 0.3.3 values: appearance forms and shortcodes.
    const cases: Array<[string, string]> = [
      ["↩", ":leftwards_arrow_with_hook:"], // leftwards arrow with hook
      ["↪", ":arrow_right_hook:"], // rightwards arrow with hook
      ["↺", "<"], // anticlockwise open circle arrow
      ["↻", ">"], // clockwise open circle arrow
      ["⇠", "<"], // leftwards dashed arrow
      ["⇢", ">"], // rightwards dashed arrow
      ["➜", ">"], // heavy round-tipped rightwards arrow
      ["➤", ">"], // black rightwards arrowhead
      ["▶", ":arrow_forward:"], // black right-pointing triangle
      ["◀", ":arrow_backward:"], // black left-pointing triangle
    ];
    for (const [unicode, ascii] of cases) expect(sub(unicode)).toBe(ascii);
  });

  it("ARROWS: ↵ maps to < per AnyAscii (no longer a real newline)", () => {
    // WHOLESALE: U+21B5 takes the AnyAscii appearance form. No entry in any
    // table changes the line structure of the output anymore.
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
    // WHOLESALE: the heavy corners U+250F-U+257F joined per AnyAscii — this
    // was the conscious decision the old assertion was waiting for.
    expect(sub("┏┓")).toBe("++");
  });

  it("PUNCTUATION: filled/hollow circle and square pairs", () => {
    // WHOLESALE AnyAscii 0.3.3 values (now in SHAPES).
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
    // WHOLESALE AnyAscii 0.3.3 values.
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

  it("PUNCTUATION: the euro sign is deliberately NOT mapped", () => {
    // € -> "EUR" was refused: spelled out, the letters read as injected prose
    // inside a sentence, while a bare number is already unambiguous once the
    // sign is dropped. WHOLESALE keeps the refusal (Currency Symbols is
    // outside the 13 open blocks) while everything else follows AnyAscii.
    expect(sub("€")).toBe("€");
    expect(sub("cheapest is €42")).toBe("cheapest is €42");
    // and it is in no table at all
    for (const table of [PUNCTUATION, FRAMES, SHAPES, ARROWS, MATH, EMOJIS]) {
      expect(table.map(([from]) => from)).not.toContain("€");
    }
    // neighbouring Letterlike marks follow AnyAscii now
    expect(sub("∑")).toBe("S");
    expect(sub("√")).toBe("sqrt");
    expect(sub("∈")).toBe("E");
    expect(sub("№")).toBe("No");
    expect(sub("™")).toBe("TM");
  });

  it("EMOJIS: the high-frequency dev-chat set", () => {
    const cases: Array<[string, string]> = [
      ["✨", ":sparkles:"], // sparkles
      ["👀", ":eyes:"], // eyes
      ["🎯", ":dart:"], // direct hit
      ["🔑", ":key:"], // key
      ["📌", ":pushpin:"], // round pushpin
      ["🔍", ":mag:"], // left-pointing magnifying glass
      ["⏰", ":alarm_clock:"], // alarm clock
    ];
    for (const [unicode, ascii] of cases) {
      expect(sub(unicode), `U+${unicode.codePointAt(0)!.toString(16)}`).toBe(ascii);
    }
    expect(sub("deployed ✨ see 👀")).toBe("deployed :sparkles: see :eyes:");
  });

  it("EMOJIS: the block singletons were removed, not padded", () => {
    // Scope rule: a Unicode block is only ever entered with two or more
    // characters. Every block that was ever a singleton was emptied instead of
    // padded, so these four are gone: 🙄 was the sole Emoticons entry, 🆕 the
    // sole Enclosed Alphanumeric Supplement entry, and 🤔 / 🤝 the pair in
    // Supplemental Symbols and Pictographs — removing one of the pair would
    // have made the other a singleton, so both went.
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
    // The additions must respond to exactly the one category they were filed
    // under, same contract as the pre-existing entries (values are wholesale).
    expect(sub("✔", { emojis: false })).toBe("✔"); // ✔ is an EMOJIS entry
    expect(sub("✔")).toBe(":heavy_check_mark:");
    expect(sub("✨", { emojis: false })).toBe("✨");
    expect(sub("⊆", { math: false })).toBe("⊆");
    expect(sub("∀", { math: false })).toBe("∀");
    expect(sub("┌", { frames: false })).toBe("┌"); // ┌ is a FRAMES entry
    expect(sub("┌", { punctuation: false })).toBe("+"); // not punctuation's
    expect(sub("●", { shapes: false })).toBe("●"); // ● is a SHAPES entry
    expect(sub("●", { punctuation: false })).toBe("*"); // not punctuation's
    expect(sub("№", { punctuation: false })).toBe("№");
    expect(sub("▶", { arrows: false })).toBe("▶");
    expect(sub("↩", { arrows: false })).toBe("↩");
  });

  it("introduces no duplicate key across the six tables", () => {
    // The audit added jumeaux of entries that already existed, so this guards
    // against a future edit mapping the same codepoint twice. Last writer would
    // win silently, depending on category order.
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
// Extensions of the thirteen blocks that were already open. No block is opened
// here: every character below belongs to a block the tables already covered,
// which is what keeps the ">= 2 entries per block" invariant satisfiable
// without opening a fourteenth block for a single glyph.
//
// Two distinct defects are closed here, and the tests separate them on purpose:
//
//   1. Residue. U+00A0-U+00FF, U+2000-U+200A, U+2010-U+2027 and U+2030-U+205E
//      are inside the strip keep-set, so an unmapped character there is not
//      deleted by `stripNonLatin: true` -- it passes through still non-ASCII.
//      Nine of the entries below are that class, and they are the ones asserted
//      against the full pipeline below.
//   2. Silent deletion. The other blocks are outside the keep-set, so an
//      unmapped character there is deleted outright under `stripNonLatin: true`
//      and only survives when that pass is off, which is the default.
//
// Every target is a fixed ASCII form or an existing shortcode, and each is
// forced by a twin that was already mapped rather than chosen; no entry
// introduces a new word.
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

  const SHAPES_ADDED: Array<[string, string]> = [
    ["⬛", ":black_large_square:"], // black large square (WHOLESALE)
    ["⬜", ":white_large_square:"], // white large square (WHOLESALE)
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

  it("SHAPES: the emoji-scale square twins", () => {
    for (const [unicode, ascii] of SHAPES_ADDED) {
      expect(sub(unicode), unicode).toBe(ascii);
    }
  });

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
    // These are inside the strip keep-set, so before this change they reached
    // the output still non-ASCII. Asserted on the full pipeline, which is the
    // only place the leak was observable. WHOLESALE values (‵ takes the
    // backtick now).
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
      // And the leak really was a leak: nothing in the keep-set deletes it.
      expect(stripNonLatinChars(`A${unicode}B`)).toBe(`A${unicode}B`);
    }
  });

  it("leaves no non-ASCII behind for any of the 35 added characters", () => {
    const added = [...PUNCTUATION_ADDED, ...SHAPES_ADDED, ...ARROWS_ADDED, ...MATH_ADDED, ...EMOJIS_ADDED];
    expect(added).toHaveLength(35);
    const dirty = added
      .filter(([unicode]) => /[^\x20-\x7E\n]/.test(pipeline(unicode)))
      .map(([unicode]) => "U+" + unicode.codePointAt(0)!.toString(16).toUpperCase());
    expect(dirty).toEqual([]);
  });

  it("honours the category switch: each addition is owned by exactly one table", () => {
    // WHOLESALE values; placement frozen for existing entries, block map for new.
    const owned: Array<[string, string, string]> = [
      ["‐", "punctuation", "-"],
      ["℗", "punctuation", "(P)"],
      ["┌", "frames", "+"],
      ["─", "frames", "-"],
      ["┏", "frames", "+"],
      ["●", "shapes", "*"],
      ["⬜", "shapes", ":white_large_square:"],
      ["◆", "shapes", "*"],
      ["⇑", "arrows", "^"],
      ["▽", "arrows", "v"],
      ["⬌", "arrows", "-"],
      ["↕", "arrows", ":arrow_up_down:"],
      ["≦", "math", "<="],
      ["∥", "math", "||"],
      ["∫", "math", "S"],
      ["☒", "emojis", "x"],
      ["🍕", "emojis", ":pizza:"],
      ["⌘", "emojis", "#"],
    ];
    for (const [unicode, category, ascii] of owned) {
      expect(sub(unicode, { [category]: true }), unicode).toBe(ascii);
      // With the owning category off the character is passed through untouched,
      // so disabling a category still disables exactly its own entries.
      expect(sub(unicode, { [category]: false }), unicode).toBe(unicode);
    }
  });

  it("does not reopen any block, and leaves the emptied ones empty", () => {
    // WHOLESALE fills the 13 open blocks without opening a fourteenth: the
    // three emptied blocks and Currency Symbols stay unrepresented.
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
    // FRAMES is the Box Drawing block, nothing else (13 curated + 115
    // wholesale); SHAPES is Geometric Shapes (6 curated + 77 wholesale) plus
    // the two emoji-scale square twins from Miscellaneous Symbols and Arrows.
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
      ["Geometric Shapes", 87],
      ["Miscellaneous Symbols and Arrows", 2],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Scope invariant: no Unicode block is ever represented by a single entry.
// A block entered with one lone character looks arbitrary -- it implies the
// block is handled when in fact only that one character is -- and it invites
// a second lone entry later that hides the inconsistency. A block gets two or
// more entries, or none at all.
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

  it("covers 13 blocks with 2606 entries", () => {
    // Pinned so an accidental add or remove is visible in the diff. The block
    // count stays at 13 because WHOLESALE only fills the open blocks — Latin
    // letters, scripts, out-of-scope blocks, empty replacements and the euro
    // never enter.
    const byBlock = entriesByBlock();
    expect(byBlock.size).toBe(13);
    const total = [...byBlock.values()].reduce((n, chars) => n + chars.length, 0);
    expect(total).toBe(2606);
    expect(PUNCTUATION.length).toBe(172);
    expect(FRAMES.length).toBe(128);
    expect(SHAPES.length).toBe(89);
    expect(ARROWS.length).toBe(377);
    expect(MATH.length).toBe(260);
    expect(EMOJIS.length).toBe(1580);
  });

  it("matches every value to the vendored AnyAscii subset row", () => {
    // Wholesale proof inside the test suite, straight from the vendored file:
    // vendor/anyascii/table-0.3.3-subset.tsv holds one AnyAscii 0.3.3 row per
    // mapped codepoint; each table value must equal its row verbatim, and the
    // row count must equal the table size.
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

  it("keeps mapped emoji as ASCII :shortcode: and strips the unmapped ones", () => {
    // 🚀 is in the EMOJIS table, so substitution turns it into ASCII before
    // the strip pass. 🧠 and 🫠 are not in the table, so the strip removes them.
    expect(runPipeline("launch 🚀 to 🧠 the 🫠 finish")).toBe(
      "launch :rocket: to  the  finish",
    );
  });

  it("keeps every :shortcode: label intact, whatever emoji produced it", () => {
    // The load-bearing guarantee: substitution emits pure ASCII, so nothing
    // the emojis table produces can be caught by the strip that follows. The
    // strip removes the original codepoint, never the label it became.
    const labelled = [
      "🚀", "🔥", "✅", "❌", "⚠", "⭐", "📝", "🔒", "📁", "👍",
      "🎉", "💡", "🧠", "🫠", "🤯", "🦄",
    ].map((ch) => runPipeline(`x ${ch} y`));
    for (const out of labelled) {
      // Whatever survives is ASCII only, and the one-character label form
      // `:word:` is present whenever the emoji was in the table.
      expect(out, JSON.stringify(out)).toMatch(/^x [\x20-\x7E]* y$/);
    }
    expect(runPipeline("x 🚀 y")).toBe("x :rocket: y");
    expect(runPipeline("x 🎉 y")).toBe("x :tada: y");
    // Not in the table: removed, leaving no label behind.
    expect(runPipeline("x 🧠 y")).toBe("x  y");
    expect(runPipeline("x 🫠 y")).toBe("x  y");
  });

  it("substitutes curated punctuation before stripping, so no word breaks", () => {
    // — -> "-" and « » -> "<<" / ">>" happen in the substitution pass. The
    // bare strip would now KEEP all three (they are in kept blocks), but the
    // pipeline never shows them raw because substitution converts them first.
    expect(runPipeline("wait — «ready» now")).toBe("wait - <<ready>> now");
  });

  it("folds fullwidth letters before the strip sees them", () => {
    expect(runPipeline("ＡＢＣ ok")).toBe("ABC ok");
    expect(runPipeline("Ｈｅｌｌｏ — Ｗ")).toBe("Hello - W");
  });

  it("strips CJK punctuation in a sentence", () => {
    // The ideographic comma U+3001, the ideographic full stop U+3002 and the
    // corner brackets U+300C/U+300D are all stripped, and so is every kana
    // and kanji, leaving nothing behind.
    expect(runPipeline("これは、テスト。「本文」です。")).toBe("");
  });

  it("leaves Latin-1 accented Latin intact end to end", () => {
    expect(runPipeline("Café déjà vu — naïve 42")).toBe("Café déjà vu - naïve 42");
  });

  it("keeps decomposed Latin as decomposed, accent intact", () => {
    // U+0300-U+036F is in the allowlist, so a decomposed sequence survives with
    // its mark. The precomposed form is equally untouched, and the two remain
    // distinct byte sequences -- the strip does not normalise between them.
    // Both are written with explicit \uXXXX escapes so the intent survives any
    // editor or tooling that would recompose one spelling into the other.
    const decomposed = runPipeline("cafe\u0301"); // c a f e + COMBINING ACUTE
    expect(decomposed).toBe("cafe\u0301");
    expect(decomposed.length).toBe(5);
    expect(decomposed.codePointAt(4)).toBe(0x301);

    const precomposed = runPipeline("caf\u00e9"); // c a f + U+00E9
    expect(precomposed).toBe("caf\u00e9");
    expect(precomposed.length).toBe(4);
    expect(precomposed.codePointAt(3)).toBe(0xe9);
  });

  it("keeps Latin Extended, IPA and spacing modifiers end to end", () => {
    expect(runPipeline("Łódź — ā œ")).toBe("Łódź - ā œ");
    expect(runPipeline("ə ɛ ɔ ŋ ʁ")).toBe("ə ɛ ɔ ŋ ʁ");
    expect(runPipeline("ʰ ʷ ʻ")).toBe("ʰ ʷ ʻ");
  });

  it("produces pure ASCII for a mixed torture string", () => {
    // WHOLESALE values throughout: · → -, «done» → <<done>>, ✓ → v, ≠ → =.
    // The middle dot U+00B7 and the fullwidth colon U+FF1A both land in ASCII
    // (AnyAscii, then NFKC fold), while the ideographic comma U+3001, the CJK,
    // the unmapped emoji and the Greek are removed.
    const out = runPipeline(
      "Status — 50%\n· 世界：ok、ok\n· ＡＢＣ 🧠 «done» ✓ αβγ ≠ 1",
    );
    expect(out).toBe(
      "Status - 50%\n- :okok\n- ABC  <<done>> v  = 1",
    );
    expect(/^[\x20-\x7E\n]*$/.test(out)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Regression tests for the table audit: every case below used to come out of
  // stripNonLatin with the character silently deleted, which in the ASCII-art
  // and pricing examples inverted the meaning of the sentence.
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
    // WHOLESALE AnyAscii values: hollow pairs take the same target as filled,
    // and the large squares take their shortcode names.
    expect(runPipeline("status ● on ○ off ■ □ ⬛ ⬜")).toBe(
      "status * on * off # # :black_large_square: :white_large_square:",
    );
  });

  it("isolates the six flags through the pipeline", () => {
    // One category on, five off: only its entries convert. Unmapped frames
    // and shapes reach the strip raw and are deleted (outside the keep-set),
    // while an unmapped em dash survives raw (inside the keep-set) — the
    // flag, not the strip, is what converts. Measured, not guessed.
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
    // With frames off the box drawing reaches the strip unmapped, and Box
    // Drawing is outside the keep-set, so it is deleted rather than kept.
    expect(runPipeline("┌─┐", { frames: false })).toBe("");
    // Same for shapes: ● is outside the keep-set, so shapes:false deletes it.
    expect(runPipeline("a ● b", { shapes: false })).toBe("a  b");
  });

  it("keeps units and legal marks, but drops the euro sign", () => {
    // WHOLESALE AnyAscii values.
    expect(runPipeline("temp 25℃")).toBe("temp 25C");
    expect(runPipeline("v2 released ™")).toBe("v2 released TM");
    expect(runPipeline("doc № 4")).toBe("doc No 4");
    // U+20AC is deliberately unmapped (Currency Symbols is outside the 13 open
    // blocks) and outside the keep-set, so the strip deletes it. £ is in
    // Latin-1 and survives: the asymmetry is the documented consequence of the
    // refusal, not an oversight.
    expect(runPipeline("cheapest is €42")).toBe("cheapest is 42");
    expect(runPipeline("total: €100 or £100")).toBe("total: 100 or £100");
  });

  it("keeps set relations and operators", () => {
    // WHOLESALE AnyAscii values: single-char relations.
    expect(runPipeline("set ⊆ {1}")).toBe("set < {1}");
    expect(runPipeline("a ≡ b")).toBe("a = b");
    expect(runPipeline("empty ∅")).toBe("empty 0");
    expect(runPipeline("cost ≪ budget ≫ other")).toBe("cost << budget >> other");
    expect(runPipeline("dot a ⋅ b")).toBe("dot a * b");
    expect(runPipeline("wait ⋯ done")).toBe("wait - done");
  });

  it("keeps the audit-added emoji as shortcodes", () => {
    expect(runPipeline("shipped ✨ see 👀")).toBe("shipped :sparkles: see :eyes:");
    expect(runPipeline("aim 🎯 with 🔑")).toBe("aim :dart: with :key:");
    expect(runPipeline("📌 note 🔍 search")).toBe(":pushpin: note :mag: search");
    expect(runPipeline("⏰ time")).toBe(":alarm_clock: time");
  });

  it("deletes the emptied-block characters instead of spelling them out", () => {
    // 🆕 🤔 🙄 🤝 left the tables, and their blocks are no longer represented, so
    // with stripNonLatin they are deleted: there is no :shortcode: left to
    // convert them into.
    expect(runPipeline("see 👀 new 🆕 now")).toBe("see :eyes: new  now");
    expect(runPipeline("🤝 deal 🤔 hmm 🙄")).toBe(" deal  hmm ");
  });

  it("maps ↵ to < through the full pipeline (no line-structure change)", () => {
    // WHOLESALE AnyAscii value: U+21B5 is no longer a real newline, so no
    // entry in any table changes the line structure of the output anymore.
    const out = runPipeline("first↵second");
    expect(out).toBe("first<second");
    expect(out.indexOf("\n")).toBe(-1);
  });

  it("still strips codepoints outside the open blocks", () => {
    // WHOLESALE imports only the 13 open blocks, so anything else keeps the
    // old behaviour: stripped, not approximated. The shade blocks are Block
    // Elements (U+2580-U+259F); 🤯 is in Emoticons, outside the 13.
    expect(runPipeline("progress ▓▓▓░░ 50%")).toBe("progress  50%");
    expect(runPipeline("pizza 🤯")).toBe("pizza ");
    // Empty AnyAscii replacements stay unmapped and are left to the strip:
    // U+200B (ZWSP) is General Punctuation with an empty replacement upstream.
    expect(runPipeline("a\u200bb")).toBe("ab");
  });

  it("maps the previously-refused in-block characters per AnyAscii", () => {
    // These were declined by the old audit; WHOLESALE imports them.
    expect(runPipeline("target ◉ here")).toBe("target * here");
    expect(runPipeline("integral ∫ f")).toBe("integral S f");
    expect(runPipeline("pizza 🍕")).toBe("pizza :pizza:");
  });
});

// ---------------------------------------------------------------------------
// WHOLESALE flip spot-checks: the values the mission calls out by name, plus a
// cross-section of the families that moved. Every expectation was measured
// against the compiled build, never guessed.
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
    expect(sub("👍")).toBe(":thumbsup:"); // was ":+1:"
    expect(sub("👎")).toBe(":thumbsdown:"); // was ":-1:"
  });

  it("arrows follow appearance, not the old convention", () => {
    const cases: Array<[string, string]> = [
      ["⇄", "="], ["⇆", "="], ["⬌", "-"], ["↺", "<"], ["↻", ">"],
      ["⇠", "<"], ["⇢", ">"], ["➔", ">"], ["➜", ">"], ["➤", ">"],
      ["↔", ":left_right_arrow:"], ["▶", ":arrow_forward:"],
      ["↕", ":arrow_up_down:"], ["↩", ":leftwards_arrow_with_hook:"],
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
    // The old digraph/word forms are gone.
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
      ["⬛", ":black_large_square:"], ["⬜", ":white_large_square:"],
      ["▪", ":black_small_square:"], ["▫", ":white_small_square:"],
    ];
    for (const [ch, want] of cases) {
      expect(sub(ch), `U+${ch.codePointAt(0)!.toString(16)}`).toBe(want);
    }
  });

  it("emoji shortcodes are Discord-style throughout", () => {
    const cases: Array<[string, string]> = [
      ["✓", "v"], ["✔", ":heavy_check_mark:"], ["❎", ":negative_squared_cross_mark:"],
      ["ℹ", "i"], ["★", "*"], ["☆", "*"],
      ["📝", ":pencil:"], ["🐞", ":lady_beetle:"], ["📱", ":mobile_phone:"],
      ["📧", ":e_mail:"], ["☐", "#"], ["☒", "x"], ["🍕", ":pizza:"],
      ["⌘", "#"], ["⌚", ":watch:"], ["☕", ":coffee:"],
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
    // The euro sign.
    expect(sub("€")).toBe("€");
  });
});
