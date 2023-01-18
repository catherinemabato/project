import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getReplaySnapshot, waitForReplayRequest } from '../../../utils/replayHelpers';

sentryTest('should stop recording after receiving an error response', async ({ getLocalTestPath, page }) => {
  // Currently bundle tests are not supported for replay
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_es5')) {
    sentryTest.skip();
  }

  let called = 0;

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    called++;

    return route.fulfill({
      status: 400,
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);

  await waitForReplayRequest(page);
  await page.click('button');

  expect(called).toBe(1);

  // Should immediately skip retrying and just cancel, no backoff
  // This waitForTimeout call should be okay, as we're not checking for any
  // further network requests afterwards.
  await page.waitForTimeout(5001);

  expect(called).toBe(1);

  const replay = await getReplaySnapshot(page);

  // @ts-ignore private API
  expect(replay._isEnabled).toBe(false);
});
