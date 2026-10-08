import { type SubstitutionConfig } from "./substitutions";
export type AsciiPluginOptions = SubstitutionConfig;
export type AsciiPluginInput = Record<string, unknown>;
/** `output` of `experimental.text.complete`. */
export type TextCompleteOutput = {
    text: string;
};
/** `input` of `tool.execute.before` and `tool.execute.after`. */
export type ToolInput = {
    tool: string;
};
/** `output` of `tool.execute.before`. */
export type ToolBeforeOutput = {
    args: Record<string, unknown>;
};
/** `output` of `tool.execute.after`. `metadata` is intentionally unused. */
export type ToolAfterOutput = {
    title: string;
    output: string;
    metadata: unknown;
};
/**
 * Hooks described structurally, so the declaration never depends on the host's
 * `Hooks` type; the conformance assertion at the bottom keeps them in sync.
 */
export type AsciiPluginHooks = {
    "experimental.text.complete"?: (input: unknown, output: TextCompleteOutput) => Promise<void>;
    "tool.execute.before"?: (input: ToolInput, output: ToolBeforeOutput) => Promise<void>;
    "tool.execute.after"?: (input: ToolInput, output: ToolAfterOutput) => Promise<void>;
};
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents in AI
 * text, file write/edit arguments and tool results.
 */
export declare const AsciiPlugin: (_ctx?: unknown, options?: AsciiPluginInput) => Promise<AsciiPluginHooks>;
declare const _default: {
    id: string;
    server: (_ctx?: unknown, options?: AsciiPluginInput) => Promise<AsciiPluginHooks>;
};
export default _default;
