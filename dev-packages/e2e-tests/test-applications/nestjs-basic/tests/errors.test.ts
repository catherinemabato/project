import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends exception to Sentry', async ({ request }) => {
  const errorEventPromise = waitForError('nestjs-basic', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const response = await request.get('/test-exception/123');
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception with id 123');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-exception/123',
  });

  expect(errorEvent.transaction).toEqual('GET /test-exception/:id');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});

test('Does not send HttpExceptions to Sentry', async ({ request }) => {
  let errorEventOccurred = false;

  waitForError('nestjs-basic', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected 400 exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-400-exception/:id';
  });

  waitForError('nestjs-basic', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'This is an expected 500 exception with id 123') {
      errorEventOccurred = true;
    }

    return event?.transaction === 'GET /test-expected-500-exception/:id';
  });

  const transactionEventPromise400 = waitForTransaction('nestjs-basic', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-expected-400-exception/:id';
  });

  const transactionEventPromise500 = waitForTransaction('nestjs-basic', transactionEvent => {
    return transactionEvent?.transaction === 'GET /test-expected-500-exception/:id';
  });

  const response400 = await request.get('/test-expected-400-exception/123');
  expect(response400.status).toBe(400);

  const response500 = await request.get('/test-expected-500-exception/123');
  expect(response500.status).toBe(500);

  await transactionEventPromise400;
  await transactionEventPromise500;

  await new Promise(resolve => setTimeout(resolve, 10000));

  expect(errorEventOccurred).toBe(false);
});
