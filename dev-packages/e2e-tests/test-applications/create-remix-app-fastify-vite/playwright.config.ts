import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';
import 'dotenv/config';

const PORT = Number(process.env.PORT || '3030');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './tests',
  /* Maximum time one test can run for. */
  timeout: 150_000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000,
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'list',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 5_000,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${PORT}`,
  },

  /* Configure projects for major browsers */
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/, teardown: "teardown" },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ["setup"]
    },
    { name: "teardown", testMatch: /global\.teardown\.ts/},
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: `PORT=${PORT} pnpm dev:events`,
      port: PORT,
    },
  ],
};

export default config;
