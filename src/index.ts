import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import {
  type SubstitutionConfig,
  buildSubstitutions,
  buildRegex,
  applySubstitutions,
  stripNonLatinChars,
} from "./substitutions";

/**
 * Options accepted by AsciiPlugin.
 *
 * All substitution categories default to `true` (enabled).
 * Set a category to `false` to skip substitution for it.
 * `stripNonLatin` defaults to `false` (opt-in) because it is destructive
 * for content that legitimately contains non-Latin text.
 *
 * @example
 * // opencode.json — disable emoji and math substitutions
 * {
 *   "plugin": [["opencode-ascii", { "emojis": false, "math": false }]]
 * }
 *
 * @example
 * // opencode.json — substitute as usual, then drop every non-Latin character
 * {
 *   "plugin": [["opencode-ascii", { "stripNonLatin": true }]]
 * }
 */
export type AsciiPluginOptions = SubstitutionConfig;

function resolveConfig(options?: PluginOptions): SubstitutionConfig {
  if (!options) return {};
  const config: SubstitutionConfig = {};
  if (typeof options["punctuation"] === "boolean")
    config.punctuation = options["punctuation"];
  if (typeof options["arrows"] === "boolean") config.arrows = options["arrows"];
  if (typeof options["math"] === "boolean") config.math = options["math"];
  if (typeof options["emojis"] === "boolean") config.emojis = options["emojis"];
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
 *  - `tool.execute.before`        : rewrites `write`, `edit`, and `apply_patch` tool arguments
 */
export const AsciiPlugin: Plugin = async (
  _ctx: PluginInput,
  options?: PluginOptions,
) => {
  const config = resolveConfig(options);
  const substitutions = buildSubstitutions(config);

  if (substitutions.length === 0 && !config.stripNonLatin) {
    // All categories disabled and no stripping — nothing to do.
    return {};
  }

  const map = new Map<string, string>(substitutions);
  // Reset regex lastIndex before reuse by always using a fresh call to
  // buildRegex; the 'g' flag is stateful so we rebuild per call or use
  // a factory. We build once and rely on String.prototype.replace resetting it.
  const regex = buildRegex(substitutions);

  function substitute(text: string): string {
    // Reset the regex state (stateful with /g flag)
    regex.lastIndex = 0;
    const substituted = applySubstitutions(text, regex, map);
    // Stripping runs after substitution so mapped characters are already
    // ASCII, and so `:shortcode:` labels survive untouched.
    if (config.stripNonLatin) return stripNonLatinChars(substituted);
    return substituted;
  }

  return {
    /**
     * Rewrite completed AI text parts before they are stored.
     * `experimental.text.complete` fires once per text part after the
     * streaming is done, giving us `output.text` to modify in place.
     */
    "experimental.text.complete": async (_input, output) => {
      if (typeof output.text === "string") {
        output.text = substitute(output.text);
      }
    },

    /**
     * Rewrite file-writing tool arguments before execution.
     *
     * Tools handled:
     *  - `write`       : `args.content`
     *  - `edit`        : `args.newString` (NOT `oldString` -- it must match existing file content)
     *  - `apply_patch` : `args.patchText` (unified diff content)
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
        case "apply_patch": {
          if (typeof output.args?.patchText === "string") {
            output.args.patchText = substitute(output.args.patchText);
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
