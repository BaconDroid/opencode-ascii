import type { Hooks } from "@opencode-ai/plugin";
import {
  type SubstitutionConfig,
  buildSubstitutions,
  buildRegex,
  applySubstitutions,
  stripNonLatinChars,
} from "./substitutions";

export type AsciiPluginOptions = SubstitutionConfig;
export type AsciiPluginInput = Record<string, unknown>;

/** `output` of `experimental.text.complete`. */
export type TextCompleteOutput = { text: string };
/** `input` of `tool.execute.before` and `tool.execute.after`. */
export type ToolInput = { tool: string };
/** `output` of `tool.execute.before`. */
export type ToolBeforeOutput = { args: Record<string, unknown> };
/** `output` of `tool.execute.after`. `metadata` is intentionally unused. */
export type ToolAfterOutput = { title: string; output: string; metadata: unknown };

/**
 * Hooks described structurally, so the declaration never depends on the host's
 * `Hooks` type; the conformance assertion at the bottom keeps them in sync.
 */
export type AsciiPluginHooks = {
  "experimental.text.complete"?: (
    input: unknown,
    output: TextCompleteOutput,
  ) => Promise<void>;
  "tool.execute.before"?: (
    input: ToolInput,
    output: ToolBeforeOutput,
  ) => Promise<void>;
  "tool.execute.after"?: (
    input: ToolInput,
    output: ToolAfterOutput,
  ) => Promise<void>;
};

const BOOLEAN_KEYS = [
  "punctuation",
  "frames",
  "shapes",
  "arrows",
  "math",
  "emojis",
  "stripNonLatin",
] as const;

/** Narrow the host's loose options record to the recognised boolean keys. */
function resolveConfig(options?: AsciiPluginInput): SubstitutionConfig {
  if (!options) return {};
  const config: SubstitutionConfig = {};
  for (const key of BOOLEAN_KEYS) {
    if (typeof options[key] === "boolean") config[key] = options[key];
  }
  return config;
}

/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents in AI
 * text, file write/edit arguments and tool results.
 */
export const AsciiPlugin = async (
  _ctx?: unknown,
  options?: AsciiPluginInput,
): Promise<AsciiPluginHooks> => {
  const config = resolveConfig(options);
  const substitutions = buildSubstitutions(config);
  if (substitutions.length === 0 && !config.stripNonLatin) return {};

  const map = new Map<string, string>(substitutions);
  const regex = buildRegex(substitutions);

  const substitute = (text: string): string => {
    regex.lastIndex = 0;
    return applySubstitutions(text, regex, map);
  };

  // Substitution, then optional strip. Never used on file payloads: deleting
  // characters there would be irreversible data loss.
  const rewriteText = (text: string): string =>
    config.stripNonLatin ? stripNonLatinChars(substitute(text)) : substitute(text);

  return {
    // Fires once per text part after streaming, before the text is stored.
    "experimental.text.complete": async (_input, output) => {
      if (typeof output.text === "string") output.text = rewriteText(output.text);
    },

    // Substitutions only: `oldString` must keep matching the file, and
    // `apply_patch` diffs must stay byte-identical.
    "tool.execute.before": async (input, output) => {
      if (input.tool === "write" && typeof output.args?.content === "string") {
        output.args.content = substitute(output.args.content);
      } else if (input.tool === "edit" && typeof output.args?.newString === "string") {
        output.args.newString = substitute(output.args.newString);
      }
    },

    // Results are replayed to the model, so stripping here is lossy past the
    // tool call; `metadata` is renderer state and is left alone.
    "tool.execute.after": async (_input, output) => {
      if (typeof output?.title === "string") output.title = rewriteText(output.title);
      if (typeof output?.output === "string") output.output = rewriteText(output.output);
    },
  };
};

export default { id: "opencode-ascii", server: AsciiPlugin };

type Assert<T extends true> = T;
type _HooksConformance = Assert<
  AsciiPluginHooks extends Pick<Hooks, keyof AsciiPluginHooks> ? true : false
>;
