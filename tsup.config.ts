import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    platform: "node",
    target: "node18",
    clean: true,
  },
  {
    entry: { index: "index.ts" },
    format: ["esm"],
    platform: "node",
    target: "node18",
    dts: true,
    clean: false,
  },
]);
