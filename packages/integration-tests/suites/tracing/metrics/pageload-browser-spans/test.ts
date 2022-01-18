import { expect } from '@playwright/test';
import { sentryTest } from '@utils/fixtures';
import { getSentryTransactionRequest } from '@utils/helpers';

sentryTest('should add browser-related spans to pageload transaction', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryTransactionRequest(page, url);
  const browserSpans = eventData.spans?.filter(({ op }) => op === 'browser');

  // Spans `connect`, `cache` and `DNS` are not always inside `pageload` transaction.
  expect(browserSpans?.length).toBeGreaterThanOrEqual(4);

  ['domContentLoadedEvent', 'loadEvent', 'request', 'response'].forEach(eventDesc =>
    expect(browserSpans).toContainEqual(
      expect.objectContaining({
        description: eventDesc,
        parent_span_id: eventData.contexts?.trace.span_id,
      }),
    ),
  );
});
