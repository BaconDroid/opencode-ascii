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
/** Options object as passed by the host: an open record of unknown values. */
export type AsciiPluginInput = Record<string, unknown>;
/** `output` of `experimental.text.complete`. */
export type TextCompleteOutput = {
    text: string;
};
/** `input` of `tool.execute.before`. */
export type ToolExecuteBeforeInput = {
    tool: string;
};
/** `output` of `tool.execute.before`. */
export type ToolExecuteBeforeOutput = {
    args: Record<string, unknown>;
};
/**
 * The hooks this plugin implements, described structurally so the emitted
 * declaration does not depend on the host's plugin package. The conformance
 * assertion at the bottom of this file keeps them aligned with the host
 * contract, so nothing is actually lost.
 */
export type AsciiPluginHooks = {
    "experimental.text.complete"?: (input: unknown, output: TextCompleteOutput) => Promise<void>;
    "tool.execute.before"?: (input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput) => Promise<void>;
};
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents
 * in AI responses and file write/edit operations.
 *
 * Covered hooks:
 *  - `experimental.text.complete` : rewrites completed AI text parts (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments (substitution only)
 */
export declare const AsciiPlugin: (_ctx?: unknown, options?: AsciiPluginInput) => Promise<AsciiPluginHooks>;
declare const _default: {
    id: string;
    server: (_ctx?: unknown, options?: AsciiPluginInput) => Promise<AsciiPluginHooks>;
};
export default _default;
