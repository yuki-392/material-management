import { defineConfig } from "@playwright/test";

const appDirectory = process.env.E2E_APP_DIRECTORY;
if (!appDirectory || !process.env.E2E_SESSION) {
  throw new Error("npm run test:e2e でテスト環境を起動してください。");
}

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  workers: 1,
  reporter: "list",
  outputDir: `${appDirectory}/test-results`,
  use: { baseURL, browserName: "chromium" },
  projects: [
    { name: "PC", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "スマホ",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      grepInvert: /@desktop/,
    },
  ],
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3100",
    cwd: appDirectory,
    url: `${baseURL}/login/error`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    stderr: "pipe",
  },
});
