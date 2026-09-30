import { type SubstitutionConfig } from "./substitutions";
/**
 * Options accepted by AsciiPlugin.
 *
 * All substitution categories default to `true` (enabled).
 * `stripNonLatin` defaults to `false` (opt-in): it applies to AI text and
 * tool results, never to file arguments (irreversible data loss).
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
 * `input` of `tool.execute.after`.
 *
 * Structurally narrowed to the single field this plugin reads; the host also
 * passes `sessionID`, `callID` and `args`, which stay unused here.
 */
export type ToolExecuteAfterInput = {
    tool: string;
};
/** `output` of `tool.execute.after`. */
export type ToolExecuteAfterOutput = {
    title: string;
    output: string;
    metadata: unknown;
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
    "tool.execute.after"?: (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
};
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents
 * in AI responses, file write/edit operations, and tool results.
 *
 * Covered hooks:
 *  - `experimental.text.complete` : rewrites completed AI text parts (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments (substitution only)
 *  - `tool.execute.after`         : rewrites the rendered title and output of any tool result (substitution + optional `stripNonLatin`)
 */
export declare const AsciiPlugin: (_ctx?: unknown, options?: AsciiPluginInput) => Promise<AsciiPluginHooks>;
declare const _default: {
    id: string;
    server: (_ctx?: unknown, options?: AsciiPluginInput) => Promise<AsciiPluginHooks>;
};
export default _default;
