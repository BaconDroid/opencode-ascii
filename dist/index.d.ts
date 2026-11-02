import { Plugin } from "@opencode/plugin";
import { type SubstitutionConfig } from "./substitutions";
export type AsciiPluginOptions = SubstitutionConfig;
export type AsciiPluginInput = Record<string, unknown>;
export type AsciiRewriter = {
    /**
     * Substitution followed by the optional strip: the shape used for AI text and
     * tool results.
     */
    rewrite(text: string): string;
    /** Substitution only: the shape used for file payloads, where deletion is lossy. */
    substitute(text: string): string;
    /** False when every category is off and stripping is off, so nothing is registered. */
    enabled: boolean;
};
/**
 * Compile the options into the pair of transforms the hooks apply. Exported so
 * the whole pipeline can be exercised without a running OpenCode host.
 */
export declare function createRewriter(options?: AsciiPluginInput): AsciiRewriter;
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents in the
 * model-visible transcript, file write/edit arguments and tool results.
 */
export declare const AsciiPlugin: Plugin.Plugin;
export default AsciiPlugin;
