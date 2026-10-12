import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "cloudflare:workers": fileURLToPath(new URL("./test/stubs/cloudflare-workers.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Structured request logs are expected; keep test output readable.
    onConsoleLog: (log) => !log.startsWith('{"t":'),
  },
});
