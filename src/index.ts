import { Plugin } from "@opencode/plugin";
import {
  type SubstitutionConfig,
  buildSubstitutions,
  buildRegex,
  applySubstitutions,
  stripNonLatinChars,
} from "./substitutions";

export type AsciiPluginOptions = SubstitutionConfig;
export type AsciiPluginInput = Record<string, unknown>;

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
export function createRewriter(options?: AsciiPluginInput): AsciiRewriter {
  const config = resolveConfig(options);
  const substitutions = buildSubstitutions(config);
  const map = new Map<string, string>(substitutions);
  const regex = buildRegex(substitutions);

  const substitute = (text: string): string => {
    regex.lastIndex = 0;
    return applySubstitutions(text, regex, map);
  };

  return {
    substitute,
    rewrite: config.stripNonLatin
      ? (text) => stripNonLatinChars(substitute(text))
      : substitute,
    enabled: substitutions.length > 0 || config.stripNonLatin === true,
  };
}

/**
 * AsciiPlugin — substitutes unicode characters with ASCII equivalents in the
 * model-visible transcript, file write/edit arguments and tool results.
 */
export const AsciiPlugin = Plugin.define({
  id: "opencode-ascii",
  async setup(ctx) {
    const rewriter = createRewriter(ctx.options as AsciiPluginInput);
    if (!rewriter.enabled) return;

    // V2 has no `experimental.text.complete` equivalent: assistant text is
    // rewritten in the outgoing transcript instead, immediately before the
    // model request. Persisted and already-rendered text is untouched.
    //
    // The callback is registered for every request kind the 2.0.30 host
    // dispatches: the agent loop (`context`) plus the auxiliary compaction,
    // generate and title requests. Only assistant `text` parts and compaction
    // summaries are rewritten. The `title` request is a single `user` message
    // (wrapped as "Original request: … Recent conversation: …" when the
    // session has a custom title, the raw user text otherwise), so it matches
    // nothing here and the registration is inert; reasoning parts are
    // deliberately left raw.
    // `event.messages` is typed from the `context` hook, the superset shape.
    type TranscriptEvent = {
      messages: Parameters<Parameters<typeof ctx.session.hook<"context">>[1]>[0]["messages"];
    };

    const rewriteTranscript = (event: TranscriptEvent): void => {
      const { messages } = event;
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (!message) continue;
        // Defensive against a non-array `content` (title-event shapes vary):
        // a no-op here, not a thrown hook (which would fail the model request).
        if (!Array.isArray(message.content)) continue;

        let changed = false;
        const content = message.content.map((part) => {
          if (part.type === "compaction" && typeof part.text === "string") {
            const text = rewriter.rewrite(part.text);
            if (text !== part.text) {
              changed = true;
              return { ...part, text };
            }
          } else if (message.role === "assistant" && part.type === "text") {
            const text = rewriter.rewrite(part.text);
            if (text !== part.text) {
              changed = true;
              return { ...part, text };
            }
          }
          return part;
        });

        // Copy on write: a host may freeze the parts, and an already-ASCII
        // transcript needs no new structure at all. Preserve the Schema.Class
        // prototype — a plain spread would silently drop it, and downstream
        // hooks may rely on the class identity.
        if (changed) {
          messages[i] = Object.assign(Object.create(Object.getPrototypeOf(message)), message, {
            content,
          });
        }
      }
    };

    await ctx.session.hook("context", rewriteTranscript);
    await ctx.session.hook("compaction", rewriteTranscript);
    await ctx.session.hook("generate", rewriteTranscript);
    await ctx.session.hook("title", rewriteTranscript);

    // Substitutions only: `oldString` must keep matching the file, and the
    // `patch` tool's diffs must stay byte-identical. (The tool is named
    // `apply_patch` in V1 and `patch` in V2.)
    await ctx.tool.hook("execute.before", (event) => {
      if (event.input === null || typeof event.input !== "object") return;
      const args = event.input as Record<string, unknown>;
      if (event.tool === "write" && typeof args.content === "string") {
        args.content = rewriter.substitute(args.content);
      } else if (event.tool === "edit" && typeof args.newString === "string") {
        args.newString = rewriter.substitute(args.newString);
      }
    });

    // Results are replayed to the model, so stripping here is lossy past the
    // tool call; `metadata` is renderer state and is left alone.
    await ctx.tool.hook("execute.after", (event) => {
      if (event.status !== "completed") return;
      const result = event.result;
      let changed = false;
      const rewritten: Record<string, unknown> = { ...result };
      // `result.output` is the tool's declared structured value and is never
      // touched; in V2 the model-visible body is `result.content` (V1's
      // `output.output` display body maps to it).
      if (typeof result.content === "string") {
        // Defensive tolerance: the 2.0.30 host normalizes result.content to an
        // array before execute.after fires; a bare string is not a host path.
        const content = rewriter.rewrite(result.content);
        if (content !== result.content) {
          changed = true;
          rewritten.content = content;
        }
      } else if (Array.isArray(result.content)) {
        let contentChanged = false;
        const content = result.content.map((part) => {
          if (part.type === "text" && typeof part.text === "string") {
            const text = rewriter.rewrite(part.text);
            if (text !== part.text) {
              contentChanged = true;
              return { ...part, text };
            }
          }
          return part;
        });
        if (contentChanged) {
          changed = true;
          rewritten.content = content;
        }
      }
      // Only replace the result when a string actually changed: downstream
      // hooks must not see a new object identity for an untouched payload.
      if (changed) event.result = rewritten as typeof result;
    });
  },
});

export default AsciiPlugin;
