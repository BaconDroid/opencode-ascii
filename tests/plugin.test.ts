import { describe, it, expect } from "vitest";
import { AsciiPlugin, createRewriter, type AsciiPluginInput } from "../src/index";

type AnyHook = (event: any) => unknown;

/** Captures the hooks the plugin registers on a fake V2 context. */
async function setup(options?: AsciiPluginInput) {
  const hooks: Record<string, AnyHook> = {};
  const registration = { dispose: async () => {} };
  const ctx = {
    options: options ?? {},
    session: {
      hook: async (name: string, callback: AnyHook) => {
        hooks[name] = callback;
        return registration;
      },
    },
    tool: {
      hook: async (name: string, callback: AnyHook) => {
        hooks[name] = callback;
        return registration;
      },
    },
  };
  await AsciiPlugin.setup(ctx as never);
  return hooks;
}

const call = (tool: string) => ({ tool, sessionID: "s1", agent: "build", messageID: "m1", id: "c1", input: {} });

const contextEvent = (messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }>) => ({
  sessionID: "s1",
  model: { providerID: "p", id: "m" },
  system: [{ type: "text", text: "system" }],
  messages,
  options: {},
  agent: "build",
  tools: {},
});

async function text(hooks: Record<string, AnyHook>, before: string): Promise<string> {
  const message = { role: "assistant", content: [{ type: "text", text: before }] };
  const event = contextEvent([message]);
  await hooks.context(event);
  return event.messages[0].content[0].text as string;
}

// ---------------------------------------------------------------------------
// session.hook("context") — V2 replacement for experimental.text.complete
// ---------------------------------------------------------------------------

