import { describe, it, expect } from "vitest";
import { AsciiPlugin } from "../src/index";
import type { PluginInput, PluginOptions, Hooks } from "@opencode-ai/plugin";

// Minimal stub satisfying the PluginInput type shape used by AsciiPlugin
// (we only need it to not throw; AsciiPlugin ignores _ctx entirely).
const stubInput = {} as unknown as PluginInput;

async function makeHooks(options?: PluginOptions): Promise<Hooks> {
  return AsciiPlugin(stubInput, options);
}

// ---------------------------------------------------------------------------
// experimental.text.complete hook
// ---------------------------------------------------------------------------

describe("experimental.text.complete hook", () => {
  it("substitutes unicode in AI text output", async () => {
    const hooks = await makeHooks();
    const output = {
      text: "The result is ≠ 0 and we use → to indicate flow.",
    };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe(
      "The result is = 0 and we use > to indicate flow.",
    );
  });

  it("substitutes emoji in AI text output", async () => {
    const hooks = await makeHooks();
    const output = { text: "Deployed ✓ successfully!" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("Deployed v successfully!");
  });

  it("leaves plain ASCII unchanged", async () => {
    const hooks = await makeHooks();
    const output = { text: "hello -> world != foo" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("hello -> world != foo");
  });

  it("skips substitution when emojis disabled", async () => {
    const hooks = await makeHooks({ emojis: false });
    const output = { text: "rocket 🚀 and dash —" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("rocket 🚀 and dash -"); // emoji kept, dash replaced
  });
});

// ---------------------------------------------------------------------------
// tool.execute.before hook -- write tool
// ---------------------------------------------------------------------------

describe("tool.execute.before: write", () => {
  const baseInput = { tool: "write", sessionID: "s1", callID: "c1" };

  it("substitutes unicode in args.content", async () => {
    const hooks = await makeHooks();
    const output = {
      args: {
        filePath: "/tmp/test.txt",
        content: "value ≠ 0 → result",
      },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.content).toBe("value = 0 > result");
  });

  it("substitutes emoji in args.content", async () => {
    const hooks = await makeHooks();
    const output = {
      args: { filePath: "/tmp/test.txt", content: "launch ✓ ready" },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.content).toBe("launch v ready");
  });

  it("does not modify filePath", async () => {
    const hooks = await makeHooks();
    const output = {
      args: { filePath: "/tmp/test—path.txt", content: "hello" },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    // filePath should NOT be touched
    expect(output.args.filePath).toBe("/tmp/test—path.txt");
  });
});

// ---------------------------------------------------------------------------
// tool.execute.before hook -- edit tool
// ---------------------------------------------------------------------------

describe("tool.execute.before: edit", () => {
  const baseInput = { tool: "edit", sessionID: "s1", callID: "c1" };

  it("substitutes unicode in args.newString only", async () => {
    const hooks = await makeHooks();
    const output = {
      args: {
        filePath: "/tmp/test.txt",
        oldString: "old — value", // must NOT be changed (must match file)
        newString: "new — value",
      },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.newString).toBe("new - value");
    expect(output.args.oldString).toBe("old — value"); // unchanged
  });

  it("substitutes emoji in args.newString", async () => {
    const hooks = await makeHooks();
    const output = {
      args: {
        filePath: "/tmp/f.txt",
        oldString: "x",
        newString: "check ✓",
      },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.newString).toBe("check v");
  });
});

// ---------------------------------------------------------------------------
// tool.execute.before hook -- apply_patch tool (INTENTIONALLY NOT HANDLED)
// ---------------------------------------------------------------------------

describe("tool.execute.before: apply_patch", () => {
  const baseInput = { tool: "apply_patch", sessionID: "s1", callID: "c1" };

  it("passes args.patchText through COMPLETELY UNCHANGED", async () => {
    // apply_patch payloads are machine-parsed unified diffs. The plugin used
    // to substitute inside them, which corrupted the diff and made patches
    // fail to apply. patchText must now be left byte-for-byte alone.
    const hooks = await makeHooks();
    const patchText =
      "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new → value";
    const output = { args: { patchText } };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.patchText).toBe(patchText);
  });

  it("leaves a `-` removal line and context line byte-identical (regression)", async () => {
    // Reproduces the reported bug:
    //   file on disk   : console.log("hello — world");
    //   patch `-` line : -  console.log("hello — world");
    //   after plugin   : -  console.log("hello - world");  <- no longer matches
    // The removal/context lines must match the target file byte for byte, so
    // the em dash must survive verbatim even with DEFAULT options.
    const hooks = await makeHooks();
    const patchText = [
      "--- a/greet.js",
      "+++ b/greet.js",
      "@@ -1,3 +1,3 @@",
      ' console.log("hi — there");',
      '-  console.log("hello — world");',
      '+  console.log("hello — world!");',
    ].join("\n");
    const output = { args: { patchText } };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.patchText).toBe(patchText);
    expect(output.args.patchText).toContain('-  console.log("hello — world");');
  });

  it("leaves a non-Latin diff header path byte-identical", async () => {
    // The `---`/`+++` header lines name the target file. Rewriting them would
    // point the patch at a different (or non-existent) path.
    const hooks = await makeHooks();
    const patchText = [
      "--- a/i18n/日本語.ts",
      "+++ b/i18n/日本語.ts",
      "@@ -1 +1 @@",
      "-const msg = 'привет';",
      "+const msg = 'привет!';",
    ].join("\n");
    const output = { args: { patchText } };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.patchText).toBe(patchText);
    expect(output.args.patchText).toContain("--- a/i18n/日本語.ts");
  });

  it("still leaves args.patchText unchanged with stripNonLatin: true", async () => {
    // Stripping must not reach patch payloads either: the target path and the
    // removal/context lines have to match the file exactly.
    const hooks = await makeHooks({ stripNonLatin: true });
    const patchText = [
      "--- a/doc.md",
      "+++ b/doc.md",
      "@@ -1 +1 @@",
      "-新内容",
      "+新内容 → value",
    ].join("\n");
    const output = { args: { patchText } };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.patchText).toBe(patchText);
  });
});

