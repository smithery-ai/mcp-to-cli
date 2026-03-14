import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  banner: { js: "#!/usr/bin/env node" },
  platform: "node",
  target: "node18",
  clean: true,
});
