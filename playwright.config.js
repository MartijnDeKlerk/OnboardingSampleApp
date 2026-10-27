// @ts-check
const { defineConfig, devices } = require('@playwright/test');
// E2E runs against its own stack (API 3101, client 5174) so test customers never
// show up in the app you're using on 3001/5173. Set BASE_URL to target another stack.
const E2E_API_PORT = 3101;
const E2E_CLIENT_PORT = 5174;
const baseURL = process.env.BASE_URL || `http://localhost:${E2E_CLIENT_PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  webServer: process.env.BASE_URL ? undefined : [
    {
      command: 'node src/index.js',
      cwd: './server',
      env: { PORT: String(E2E_API_PORT) },
      url: `http://localhost:${E2E_API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
    },
    {
      command: `npx vite --port ${E2E_CLIENT_PORT} --strictPort`,
      cwd: './client',
      env: { API_PROXY_TARGET: `http://localhost:${E2E_API_PORT}` },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
