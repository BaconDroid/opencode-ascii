import { buildSubstitutions, buildRegex, applySubstitutions, stripNonLatinChars, } from "./substitutions";
const BOOLEAN_KEYS = [
    "punctuation",
    "frames",
    "shapes",
    "arrows",
    "math",
    "emojis",
    "stripNonLatin",
];
/** Narrow the host's loose options record to the recognised boolean keys. */
function resolveConfig(options) {
    if (!options)
        return {};
    const config = {};
    for (const key of BOOLEAN_KEYS) {
        if (typeof options[key] === "boolean")
            config[key] = options[key];
    }
    return config;
}
/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents in AI
 * text, file write/edit arguments and tool results.
 */
export const AsciiPlugin = async (_ctx, options) => {
    const config = resolveConfig(options);
    const substitutions = buildSubstitutions(config);
    if (substitutions.length === 0 && !config.stripNonLatin)
        return {};
    const map = new Map(substitutions);
    const regex = buildRegex(substitutions);
    const substitute = (text) => {
        regex.lastIndex = 0;
        return applySubstitutions(text, regex, map);
    };
    // Substitution, then optional strip. Never used on file payloads: deleting
    // characters there would be irreversible data loss.
    const rewriteText = (text) => config.stripNonLatin ? stripNonLatinChars(substitute(text)) : substitute(text);
    return {
        // Fires once per text part after streaming, before the text is stored.
        "experimental.text.complete": async (_input, output) => {
            if (typeof output.text === "string")
                output.text = rewriteText(output.text);
        },
        // Substitutions only: `oldString` must keep matching the file, and
        // `apply_patch` diffs must stay byte-identical.
        "tool.execute.before": async (input, output) => {
            if (input.tool === "write" && typeof output.args?.content === "string") {
                output.args.content = substitute(output.args.content);
            }
            else if (input.tool === "edit" && typeof output.args?.newString === "string") {
                output.args.newString = substitute(output.args.newString);
            }
        },
        // Results are replayed to the model, so stripping here is lossy past the
        // tool call; `metadata` is renderer state and is left alone.
        "tool.execute.after": async (_input, output) => {
            if (typeof output?.title === "string")
                output.title = rewriteText(output.title);
            if (typeof output?.output === "string")
                output.output = rewriteText(output.output);
        },
    };
};
export default { id: "opencode-ascii", server: AsciiPlugin };
