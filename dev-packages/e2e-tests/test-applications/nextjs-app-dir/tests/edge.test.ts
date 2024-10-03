import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Should record exceptions for faulty edge server components', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Server Component Error';
  });

  await page.goto('/edge-server-components/error');

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toBeDefined();

  // Assert that isolation scope works properly
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  expect(errorEvent.transaction).toBe(`Page Server Component (/edge-server-components/error)`);
});

test.only('Should record transaction for edge server components', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    console.log('t', transactionEvent.transaction);
    return transactionEvent?.transaction === 'GET /edge-server-components';
  });

  await page.goto('/edge-server-components');

  const serverComponentTransaction = await serverComponentTransactionPromise;

  expect(serverComponentTransaction).toBe(1);
  expect(serverComponentTransaction).toBeDefined();
  expect(serverComponentTransaction.request?.headers).toBeDefined();

  // Assert that isolation scope works properly
  expect(serverComponentTransaction.tags?.['my-isolated-tag']).toBe(true);
  expect(serverComponentTransaction.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
