import { describe, it, expect } from "vitest";
// The root shim is what OpenCode actually loads for a local directory plugin.
// Keep this import pointed at `index.js`, not `src/`: a broken shim must fail
// the suite even while every source-level test stays green.
import Plugin, { AsciiPlugin, createRewriter } from "../index.js";
import DistPlugin, { AsciiPlugin as DistAsciiPlugin } from "../dist/index.js";

type AnyHook = (event: any) => unknown;

describe("root index.js entrypoint", () => {
  it("re-exports the V2 plugin with an id and setup", () => {
    expect(Plugin).toBe(AsciiPlugin);
    expect(Plugin.id).toBe("opencode-ascii");
    expect(typeof Plugin.setup).toBe("function");
    expect(typeof createRewriter).toBe("function");
  });

  it("drives a context hook through the real registration path", async () => {
    const hooks: Record<string, AnyHook> = {};
    const registration = { dispose: async () => {} };
    const ctx = {
      options: {},
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

    await Plugin.setup(ctx as never);

    const message = { role: "assistant", content: [{ type: "text", text: "root ≠ entry" }] };
    const event = { messages: [message] };
    await hooks.context(event);
    expect(event.messages[0].content[0].text).toBe("root = entry");
  });
});

describe("dist/index.js entrypoint", () => {
  it("ships the plugin shape a published install resolves", () => {
    expect(DistPlugin).toBe(DistAsciiPlugin);
    expect(DistPlugin.id).toBe("opencode-ascii");
    expect(typeof DistPlugin.setup).toBe("function");
  });
});
