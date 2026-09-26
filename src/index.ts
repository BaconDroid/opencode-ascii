import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import {
  type SubstitutionConfig,
  buildSubstitutions,
  buildRegex,
  applySubstitutions,
} from "./substitutions";

/**
 * Options accepted by AsciiPlugin.
 *
 * All categories default to `true` (enabled).
 * Set a category to `false` to skip substitution for it.
 *
 * @example
 * // opencode.json — disable emoji and math substitutions
 * {
 *   "plugin": [["opencode-ascii", { "emojis": false, "math": false }]]
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
  return config;
}

/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents
 * in AI responses and file write/edit operations.
 *
 * Covered hooks:
 *  - `experimental.text.complete` : rewrites completed AI text parts
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments
 *                                  (`apply_patch` is intentionally passed
 *                                  through verbatim)
 */
export const AsciiPlugin: Plugin = async (
  _ctx: PluginInput,
  options?: PluginOptions,
) => {
  const config = resolveConfig(options);
  const substitutions = buildSubstitutions(config);

  if (substitutions.length === 0) {
    // All categories disabled — nothing to do.
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
    return applySubstitutions(text, regex, map);
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
