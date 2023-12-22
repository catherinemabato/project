import type { Event as SentryEvent, ExtendedError } from '@sentry/types';

import { ExtraErrorData } from '../src/extraerrordata';

const extraErrorData = new ExtraErrorData();
let event: SentryEvent;

describe('ExtraErrorData()', () => {
  beforeEach(() => {
    event = {};
  });

  it('should enhance event with extra data extracted from the error', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.foo = 'bar';

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 42,
        foo: 'bar',
      },
    });
  });

  it('doesnt choke on linked errors and stringify names instead', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.cause = new SyntaxError('bar');

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        cause: 'SyntaxError: bar',
      },
    });
  });

  it('should stringify up to 3 nested levels by default', () => {
    const error = new TypeError('foo') as ExtendedError;
    error['1'] = {
      2: {
        3: {
          4: 'foo',
        },
      },
    };

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        1: {
          2: {
            3: '[Object]',
          },
        },
      },
    });
  });

  it('should not remove previous data existing in extra field', () => {
    event = {
      contexts: {
        foo: { bar: 42 },
      },
    };
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 42,
      },
      foo: { bar: 42 },
    });
  });

  it('should return event if originalException is not an Error object', () => {
    const error = 'error message, not object';

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent).toEqual(event);
  });

  it('should return event if there is no SentryEventHint', () => {
    const enhancedEvent = extraErrorData.processEvent(event, {});

    expect(enhancedEvent).toEqual(event);
  });

  it('should return event if there is no originalException', () => {
    const enhancedEvent = extraErrorData.processEvent(event, {
      // @ts-expect-error Allow event to have extra properties
      notOriginalException: 'fooled you',
    });

    expect(enhancedEvent).toEqual(event);
  });

  it('should call toJSON of original exception and add its properties', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.foo = 'bar';
    error.toJSON = function () {
      return {
        bar: 1337,
        qux: `${this.message} but nicer`,
      };
    };

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        bar: 1337,
        baz: 42,
        foo: 'bar',
        qux: 'foo but nicer',
      },
    });
  });

  it('toJSON props should have priority over directly assigned ones', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.toJSON = function () {
      return {
        baz: 1337,
      };
    };

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 1337,
      },
    });
  });

  it('toJSON props should allow for usage of native names', () => {
    const error = new TypeError('foo') as ExtendedError;
    error.baz = 42;
    error.toJSON = function () {
      return {
        message: 'bar',
      };
    };

    const enhancedEvent = extraErrorData.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      TypeError: {
        baz: 42,
        message: 'bar',
      },
    });
  });

  it('captures Error causes when captureErrorCause = true', () => {
    if (parseInt(process.version.split('.')[0]) < 16) {
      return;
    }

    const extraErrorDataWithCauseCapture = new ExtraErrorData({ captureErrorCause: true });

    // @ts-expect-error TS apparently doesn't understand error causes
    const error = new Error('foo', { cause: { woot: 'foo' } }) as ExtendedError;

    const enhancedEvent = extraErrorDataWithCauseCapture.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).toEqual({
      Error: {
        cause: {
          woot: 'foo',
        },
      },
    });
  });

  it("doesn't capture Error causes when captureErrorCause != true", () => {
    if (parseInt(process.version.split('.')[0]) < 16) {
      return;
    }

    const extraErrorDataWithoutCauseCapture = new ExtraErrorData();

    // @ts-expect-error TS apparently doesn't understand error causes
    const error = new Error('foo', { cause: { woot: 'foo' } }) as ExtendedError;

    const enhancedEvent = extraErrorDataWithoutCauseCapture.processEvent(event, {
      originalException: error,
    });

    expect(enhancedEvent.contexts).not.toEqual({
      Error: {
        cause: {
          woot: 'foo',
        },
      },
    });
  });
});
