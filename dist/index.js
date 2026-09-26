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
 *  - `experimental.text.complete` : rewrites completed AI text parts
 *                                  (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments
 *                                  (substitution ONLY; `apply_patch` is
 *                                  intentionally passed through verbatim)
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
     * Substitution + optional non-Latin stripping.
     *
     * Used for AI text parts ONLY. Stripping is deliberately NOT applied to
     * file-writing tool arguments: removing characters from file content is
     * irreversible data loss, and `write`/`edit` payloads legitimately contain
     * non-Latin text (translated docs, string tables, i18n fixtures).
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
         * This is the ONLY hook where `stripNonLatin` is applied.
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
         *  - `write` : `args.content` (fresh content, nothing to match against)
         *  - `edit`  : `args.newString` (NOT `oldString` -- `oldString` is matched
         *              against the real file, `newString` is what gets written)
         *
         * `apply_patch` is deliberately NOT handled. `args.patchText` is a
         * machine-parsed unified diff, not prose: its `-` removal lines and its
         * context lines must match the target file BYTE FOR BYTE or the patch is
         * rejected. Substituting inside `patchText` rewrites those lines, so a
         * file that legitimately contains a typographic character (an em dash,
         * say) would no longer match and the patch would fail to apply. The
         * payload is therefore passed through verbatim. (This is a bug fix: the
         * plugin previously rewrote `patchText` and could break patches.)
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
