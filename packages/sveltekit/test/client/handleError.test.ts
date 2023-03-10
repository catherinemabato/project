import { Scope } from '@sentry/svelte';
import type { HandleClientError, NavigationEvent } from '@sveltejs/kit';

import { wrapHandleError } from '../../src/client/handleError';

const mockCaptureException = jest.fn();
let mockScope = new Scope();

jest.mock('@sentry/svelte', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    captureException: (err: unknown, cb: (arg0: unknown) => unknown) => {
      cb(mockScope);
      mockCaptureException(err, cb);
      return original.captureException(err, cb);
    },
  };
});

const mockAddExceptionMechanism = jest.fn();

jest.mock('@sentry/utils', () => {
  const original = jest.requireActual('@sentry/utils');
  return {
    ...original,
    addExceptionMechanism: (...args: unknown[]) => mockAddExceptionMechanism(...args),
  };
});

function handleError(_input: { error: unknown; event: NavigationEvent }): ReturnType<HandleClientError> {
  return {
    message: 'Whoops!',
  };
}

const navigationEvent: NavigationEvent = {
  params: {
    id: '123',
  },
  route: {
    id: 'users/[id]',
  },
  url: new URL('http://example.org/users/123'),
};

describe('handleError', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    mockAddExceptionMechanism.mockClear();
    mockScope = new Scope();
  });

  it('calls captureException', async () => {
    const wrappedHandleError = wrapHandleError(handleError);
    const mockError = new Error('test');
    const returnVal = await wrappedHandleError({ error: mockError, event: navigationEvent });

    expect(returnVal!.message).toEqual('Whoops!');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(mockError, expect.any(Function));
  });

  it('adds an exception mechanism', async () => {
    const addEventProcessorSpy = jest.spyOn(mockScope, 'addEventProcessor').mockImplementationOnce(callback => {
      void callback({}, { event_id: 'fake-event-id' });
      return mockScope;
    });

    const wrappedHandleError = wrapHandleError(handleError);
    const mockError = new Error('test');
    await wrappedHandleError({ error: mockError, event: navigationEvent });

    expect(addEventProcessorSpy).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledTimes(1);
    expect(mockAddExceptionMechanism).toBeCalledWith({}, { handled: false, type: 'sveltekit' });
  });
});
