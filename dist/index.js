import { buildSubstitutions, buildRegex, applySubstitutions, stripNonLatinChars, } from "./substitutions";
function resolveConfig(options) {
    if (!options)
        return {};
    const config = {};
    if (typeof options["punctuation"] === "boolean")
        config.punctuation = options["punctuation"];
    if (typeof options["arrows"] === "boolean")
        config.arrows = options["arrows"];
    if (typeof options["math"] === "boolean")
        config.math = options["math"];
    if (typeof options["emojis"] === "boolean")
        config.emojis = options["emojis"];
    if (typeof options["stripNonLatin"] === "boolean")
        config.stripNonLatin = options["stripNonLatin"];
    return config;
}
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents
 * in AI responses and file write/edit operations.
 *
 * Covered hooks:
 *  - `experimental.text.complete` : rewrites completed AI text parts (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments (substitution only)
 */
export const AsciiPlugin = async (_ctx, options) => {
    const config = resolveConfig(options);
    const substitutions = buildSubstitutions(config);
    if (substitutions.length === 0 && !config.stripNonLatin) {
        // All categories disabled and no stripping — nothing to do.
        return {};
    }
    const map = new Map(substitutions);
    // Reset regex lastIndex before reuse by always using a fresh call to
    // buildRegex; the 'g' flag is stateful so we rebuild per call or use
    // a factory. We build once and rely on String.prototype.replace resetting it.
    const regex = buildRegex(substitutions);
    function substitute(text) {
        // Reset the regex state (stateful with /g flag)
        regex.lastIndex = 0;
        return applySubstitutions(text, regex, map);
    }
    /**
     * Substitution, then optional non-Latin stripping.
     *
     * Used for AI text parts only: `write`/`edit` payloads legitimately contain
     * non-Latin text (translated docs, string tables), and removing characters
     * from them would be irreversible data loss.
     */
    function rewriteText(text) {
        const substituted = substitute(text);
        if (config.stripNonLatin)
            return stripNonLatinChars(substituted);
        return substituted;
    }
    return {
        /**
         * Rewrite completed AI text parts before they are stored.
         * `experimental.text.complete` fires once per text part after the
         * streaming is done, giving us `output.text` to modify in place.
         *
         * The only hook where `stripNonLatin` is applied.
         */
        "experimental.text.complete": async (_input, output) => {
            if (typeof output.text === "string") {
                output.text = rewriteText(output.text);
            }
        },
        /**
         * Rewrite file-writing tool arguments before execution.
         *
         * Substitutions only — `stripNonLatin` is never applied here.
         *
         * Tools handled:
         *  - `write` : `args.content`
         *  - `edit`  : `args.newString` (NOT `oldString` -- it must match existing file content)
         *
         * `apply_patch` is deliberately NOT handled: `args.patchText` is a
         * machine-parsed unified diff whose removal and context lines must match
         * the target file byte for byte, so substituting inside it makes patches
         * fail to apply.
         */
        "tool.execute.before": async (input, output) => {
            switch (input.tool) {
                case "write": {
                    if (typeof output.args?.content === "string") {
                        output.args.content = substitute(output.args.content);
                    }
                    break;
                }
                case "edit": {
                    if (typeof output.args?.newString === "string") {
                        output.args.newString = substitute(output.args.newString);
                    }
                    break;
                }
            }
        },
    };
};
export default {
    id: "opencode-ascii",
    server: AsciiPlugin,
};
