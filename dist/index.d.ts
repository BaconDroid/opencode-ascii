import type { Plugin } from "@opencode-ai/plugin";
import { type SubstitutionConfig } from "./substitutions";
/**
 * Options accepted by AsciiPlugin.
 *
 * All substitution categories default to `true` (enabled).
 */
export type AsciiPluginOptions = SubstitutionConfig;
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents
 * in AI responses and file write/edit operations.
 *
 * Covered hooks:
 *  - `experimental.text.complete` : rewrites completed AI text parts
 *  - `tool.execute.before`        : rewrites `write`, `edit`, and `apply_patch` tool arguments
 */
export declare const AsciiPlugin: Plugin;
declare const _default: {
    id: string;
    server: Plugin;
};
export default _default;
