import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the DEMO build served by `vite preview`.
 * The demo uses only fictional, in-memory data.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 14"] } },
    { name: "desktop chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build:demo && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
