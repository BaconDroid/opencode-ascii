import type { Plugin } from "@opencode-ai/plugin";
import { type SubstitutionConfig } from "./substitutions";
/**
 * Options accepted by AsciiPlugin.
 *
 * All substitution categories default to `true` (enabled).
 * Set a category to `false` to skip substitution for it.
 *
 * `stripNonLatin` defaults to `false` (opt-in) and applies to AI text
 * responses only — never to file arguments, where dropping characters would
 * be irreversible data loss.
 *
 * @example
 * // opencode.json — disable emoji and math substitutions
 * {
 *   "plugin": [["opencode-ascii", { "emojis": false, "math": false }]]
 * }
 *
 * @example
 * // opencode.json — drop non-Latin characters from AI responses only
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
 *  - `experimental.text.complete` : rewrites completed AI text parts (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments (substitution only)
 */
export declare const AsciiPlugin: Plugin;
declare const _default: {
    id: string;
    server: Plugin;
};
export default _default;
