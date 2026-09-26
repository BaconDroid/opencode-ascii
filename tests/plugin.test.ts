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
      "The result is != 0 and we use -> to indicate flow.",
    );
  });

  it("substitutes emoji in AI text output", async () => {
    const hooks = await makeHooks();
    const output = { text: "Deployed 🚀 successfully!" };
    await hooks["experimental.text.complete"]?.(
      { sessionID: "s1", messageID: "m1", partID: "p1" },
      output,
    );
    expect(output.text).toBe("Deployed :rocket: successfully!");
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
    expect(output.args.content).toBe("value != 0 -> result");
  });

  it("substitutes emoji in args.content", async () => {
    const hooks = await makeHooks();
    const output = {
      args: { filePath: "/tmp/test.txt", content: "launch 🚀 ready" },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.content).toBe("launch :rocket: ready");
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
        newString: "fire 🔥",
      },
    };
    await hooks["tool.execute.before"]?.(baseInput, output);
    expect(output.args.newString).toBe("fire :fire:");
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
// Plugin options -- categories disabled
// ---------------------------------------------------------------------------

describe("plugin options", () => {
  it("returns empty hooks when all categories disabled", async () => {
    const hooks = await makeHooks({
      punctuation: false,
      arrows: false,
      math: false,
      emojis: false,
    });
    // Hooks should be empty (no keys registered)
    expect(hooks["experimental.text.complete"]).toBeUndefined();
    expect(hooks["tool.execute.before"]).toBeUndefined();
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
});
