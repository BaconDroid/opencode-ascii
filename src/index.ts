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
 * `stripNonLatin` defaults to `false` (opt-in): it applies to AI text and
 * tool results, never to file arguments (irreversible data loss).
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
 * `input` of `tool.execute.after`.
 *
 * Structurally narrowed to the single field this plugin reads; the host also
 * passes `sessionID`, `callID` and `args`, which stay unused here.
 */
export type ToolExecuteAfterInput = { tool: string };

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
  "experimental.text.complete"?: (
    input: unknown,
    output: TextCompleteOutput,
  ) => Promise<void>;
  "tool.execute.before"?: (
    input: ToolExecuteBeforeInput,
    output: ToolExecuteBeforeOutput,
  ) => Promise<void>;
  "tool.execute.after"?: (
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput,
  ) => Promise<void>;
};

/**
 * Narrow the host's loose options record to the recognised boolean categories.
 * Unknown keys and non-boolean values are ignored.
 */
function resolveConfig(options?: AsciiPluginInput): SubstitutionConfig {
  if (!options) return {};
  const config: SubstitutionConfig = {};
  if (typeof options["punctuation"] === "boolean")
    config.punctuation = options["punctuation"];
  if (typeof options["frames"] === "boolean") config.frames = options["frames"];
  if (typeof options["shapes"] === "boolean") config.shapes = options["shapes"];
  if (typeof options["arrows"] === "boolean") config.arrows = options["arrows"];
  if (typeof options["math"] === "boolean") config.math = options["math"];
  if (typeof options["emojis"] === "boolean") config.emojis = options["emojis"];
  if (typeof options["stripNonLatin"] === "boolean")
    config.stripNonLatin = options["stripNonLatin"];
  return config;
}

/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents
 * in AI responses, file write/edit operations, and tool results.
 *
 * Covered hooks:
 *  - `experimental.text.complete` : rewrites completed AI text parts (substitution + optional `stripNonLatin`)
 *  - `tool.execute.before`        : rewrites `write` and `edit` tool arguments (substitution only)
 *  - `tool.execute.after`         : rewrites the rendered title and output of any tool result (substitution + optional `stripNonLatin`)
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
   * Never used on file payloads: `write`/`edit`/`apply_patch` arguments
   * legitimately contain non-Latin text (translated docs, string tables), and
   * removing characters from them would be irreversible data loss.
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
     * One of the two hooks where `stripNonLatin` is applied (the other is
     * `tool.execute.after` below).
     */
    "experimental.text.complete": async (_input, output) => {
      if (typeof output.text === "string") {
        output.text = rewriteText(output.text);
      }
    },

    /**
     * Rewrite file-writing tool arguments before execution, substitutions
     * only — never `stripNonLatin`, never `oldString` (it must match).
     *
     * `apply_patch` stays out: its removal and context lines must match the
     * target file byte for byte, so substituting `patchText` breaks patches.
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

    /**
     * Rewrite the rendered title and body of a tool result.
     *
     * Not display-only: results are replayed to the model, so stripping is
     * lossy past the tool call — the assumed trade of the opt-in. `metadata`
     * is left alone (the renderer consumes it). This is the only interception
     * point the host offers for tool results.
     */
    "tool.execute.after": async (_input, output) => {
      if (typeof output?.title === "string") {
        output.title = rewriteText(output.title);
      }
      if (typeof output?.output === "string") {
        output.output = rewriteText(output.output);
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
