import { defineConfig } from "@playwright/test";
const baseURL = "http://127.0.0.1:" + (process.env.PORT || 4173);
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL,
    channel: process.env.CI ? undefined : "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
  },
});
