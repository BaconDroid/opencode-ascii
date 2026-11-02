// Directory entrypoint for V2 local installs. OpenCode loads this file when a
// plugin is configured as a directory; published packages still resolve
// `dist/index.js` through the `exports` map in package.json. Rebuild (`npm run
// build`) after editing `src/`, because this shim serves the built output.
export { AsciiPlugin, createRewriter } from "./dist/index.js";
export { default } from "./dist/index.js";