describe("session.hook('context')", () => {
  it("substitutes unicode and emoji in assistant text", async () => {
    const hooks = await setup();
    expect(await text(hooks, "The result ≠ 0 → flow. Deployed ✓")).toBe("The result = 0 > flow. Deployed v");
  });

  it("leaves plain ASCII untouched", async () => {
    const hooks = await setup();
    expect(await text(hooks, "hello -> world != foo")).toBe("hello -> world != foo");
  });

  it("honours the category flags", async () => {
    const hooks = await setup({ emojis: false, arrows: false });
    expect(await text(hooks, "dash — arrow → check ✓")).toBe("dash - arrow → check ✓");
  });

  it("rewrites assistant text parts only, never user or tool messages", async () => {
    const hooks = await setup();
    const user = { role: "user", content: [{ type: "text", text: "ask — nicely" }] };
    const tool = { role: "tool", content: [{ type: "text", text: "result — here" }] };
    const assistant = {
      role: "assistant",
      content: [
        { type: "reasoning", text: "thinking — quietly" },
        { type: "text", text: "answer — here" },
      ],
    };
    const event = contextEvent([user, assistant, tool]);
    await hooks.context(event);
    expect(event.messages[0]).toBe(user);
    expect(event.messages[2]).toBe(tool);
    expect(event.messages[1].content[0].text).toBe("thinking — quietly");
    expect(event.messages[1].content[1].text).toBe("answer - here");
  });

  it("registers the same callback for every request kind", async () => {
    const hooks = await setup();
    expect(hooks.context).toBeDefined();
    expect(hooks.compaction).toBe(hooks.context);
    expect(hooks.generate).toBe(hooks.context);
    expect(hooks.title).toBe(hooks.context);
  });

  it("leaves the title request unchanged: it is a user message with an Assistant: line", async () => {
    const hooks = await setup();
    // Sessions with a custom title wrap the title prompt as one user message
    // of this shape (absent title sends the raw user text); the assistant-text
    // filter must not match the quoted "Assistant:" line.
    const prompt = [
      "Original request:",
      "rename ≠ the file",
      "",
      "Recent conversation:",
      "User: hi — there",
      "Assistant: done → here",
    ].join("\n");
    const message = { role: "user", content: [{ type: "text", text: prompt }] };
    // Shape of the real SessionTitle event: one message, no assistant role.
    const event = { messages: [message] };
    await hooks.title(event);
    expect(event.messages[0]).toBe(message);
    expect(event.messages[0].content[0].text).toBe(prompt);
  });

  it("rewrites compaction content parts with a string summary", async () => {
    const hooks = await setup();
    const message = {
      role: "user",
      content: [
        { type: "compaction", provider: "p", text: "summary — ✓" },
        { type: "text", text: "keep — raw" },
      ],
    };
    const event = contextEvent([message]);
    await hooks.context(event);
    expect(event.messages[0].content[0].text).toBe("summary - v");
    expect(event.messages[0].content[1].text).toBe("keep — raw");
  });

  it("leaves a compaction part with a null summary unchanged", async () => {
    const hooks = await setup();
    const message = {
      role: "user",
      content: [
        { type: "compaction", provider: "p", text: null },
        { type: "text", text: "keep — raw" },
      ],
    } as never;
    const event = contextEvent([message]);
    await hooks.context(event);
    expect(event.messages[0].content[0].text).toBeNull();
    expect(event.messages[0].content[1].text).toBe("keep — raw");
  });

  it("leaves an already-ASCII transcript structurally untouched", async () => {
    const hooks = await setup();
    const content = [{ type: "text", text: "already ascii" }];
    const message = { role: "assistant", content };
    const messages = [message];
    await hooks.context(contextEvent(messages));
    expect(messages[0]).toBe(message);
    expect(message.content).toBe(content);
  });

  it("no-ops instead of throwing when a message content is not an array", async () => {
    const hooks = await setup();
    const message = { role: "assistant", content: "not an array" };
    const event = { messages: [message] } as never;
    expect(() => hooks.context(event)).not.toThrow();
    expect((event as { messages: unknown[] }).messages[0]).toBe(message);
  });

  it("preserves the Message class prototype when copying", async () => {
    const hooks = await setup();
    class Message {
      constructor(
        readonly role: string,
        readonly content: Array<{ type: string; text: string }>,
      ) {}
    }
    const message = new Message("assistant", [{ type: "text", text: "value ≠ 0" }]);
    const event = { messages: [message] } as never;
    await hooks.context(event);
    const next = (event as { messages: Array<{ content: Array<{ text: string }> }> }).messages[0];
    expect(next).not.toBe(message);
    expect(next).toBeInstanceOf(Message);
    expect(next.content[0].text).toBe("value = 0");
    // The non-destructive guarantee: the stored message keeps its characters.
    expect(message.content[0].text).toBe("value ≠ 0");
  });

  it("returns no hooks when every category is off and stripping is off", async () => {
    const hooks = await setup({
      punctuation: false, frames: false, shapes: false, arrows: false, math: false, emojis: false, stripNonLatin: false,
    });
    expect(hooks.context).toBeUndefined();
    expect(hooks.compaction).toBeUndefined();
    expect(hooks.generate).toBeUndefined();
    expect(hooks.title).toBeUndefined();
    expect(hooks["execute.before"]).toBeUndefined();
    expect(hooks["execute.after"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// tool.hook("execute.before")
// ---------------------------------------------------------------------------

describe("tool.hook('execute.before')", () => {
  it("rewrites write input.content but not path", async () => {
    const hooks = await setup();
    const event = call("write");
    event.input = { path: "/tmp/test—path.txt", content: "value ≠ 0 → result" } as never;
    await hooks["execute.before"](event);
    expect((event.input as { content: string }).content).toBe("value = 0 > result");
    expect((event.input as { path: string }).path).toBe("/tmp/test—path.txt");
  });

  it("rewrites edit input.newString but never oldString", async () => {
    const hooks = await setup();
    const event = call("edit");
    event.input = { oldString: "old — value", newString: "new — value" } as never;
    await hooks["execute.before"](event);
    expect((event.input as { newString: string }).newString).toBe("new - value");
    expect((event.input as { oldString: string }).oldString).toBe("old — value");
  });

  it("never rewrites patch payloads, diff lines and paths included", async () => {
    // V1 called this tool `apply_patch`; V2 (2.0.30) renamed it `patch`.
    const hooks = await setup({ stripNonLatin: true });
    const patchText = [
      "--- a/i18n/日本語.ts",
      "+++ b/i18n/日本語.ts",
      "@@ -1,2 +1,2 @@",
      ' console.log("hi — there");',
      '-const msg = "hello — 世界";',
      '+const msg = "hello — 世界!";',
    ].join("\n");
    const event = call("patch");
    event.input = { patchText } as never;
    await hooks["execute.before"](event);
    expect((event.input as { patchText: string }).patchText).toBe(patchText);
  });

  it("leaves unhandled tools alone", async () => {
    const hooks = await setup();
    const event = call("shell");
    event.input = { command: "echo —" } as never;
    await hooks["execute.before"](event);
    expect((event.input as { command: string }).command).toBe("echo —");
  });

  it("ignores null and non-object inputs", async () => {
    const hooks = await setup();
    const event = call("write");
    event.input = null as never;
    expect(() => hooks["execute.before"](event)).not.toThrow();
    event.input = "not an object" as never;
    expect(() => hooks["execute.before"](event)).not.toThrow();
    event.input = 42 as never;
    expect(() => hooks["execute.before"](event)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tool.hook("execute.after")
// ---------------------------------------------------------------------------

const completed = (output: unknown, content?: unknown) => ({
  ...call("read"),
  status: "completed",
  result: { output, content, metadata: {} },
});

describe("tool.hook('execute.after')", () => {
  // String result.content exercises the defensive branch only: the 2.0.30 host
  // normalizes content to an array before execute.after fires.
  it("rewrites the result content and leaves declared output untouched", async () => {
    const hooks = await setup();
    const event = completed("value ≠ 0 — done", "value ≠ 0 — done");
    await hooks["execute.after"](event);
    expect(event.result.output).toBe("value ≠ 0 — done");
    expect(event.result.content).toBe("value = 0 - done");
  });

  it("never mutates a structured result.output, even when its content is rewritten", async () => {
    for (const stripNonLatin of [false, true]) {
      const hooks = await setup({ stripNonLatin });
      const payload = { path: "/tmp/設計—.txt" };
      // The host serializes a missing content body from output into a text part;
      // that serialization is rewritten as text, the declared value is not.
      const event = completed(payload, [{ type: "text", text: "wrote /tmp/設計—.txt" }]);
      await hooks["execute.after"](event);
      expect(event.result.output).toBe(payload);
      expect(payload).toEqual({ path: "/tmp/設計—.txt" });
      expect((event.result.content as Array<{ text: string }>)[0].text).toBe(
        stripNonLatin ? "wrote /tmp/-.txt" : "wrote /tmp/設計-.txt",
      );
    }
  });

  it("rewrites text parts of a structured content array", async () => {
    const hooks = await setup();
    const event = completed(undefined, [
      { type: "text", text: "running → ls" },
      { type: "file", uri: "file:///tmp/設計—.txt", mime: "text/plain" },
    ]);
    await hooks["execute.after"](event);
    expect(event.result.content).toEqual([
      { type: "text", text: "running > ls" },
      { type: "file", uri: "file:///tmp/設計—.txt", mime: "text/plain" },
    ]);
  });

  it("strips scripts, emoji and fullwidth forms when stripNonLatin is on", async () => {
    const hooks = await setup({ stripNonLatin: true });
    const event = completed("deployed ✓ but 🧠 leaked ＡＢＣ", [
      { type: "text", text: "deployed ✓ but 🧠 leaked ＡＢＣ" },
    ]);
    await hooks["execute.after"](event);
    expect((event.result.content as Array<{ text: string }>)[0].text).toBe("deployed v but  leaked ");
    // The declared output value is never rewritten, only the model-visible content.
    expect(event.result.output).toBe("deployed ✓ but 🧠 leaked ＡＢＣ");
  });

  it("leaves output untouched by default", async () => {
    const hooks = await setup();
    const metadata = { path: "/tmp/日本語.md", truncated: false };
    const event = completed("これはテストです。");
    event.result.metadata = metadata;
    await hooks["execute.after"](event);
    expect(event.result.output).toBe("これはテストです。");
    expect(event.result.metadata).toBe(metadata);
  });

  it("keeps the original result object when nothing changes", async () => {
    const hooks = await setup();
    const result = { output: "already ascii", content: "already ascii", metadata: {} };
    const event = { ...call("read"), status: "completed", result };
    await hooks["execute.after"](event);
    expect(event.result).toBe(result);

    // The host path is an array of content parts; identity must hold there too.
    const arrayResult = { output: undefined, content: [{ type: "text", text: "already ascii" }], metadata: {} };
    const arrayEvent = { ...call("read"), status: "completed", result: arrayResult };
    await hooks["execute.after"](arrayEvent);
    expect(arrayEvent.result).toBe(arrayResult);
  });

  it("ignores failed calls", async () => {
    const hooks = await setup({ stripNonLatin: true });
    const event = { ...call("shell"), status: "error", error: { message: "bad — 世界" } };
    await hooks["execute.after"](event);
    expect(event.error.message).toBe("bad — 世界");
  });
});

// ---------------------------------------------------------------------------
// stripNonLatin scope: AI text and tool results only, never file payloads
// ---------------------------------------------------------------------------

describe("stripNonLatin scope", () => {
  it("registers hooks when only stripNonLatin is enabled", async () => {
    const hooks = await setup({ stripNonLatin: true });
    expect(hooks.context).toBeDefined();
    expect(hooks.compaction).toBeDefined();
    expect(hooks.generate).toBeDefined();
    expect(hooks.title).toBeDefined();
    expect(hooks["execute.before"]).toBeDefined();
    expect(hooks["execute.after"]).toBeDefined();
  });

  it("strips when every substitution category is off", async () => {
    const hooks = await setup({
      punctuation: false, frames: false, shapes: false, arrows: false, math: false, emojis: false, stripNonLatin: true,
    });
    expect(await text(hooks, "plain ✓ 世界")).toBe("plain  ");
  });

  it("strips after substitution in AI text", async () => {
    const hooks = await setup({ stripNonLatin: true });
    expect(await text(hooks, "launch ✓ to 世界")).toBe("launch v to ");
  });

  it("never strips write/edit payloads, only substitutes them", async () => {
    const hooks = await setup({ stripNonLatin: true });
    const write = call("write");
    write.input = { path: "/tmp/i18n/ja.md", content: "これは — テスト" } as never;
    await hooks["execute.before"](write);
    expect((write.input as { content: string }).content).toBe("これは - テスト");

    const edit = call("edit");
    edit.input = { oldString: "新", newString: "新 — 内容" } as never;
    await hooks["execute.before"](edit);
    expect((edit.input as { newString: string }).newString).toBe("新 - 内容");
    expect((edit.input as { oldString: string }).oldString).toBe("新");
  });
});

// ---------------------------------------------------------------------------
// createRewriter — the transform itself, without a host
// ---------------------------------------------------------------------------

describe("createRewriter", () => {
  it("maps the documented sample characters", () => {
    const rewriter = createRewriter();
    expect(rewriter.rewrite("a—b–c→d… “quoted”")).toBe('a-b-c>d... "quoted"');
  });

  it("substitute leaves non-Latin scripts in place while rewrite strips them", () => {
    const rewriter = createRewriter({ stripNonLatin: true });
    expect(rewriter.substitute("設計 — ✓")).toBe("設計 - v");
    expect(rewriter.rewrite("設計 — ✓")).toBe(" - v");
  });

  it("reports when nothing is enabled", () => {
    expect(createRewriter({ punctuation: false, frames: false, shapes: false, arrows: false, math: false, emojis: false }).enabled).toBe(false);
    expect(createRewriter({ stripNonLatin: true }).enabled).toBe(true);
  });
});
