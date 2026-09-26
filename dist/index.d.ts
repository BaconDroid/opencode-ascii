import type { Plugin } from "@opencode-ai/plugin";
import { type SubstitutionConfig } from "./substitutions";
/**
 * Options accepted by AsciiPlugin.
 *
 * All substitution categories default to `true` (enabled).
 * Set a category to `false` to skip substitution for it.
 *
 * `stripNonLatin` defaults to `false` (opt-in) and applies to AI text
 * responses ONLY. It is never applied to file write/edit/patch arguments,
 * because deleting characters from file content is irreversible data loss.
 *
 * @example
 * // opencode.json — disable emoji and math substitutions
 * {
 *   "plugin": [["opencode-ascii", { "emojis": false, "math": false }]]
 * }
 *
 * @example
 * // opencode.json — substitute AI text as usual, then drop non-Latin
 * // characters from AI responses only (file writes stay untouched)
 * {
 *   "plugin": [["opencode-ascii", { "stripNonLatin": true }]]
 * }
 */
export type AsciiPluginOptions = SubstitutionConfig;
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents
 * in AI responses and file write/edit operations.
 *
 * Covered hooks:
 *  - `experimental.text.complete` : rewrites completed AI text parts
 *                                  (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments
 *                                  (substitution ONLY; `apply_patch` is
 *                                  intentionally passed through verbatim)
 */
export declare const AsciiPlugin: Plugin;
declare const _default: {
    id: string;
    server: Plugin;
};
export default _default;
