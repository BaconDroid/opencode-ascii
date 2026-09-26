/**
 * Unicode → ASCII substitution mappings, organised by category.
 * Each entry is a tuple of [unicode, ascii].
 */
export type Category = "punctuation" | "arrows" | "math" | "emojis";
export declare const PUNCTUATION: Array<[string, string]>;
export declare const ARROWS: Array<[string, string]>;
export declare const MATH: Array<[string, string]>;
export declare const EMOJIS: Array<[string, string]>;
export type SubstitutionConfig = {
    punctuation?: boolean;
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
 * Build a compiled RegExp that matches all active unicode characters at once.
 * This is much faster than running replace() N times.
 */
export declare function buildRegex(substitutions: Array<[string, string]>): RegExp;
/**
 * Apply substitutions to a string using a pre-built map and regex.
 */
export declare function applySubstitutions(text: string, regex: RegExp, map: Map<string, string>): string;
/**
 * Remove every character that does not belong to the Latin, Common, or
 * Inherited Unicode scripts.
 *
 * Applied AFTER substitutions, so mapped characters are already ASCII by
 * the time stripping runs. It keeps:
 *  - Latin, including extended/diacritic letters such as `é`, `ç`, `ñ`
 *  - Common (punctuation, digits, whitespace)
 *  - Inherited (combining marks, so decomposed text such as `e` + U+0301
 *    keeps its accent instead of being mangled)
 *
 * and removes CJK, Cyrillic, Arabic, Hebrew, Greek, and any other script.
 *
 * Note: most pictographic emoji are Script=Common and therefore SURVIVE
 * stripping raw. In the normal pipeline they never reach this function,
 * because the `emojis` category converts them to `:shortcode:` labels
 * first; with `emojis: false` + `stripNonLatin: true` they pass through.
 */
export declare function stripNonLatinChars(text: string): string;
