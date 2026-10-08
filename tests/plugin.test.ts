import { describe, it, expect } from "vitest";
import { AsciiPlugin } from "../src/index";
import type { PluginInput, PluginOptions, Hooks } from "@opencode-ai/plugin";

const stubInput = {} as unknown as PluginInput;
const call = (tool: string) => ({ tool, sessionID: "s1", callID: "c1", args: {} });

const makeHooks = (options?: PluginOptions): Promise<Hooks> => AsciiPlugin(stubInput, options);

async function text(hooks: Hooks, before: string): Promise<string> {
  const output = { text: before };
  await hooks["experimental.text.complete"]?.({ sessionID: "s1", messageID: "m1", partID: "p1" }, output);
  return output.text;
}

// ---------------------------------------------------------------------------
// experimental.text.complete
// ---------------------------------------------------------------------------

describe("experimental.text.complete", () => {
  it("substitutes unicode and emoji in AI text", async () => {
    const hooks = await makeHooks();
    expect(await text(hooks, "The result ≠ 0 → flow. Deployed ✓")).toBe("The result = 0 > flow. Deployed v");
  });

  it("leaves plain ASCII untouched", async () => {
    const hooks = await makeHooks();
    expect(await text(hooks, "hello -> world != foo")).toBe("hello -> world != foo");
  });

  it("honours the category flags", async () => {
    const hooks = await makeHooks({ emojis: false, arrows: false });
    expect(await text(hooks, "dash — arrow → check ✓")).toBe("dash - arrow → check ✓");
  });

  it("returns no hooks when every category is off and stripping is off", async () => {
    const hooks = await makeHooks({
      punctuation: false, frames: false, shapes: false, arrows: false, math: false, emojis: false, stripNonLatin: false,
    });
    expect(hooks["experimental.text.complete"]).toBeUndefined();
    expect(hooks["tool.execute.before"]).toBeUndefined();
    expect(hooks["tool.execute.after"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// tool.execute.before
// ---------------------------------------------------------------------------

describe("tool.execute.before", () => {
  it("rewrites write args.content but not filePath", async () => {
    const hooks = await makeHooks();
    const output = { args: { filePath: "/tmp/test—path.txt", content: "value ≠ 0 → result" } };
    await hooks["tool.execute.before"]?.(call("write"), output);
    expect(output.args.content).toBe("value = 0 > result");
    expect(output.args.filePath).toBe("/tmp/test—path.txt");
  });

  it("rewrites edit args.newString but never oldString", async () => {
    const hooks = await makeHooks();
    const output = { args: { oldString: "old — value", newString: "new — value" } };
    await hooks["tool.execute.before"]?.(call("edit"), output);
    expect(output.args.newString).toBe("new - value");
    expect(output.args.oldString).toBe("old — value");
  });

  it("never rewrites apply_patch payloads, diff lines and paths included", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const patchText = [
      "--- a/i18n/日本語.ts",
      "+++ b/i18n/日本語.ts",
      "@@ -1,2 +1,2 @@",
      ' console.log("hi — there");',
      '-const msg = "hello — 世界";',
      '+const msg = "hello — 世界!";',
    ].join("\n");
    const output = { args: { patchText } };
    await hooks["tool.execute.before"]?.(call("apply_patch"), output);
    expect(output.args.patchText).toBe(patchText);
  });

  it("leaves unhandled tools alone", async () => {
    const hooks = await makeHooks();
    const output = { args: { command: "echo —" } };
    await hooks["tool.execute.before"]?.(call("bash"), output);
    expect(output.args.command).toBe("echo —");
  });
});

// ---------------------------------------------------------------------------
// tool.execute.after
// ---------------------------------------------------------------------------

describe("tool.execute.after", () => {
  it("rewrites the rendered title and output", async () => {
    const hooks = await makeHooks();
    const output = { title: "running → ls", output: "value ≠ 0 — done", metadata: {} };
    await hooks["tool.execute.after"]?.(call("bash"), output);
    expect(output.title).toBe("running > ls");
    expect(output.output).toBe("value = 0 - done");
  });

  it("strips scripts, emoji and fullwidth forms when stripNonLatin is on", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = { title: "read docs/設計.md", output: "deployed ✓ but 🧠 leaked ＡＢＣ", metadata: {} };
    await hooks["tool.execute.after"]?.(call("read"), output);
    expect(output.title).toBe("read docs/.md");
    expect(output.output).toBe("deployed v but  leaked ");
  });

  it("leaves output and metadata untouched by default", async () => {
    const hooks = await makeHooks();
    const metadata = { path: "/tmp/日本語.md", truncated: false };
    const output = { title: "read docs/設計.md", output: "これはテストです。", metadata };
    await hooks["tool.execute.after"]?.(call("read"), output);
    expect(output.title).toBe("read docs/設計.md");
    expect(output.output).toBe("これはテストです。");
    expect(output.metadata).toBe(metadata);
  });

  it("tolerates a missing or non-string title/output", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = { title: undefined, output: 42, metadata: {} } as never;
    await expect(hooks["tool.execute.after"]?.(call("bash"), output)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// stripNonLatin scope: AI text and tool results only, never file payloads
// ---------------------------------------------------------------------------

describe("stripNonLatin scope", () => {
  it("registers hooks when only stripNonLatin is enabled", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    expect(hooks["experimental.text.complete"]).toBeDefined();
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
  });

  it("strips after substitution in AI text", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    expect(await text(hooks, "launch ✓ to 世界")).toBe("launch v to ");
  });

  it("never strips write/edit payloads, only substitutes them", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const write = { args: { filePath: "/tmp/i18n/ja.md", content: "これは — テスト" } };
    await hooks["tool.execute.before"]?.(call("write"), write);
    expect(write.args.content).toBe("これは - テスト");

    const edit = { args: { oldString: "新", newString: "新 — 内容" } };
    await hooks["tool.execute.before"]?.(call("edit"), edit);
    expect(edit.args.newString).toBe("新 - 内容");
    expect(edit.args.oldString).toBe("新");
  });
});
