import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Structured request logs are expected; keep test output readable.
    onConsoleLog: (log) => !log.startsWith('{"t":'),
  },
});
