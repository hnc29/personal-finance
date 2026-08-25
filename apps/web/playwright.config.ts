import { defineConfig, devices } from "@playwright/test";

// QA E2E suite (see docs/qa/QA_STATE.md). Servers (backend on :8010 against
// data/finance.test.db, frontend on :3010) are started/stopped by the QA
// runner script, not by Playwright's webServer, so the same test DB can be
// reset between full runs without coupling to Playwright's lifecycle.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
