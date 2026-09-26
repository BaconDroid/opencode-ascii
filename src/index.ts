import type { Hooks } from "@opencode-ai/plugin";
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
export type TextCompleteOutput = { text: string };

/** `input` of `tool.execute.before`. */
export type ToolExecuteBeforeInput = { tool: string };

/** `output` of `tool.execute.before`. */
export type ToolExecuteBeforeOutput = { args: Record<string, unknown> };

/**
 * The hooks this plugin implements, described structurally so the emitted
 * declaration does not depend on the host's plugin package. The conformance
 * assertion at the bottom of this file keeps them aligned with the host
 * contract, so nothing is actually lost.
 */
export type AsciiPluginHooks = {
  "experimental.text.complete"?: (
    input: unknown,
    output: TextCompleteOutput,
  ) => Promise<void>;
  "tool.execute.before"?: (
    input: ToolExecuteBeforeInput,
    output: ToolExecuteBeforeOutput,
  ) => Promise<void>;
};

function resolveConfig(options?: AsciiPluginInput): SubstitutionConfig {
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
 *  - `experimental.text.complete` : rewrites completed AI text parts (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments (substitution only)
 */
export const AsciiPlugin = async (
  _ctx?: unknown,
  options?: AsciiPluginInput,
): Promise<AsciiPluginHooks> => {
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
    return applySubstitutions(text, regex, map);
  }

  /**
   * Substitution, then optional non-Latin stripping.
   *
   * Used for AI text parts only: `write`/`edit` payloads legitimately contain
   * non-Latin text (translated docs, string tables), and removing characters
   * from them would be irreversible data loss.
   */
  function rewriteText(text: string): string {
    const substituted = substitute(text);
    if (config.stripNonLatin) return stripNonLatinChars(substituted);
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

/**
 * Compile-time guarantee that the self-contained surface above still satisfies
 * the host contract. Unexported, so `Hooks` never reaches the declaration file
 * and no runtime code is emitted -- but the link to `@opencode-ai/plugin` is
 * still checked on every build.
 */
type Assert<T extends true> = T;
type _HooksConformance = Assert<
  AsciiPluginHooks extends Pick<Hooks, keyof AsciiPluginHooks> ? true : false
>;