// ---------------------------------------------------------------------------
// Unhandled tools -- hook is a no-op for unknown tool IDs
// ---------------------------------------------------------------------------

describe("tool.execute.before: unhandled tools", () => {
  it("does nothing for bash tool", async () => {
    const hooks = await makeHooks();
    const output = { args: { command: "echo —" } };
    await hooks["tool.execute.before"]?.(
      { tool: "bash", sessionID: "s1", callID: "c1" },
      output,
    );
    expect(output.args.command).toBe("echo —"); // unchanged
  });

  it("does nothing for read tool", async () => {
    const hooks = await makeHooks();
    const output = { args: { filePath: "/tmp/file —.txt" } };
    await hooks["tool.execute.before"]?.(
      { tool: "read", sessionID: "s1", callID: "c1" },
      output,
    );
    expect(output.args.filePath).toBe("/tmp/file —.txt"); // unchanged
  });
});

// ---------------------------------------------------------------------------
// tool.execute.after hook -- tool results (bash, read, grep, web, MCP)
// ---------------------------------------------------------------------------

describe("tool.execute.after", () => {
  const baseInput = { tool: "bash", sessionID: "s1", callID: "c1", args: {} };

  it("substitutes unicode in output.output and output.title", async () => {
    const hooks = await makeHooks();
    const output = {
      title: "running → ls",
      output: "value ≠ 0 — done",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(baseInput, output);
    expect(output.title).toBe("running > ls");
    expect(output.output).toBe("value = 0 - done");
  });

  it("strips CJK from a bash result when stripNonLatin is enabled", async () => {
    // This is the reported bug: `ls` / `cat` output reached the TUI with raw
    // CJK because no other hook touches tool results.
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = {
      title: "read docs/設計.md",
      output: "これはテストです。\nREADME ok",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(baseInput, output);
    expect(output.output).toBe("\nREADME ok");
    expect(output.title).toBe("read docs/.md");
  });

  it("strips CJK punctuation from a bash result", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = {
      title: "grep",
      output: "foo、bar。「baz」",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(baseInput, output);
    expect(output.output).toBe("foobarbaz");
  });

  it("strips unmapped emoji from a tool result, keeps mapped ones as ASCII", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = {
      title: "build",
      output: "deployed ✓ but 🧠 leaked",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(baseInput, output);
    // ✓ is mapped -> ASCII survives; 🧠 is unmapped -> stripped.
    expect(output.output).toBe("deployed v but  leaked");
  });

  it("deletes fullwidth forms in a tool result", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = { title: "ok", output: "ＡＢＣ １２３", metadata: {} };
    await hooks["tool.execute.after"]?.(baseInput, output);
    // The fullwidth/halfwidth block is out of scope and deleted; the ASCII
    // space between the two runs survives.
    expect(output.output).toBe(" ");
  });

  it("strips CJK from a read tool result", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const input = { tool: "read", sessionID: "s1", callID: "c1", args: {} };
    const output = {
      title: "read /tmp/日本語.txt",
      output: "const msg = 'привет';",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(input, output);
    expect(output.output).toBe("const msg = '';");
    expect(output.title).toBe("read /tmp/.txt");
  });

  it("leaves output untouched by default (stripNonLatin off)", async () => {
    const hooks = await makeHooks();
    const output = {
      title: "read docs/設計.md",
      output: "これはテストです。",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(baseInput, output);
    expect(output.output).toBe("これはテストです。");
    expect(output.title).toBe("read docs/設計.md");
  });

  it("leaves metadata untouched", async () => {
    // metadata is structured data the TUI consumes; rewriting it is not safe
    // and buys nothing on screen.
    const hooks = await makeHooks({ stripNonLatin: true });
    const metadata = { path: "/tmp/日本語.md", truncated: false };
    const output = { title: "t", output: "ok", metadata };
    await hooks["tool.execute.after"]?.(baseInput, output);
    expect(output.metadata).toBe(metadata);
    expect(output.metadata).toEqual({
      path: "/tmp/日本語.md",
      truncated: false,
    });
  });

  it("tolerates a missing or non-string title/output", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = { title: undefined, output: 42, metadata: {} } as never;
    await expect(
      hooks["tool.execute.after"]?.(baseInput, output),
    ).resolves.toBeUndefined();
  });

  it("strips shortcode-only emoji from a tool result", async () => {
    // These all mapped to a :shortcode: upstream; with those targets dropped
    // they are unmapped and the strip deletes them. ✓ still maps to ASCII.
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = {
      title: "ship ✓",
      output: "look ✓ aim ✨ key 🔑 pin 📌 search 🔍 new 🆕 at ⏰",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(
      { tool: "bash", sessionID: "s1", callID: "c1", args: {} },
      output,
    );
    expect(output.title).toBe("ship v");
    expect(output.output).toBe("look v aim  key  pin  search  new  at ");
  });

  it("keeps ASCII-art frames intact in a tool result", async () => {
    // The worst case found by the audit: a CI status line whose corners were
    // deleted read as "CI ---- passed", asserting the opposite of the truth.
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = {
      title: "build",
      output: "┌────┐\n│ CI │\n└────┘\nstatus ● on ○ off",
      metadata: {},
    };
    await hooks["tool.execute.after"]?.(
      { tool: "bash", sessionID: "s1", callID: "c1", args: {} },
      output,
    );
    expect(output.output).toBe("+----+\n| CI |\n+----+\nstatus * on * off");
  });

  it("registers when only stripNonLatin is enabled", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    expect(hooks["tool.execute.after"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-hook invariant: stripping never reaches file payloads
// ---------------------------------------------------------------------------

describe("stripNonLatin never touches write/edit/apply_patch payloads", () => {
  it("leaves write args.content intact with stripNonLatin enabled", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = {
      args: { filePath: "/tmp/i18n/ja.md", content: "これは — テスト" },
    };
    await hooks["tool.execute.before"]?.(
      { tool: "write", sessionID: "s1", callID: "c1" },
      output,
    );
    // The em dash is substituted, the CJK survives: file content is never
    // stripped, and the tool.execute.after hook does not reach args at all.
    expect(output.args.content).toBe("これは - テスト");
    expect(output.args.filePath).toBe("/tmp/i18n/ja.md");
  });

  it("leaves edit args intact with stripNonLatin enabled", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = {
      args: { filePath: "/tmp/ja.txt", oldString: "新", newString: "新 — 内容" },
    };
    await hooks["tool.execute.before"]?.(
      { tool: "edit", sessionID: "s1", callID: "c1" },
      output,
    );
    expect(output.args.newString).toBe("新 - 内容");
    expect(output.args.oldString).toBe("新");
  });

  it("leaves apply_patch args.patchText intact with stripNonLatin enabled", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const patchText = [
      "--- a/i18n/日本語.ts",
      "+++ b/i18n/日本語.ts",
      "@@ -1 +1 @@",
      "-const msg = 'привет';",
      "+const msg = 'привет!';",
    ].join("\n");
    const output = { args: { patchText } };
    await hooks["tool.execute.before"]?.(
      { tool: "apply_patch", sessionID: "s1", callID: "c1" },
      output,
    );
    expect(output.args.patchText).toBe(patchText);
  });
});

// ---------------------------------------------------------------------------
// Plugin options -- categories disabled
// ---------------------------------------------------------------------------

describe("plugin options", () => {
  it("returns empty hooks when all categories disabled", async () => {
    const hooks = await makeHooks({
      punctuation: false,
      frames: false,
      shapes: false,
      arrows: false,
      math: false,
      emojis: false,
    });
    // Hooks should be empty (no keys registered)
    expect(hooks["experimental.text.complete"]).toBeUndefined();
    expect(hooks["tool.execute.before"]).toBeUndefined();
    expect(hooks["tool.execute.after"]).toBeUndefined();
  });

  it("only applies enabled categories", async () => {
    const hooks = await makeHooks({
      punctuation: true,
      arrows: false,
      math: false,
      emojis: false,
    });
    const output = { text: "dash — arrow → not-equal ≠" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    // Only punctuation substituted; arrows and math left alone
    expect(output.text).toBe("dash - arrow → not-equal ≠");
  });

  it("isolates frames and shapes through the text hook", async () => {
    // frames:false + shapes:false leaves frames and shapes raw while
    // punctuation still substitutes (measured against the compiled build).
    const hooks = await makeHooks({ frames: false, shapes: false });
    const output = { text: "box ┌─┐ ball ● dash —" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("box ┌─┐ ball ● dash -");
  });

  it("registers hooks when only frames is disabled", async () => {
    // One category off still leaves five on, so the hooks register.
    const hooks = await makeHooks({ frames: false });
    expect(hooks["experimental.text.complete"]).toBeDefined();
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
  });

  it("registers hooks when only shapes is disabled", async () => {
    const hooks = await makeHooks({ shapes: false });
    expect(hooks["experimental.text.complete"]).toBeDefined();
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Plugin options -- stripNonLatin (opt-in, AI TEXT RESPONSES ONLY, applied
// AFTER substitution; never applied to file write/edit/patch arguments)
// ---------------------------------------------------------------------------

describe("stripNonLatin option", () => {
  it("strips non-Latin scripts from AI text output", async () => {
    const hooks = await makeHooks({
      punctuation: false,
      arrows: false,
      math: false,
      emojis: false,
      stripNonLatin: true,
    });
    const output = { text: "hello 世界 world Привет" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("hello  world ");
  });

  it("registers hooks when only stripNonLatin is enabled", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    expect(hooks["experimental.text.complete"]).toBeDefined();
    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
  });

  it("applies substitution before stripping (mapped emoji become ASCII)", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const output = { text: "launch ✓ to 世界" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("launch v to ");
  });

  it("leaves non-Latin text untouched by default (backward compatible)", async () => {
    const hooks = await makeHooks();
    const output = { text: "hello 世界 world" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("hello 世界 world");
  });

  it("does NOT strip non-Latin scripts from write tool content (text-only scope)", async () => {
    // stripNonLatin is deliberately scoped to AI text responses. Stripping
    // file content would be irreversible data loss, so write args keep
    // their non-Latin characters even when the option is enabled.
    const hooks = await makeHooks({
      punctuation: false,
      arrows: false,
      math: false,
      emojis: false,
      stripNonLatin: true,
    });
    const baseInput = { tool: "write", sessionID: "s1", callID: "c1" };
    const output = { args: { filePath: "/tmp/a.txt", content: "ok 日本語 ok" } };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.content).toBe("ok 日本語 ok");
    expect(output.args.filePath).toBe("/tmp/a.txt");
  });

  it("still substitutes punctuation in write content while stripping is enabled", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const baseInput = { tool: "write", sessionID: "s1", callID: "c1" };
    const output = {
      args: { filePath: "/tmp/b.txt", content: "dash — 日本語" },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    // Em dash substituted, CJK preserved.
    expect(output.args.content).toBe("dash - 日本語");
  });

  it("does NOT strip non-Latin scripts from edit args.newString", async () => {
    const hooks = await makeHooks({ stripNonLatin: true });
    const baseInput = { tool: "edit", sessionID: "s1", callID: "c1" };
    const output = {
      args: {
        filePath: "/tmp/c.txt",
        oldString: "старый",
        newString: "новый — текст",
      },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.newString).toBe("новый - текст");
    expect(output.args.oldString).toBe("старый");
  });

  it("returns empty hooks when all categories disabled and stripNonLatin is off", async () => {
    const hooks = await makeHooks({
      punctuation: false,
      frames: false,
      shapes: false,
      arrows: false,
      math: false,
      emojis: false,
      stripNonLatin: false,
    });
    expect(hooks["experimental.text.complete"]).toBeUndefined();
    expect(hooks["tool.execute.before"]).toBeUndefined();
    expect(hooks["tool.execute.after"]).toBeUndefined();
  });
});
