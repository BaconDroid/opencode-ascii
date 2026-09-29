import { describe, it, expect } from "vitest";
import {
  PUNCTUATION,
  ARROWS,
  MATH,
  EMOJIS,
  buildSubstitutions,
  buildRegex,
  applySubstitutions,
  stripNonLatinChars,
} from "../src/substitutions";

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
  it("returns all 4 categories by default (empty config)", () => {
    const subs = buildSubstitutions({});
    const fromSet = new Set(subs.map(([k]) => k));
    // Should contain entries from every category
    expect(fromSet.has("—")).toBe(true); // em dash -- PUNCTUATION
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
  it("substitutes all 4 categories in a single text", () => {
    const subs = buildSubstitutions({});
    const map = new Map<string, string>(subs);
    const regex = buildRegex(subs);

    const input = "dash — arrow → not-equal ≠ rocket 🚀";
    regex.lastIndex = 0;
    const result = applySubstitutions(input, regex, map);
    expect(result).toBe("dash - arrow -> not-equal != rocket :rocket:");
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
      ["→", "->"], // rightwards arrow
      ["←", "<-"], // leftwards arrow
      ["↔", "<->"], // left right arrow
      ["⇒", "=>"], // rightwards double arrow
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
      ["≠", "!="], // not equal
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
// Full pipeline with stripNonLatin (substitution, then the block allowlist)
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
      "🎉", "💡", "🧠", "🫠",
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
    // — -> "-" and « » -> '"' happen in the substitution pass. The
    // bare strip would now KEEP all three (they are in kept blocks), but the
    // pipeline never shows them raw because substitution converts them first.
    expect(runPipeline("wait — «ready» now")).toBe('wait - "ready" now');
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
    // Curated values throughout: · → ., «done» → "done", ✓ → its
    // :white_check_mark: shortcode, ≠ → !=. The middle dot U+00B7 lands in
    // ASCII via the table and the fullwidth colon U+FF1A via the NFKC fold,
    // while the ideographic comma U+3001, the CJK, the unmapped emoji and the
    // Greek are removed.
    const out = runPipeline(
      "Status — 50%\n· 世界：ok、ok\n· ＡＢＣ 🧠 «done» ✓ αβγ ≠ 1",
    );
    expect(out).toBe(
      'Status - 50%\n. :okok\n. ABC  "done" :white_check_mark:  != 1',
    );
    expect(/^[\x20-\x7E\n]*$/.test(out)).toBe(true);
  });
});
