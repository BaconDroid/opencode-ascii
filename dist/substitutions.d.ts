/**
 * Unicode → ASCII substitution mappings, organised by category.
 * Each entry is a tuple of [unicode, ascii].
 *
 * Table sourcing: WHOLESALE AnyAscii tag 0.3.3 (ISC, see LICENSE.anyascii).
 * Every value below is the AnyAscii replacement verbatim — 2606 entries across
 * the 13 open blocks, six categories. Never imported: Latin letters
 * (U+00A0-U+036F), scripts (Greek, Cyrillic, Arabic, Hebrew, CJK, kana,
 * Hangul, Thai, Devanagari, ... — never romanised here), blocks outside the
 * 13 open ones, empty replacements, and the euro sign U+20AC (explicit
 * decision, left unmapped). Assumed, not upstream: the :shortcode: names
 * treated as Discord-style labels, the category placement of wholesale
 * entries by block, and the frames/shapes split itself. See the README
 * section "Table sourcing (AnyAscii)". The vendored rows backing these
 * values live in vendor/anyascii/table-0.3.3-subset.tsv.
 */
export type Category = "punctuation" | "frames" | "shapes" | "arrows" | "math" | "emojis";
export declare const PUNCTUATION: Array<[string, string]>;
export declare const FRAMES: Array<[string, string]>;
export declare const SHAPES: Array<[string, string]>;
export declare const ARROWS: Array<[string, string]>;
export declare const MATH: Array<[string, string]>;
export declare const EMOJIS: Array<[string, string]>;
export type SubstitutionConfig = {
    punctuation?: boolean;
    frames?: boolean;
    shapes?: boolean;
    arrows?: boolean;
    math?: boolean;
    emojis?: boolean;
};
/**
 * Build a combined substitution map from enabled categories.
 */
export declare function buildSubstitutions(config?: SubstitutionConfig): Array<[string, string]>;
/**
 * Build a compiled RegExp that matches all active unicode characters at once.
 * This is much faster than running replace() N times.
 *
 * The pattern is a single character class of coalesced codepoint ranges, not
 * an alternation. An alternation of all 2606 entries pushes V8 off its
 * optimiser onto the interpreter, with match cost proportional to the number
 * of alternatives (measured, byte-identical output: 100 KB of matching text
 * took 648 ms as an alternation vs 0.5 ms as a class; 1 MB took 7667 ms vs
 * 5.6 ms; 1 MB with no match is equivalent either way). V8 compiles classes
 * to a range table, so the 23 ranges below cost the same as a handful.
 * Ranges may cover codepoints no table maps; that is harmless because
 * applySubstitutions falls back to the character itself (`?? match`). An
 * empty set yields `[]`, which never matches — replacing nothing, like the
 * old empty alternation.
 */
export declare function buildRegex(substitutions: Array<[string, string]>): RegExp;
/**
 * Apply substitutions to a string using a pre-built map and regex.
 */
export declare function applySubstitutions(text: string, regex: RegExp, map: Map<string, string>): string;
