/**
 * Unicode → ASCII mappings by category, each entry `[unicode, ascii]`.
 *
 * Values are the AnyAscii 0.3.3 replacement verbatim (ISC, see
 * LICENSE.anyascii): 1712 entries over the 13 open blocks. Not imported: Latin
 * letters, out-of-scope blocks (scripts included), empty replacements and
 * Discord-style `:shortcode:` labels. See the README section "Table sourcing
 * (AnyAscii)" and scripts/vendor-anyascii.py, which regenerates the tables.
 */
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
    stripNonLatin?: boolean;
};
/**
 * Build a combined substitution map from enabled categories.
 */
export declare function buildSubstitutions(config?: SubstitutionConfig): Array<[string, string]>;
/**
 * Compile every active key into one global character class of coalesced ranges.
 * A class compiles to a V8 range table; an alternation of 1712 entries drops V8
 * to the interpreter (measured 648 ms vs 0.5 ms per 100 KB of matching text).
 * Ranges may cover unmapped codepoints, which `applySubstitutions` passes
 * through unchanged. An empty set yields `[]`, which never matches.
 */
export declare function buildRegex(substitutions: Array<[string, string]>): RegExp;
/**
 * Apply substitutions to a string using a pre-built map and regex.
 */
export declare function applySubstitutions(text: string, regex: RegExp, map: Map<string, string>): string;
/**
 * Remove every character outside the allowlist above. Nothing is folded:
 * fullwidth/halfwidth forms (U+FF00-U+FFEF) are out of scope and are deleted.
 * Applied after substitutions, so curated characters are already ASCII.
 */
export declare function stripNonLatinChars(text: string): string;
