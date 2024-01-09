import { BrowserClient } from '@sentry/browser';
import {
  TRACING_DEFAULTS,
  Transaction,
  getCurrentScope,
  startInactiveSpan,
  startSpan,
  startSpanManual,
} from '@sentry/core';

import { Hub, IdleTransaction, Span, makeMain } from '../../core/src';
import { IdleTransactionSpanRecorder } from '../../core/src/tracing/idletransaction';
import { getDefaultBrowserClientOptions } from './testutils';

const dsn = 'https://123@sentry.io/42';
let hub: Hub;
beforeEach(() => {
  const options = getDefaultBrowserClientOptions({ dsn, tracesSampleRate: 1 });
  hub = new Hub(new BrowserClient(options));
  makeMain(hub);
});

describe('IdleTransaction', () => {
  describe('onScope', () => {
    it('sets the transaction on the scope on creation if onScope is true', () => {
      const transaction = new IdleTransaction(
        { name: 'foo' },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );
      transaction.initSpanRecorder(10);

      const scope = hub.getScope();
      // eslint-disable-next-line deprecation/deprecation
      expect(scope.getTransaction()).toBe(transaction);
    });

    it('does not set the transaction on the scope on creation if onScope is falsey', () => {
      const transaction = new IdleTransaction({ name: 'foo' }, hub);
      transaction.initSpanRecorder(10);

      const scope = hub.getScope();
      // eslint-disable-next-line deprecation/deprecation
      expect(scope.getTransaction()).toBe(undefined);
    });

    it('removes sampled transaction from scope on finish if onScope is true', () => {
      const transaction = new IdleTransaction(
        { name: 'foo' },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );
      transaction.initSpanRecorder(10);

      transaction.end();
      jest.runAllTimers();

      const scope = hub.getScope();
      // eslint-disable-next-line deprecation/deprecation
      expect(scope.getTransaction()).toBe(undefined);
    });

    it('removes unsampled transaction from scope on finish if onScope is true', () => {
      const transaction = new IdleTransaction(
        { name: 'foo', sampled: false },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );

      transaction.end();
      jest.runAllTimers();

      const scope = hub.getScope();
      // eslint-disable-next-line deprecation/deprecation
      expect(scope.getTransaction()).toBe(undefined);
    });

    it('does not remove transaction from scope on finish if another transaction was set there', () => {
      const transaction = new IdleTransaction(
        { name: 'foo' },
        hub,
        TRACING_DEFAULTS.idleTimeout,
        TRACING_DEFAULTS.finalTimeout,
        TRACING_DEFAULTS.heartbeatInterval,
        true,
      );
      transaction.initSpanRecorder(10);

      // @ts-expect-error need to pass in hub
      const otherTransaction = new Transaction({ name: 'bar' }, hub);
      // eslint-disable-next-line deprecation/deprecation
      hub.getScope().setSpan(otherTransaction);

      transaction.end();
      jest.runAllTimers();

      const scope = hub.getScope();
      // eslint-disable-next-line deprecation/deprecation
      expect(scope.getTransaction()).toBe(otherTransaction);
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  it('push and pops activities', () => {
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    const mockFinish = jest.spyOn(transaction, 'end');
    transaction.initSpanRecorder(10);
    expect(transaction.activities).toMatchObject({});
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(transaction);

    const span = startInactiveSpan({ name: 'inner' })!;
    expect(transaction.activities).toMatchObject({ [span.spanContext().spanId]: true });

    expect(mockFinish).toHaveBeenCalledTimes(0);

    span.end();
    expect(transaction.activities).toMatchObject({});

    jest.runOnlyPendingTimers();
    expect(mockFinish).toHaveBeenCalledTimes(1);
  });

  it('does not push activities if a span already has an end timestamp', () => {
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    transaction.initSpanRecorder(10);
    expect(transaction.activities).toMatchObject({});
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(transaction);

    startInactiveSpan({ name: 'inner', startTimestamp: 1234, endTimestamp: 5678 });
    expect(transaction.activities).toMatchObject({});
  });

  it('does not finish if there are still active activities', () => {
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    const mockFinish = jest.spyOn(transaction, 'end');
    transaction.initSpanRecorder(10);
    expect(transaction.activities).toMatchObject({});
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(transaction);

    startSpanManual({ name: 'inner1' }, span => {
      const childSpan = startInactiveSpan({ name: 'inner2' })!;
      expect(transaction.activities).toMatchObject({
        [span!.spanContext().spanId]: true,
        [childSpan.spanContext().spanId]: true,
      });
      span?.end();
      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout + 1);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      expect(transaction.activities).toMatchObject({ [childSpan.spanContext().spanId]: true });
    });
  });

  it('calls beforeFinish callback before finishing', () => {
    const mockCallback1 = jest.fn();
    const mockCallback2 = jest.fn();
    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    transaction.initSpanRecorder(10);
    transaction.registerBeforeFinishCallback(mockCallback1);
    transaction.registerBeforeFinishCallback(mockCallback2);
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(transaction);

    expect(mockCallback1).toHaveBeenCalledTimes(0);
    expect(mockCallback2).toHaveBeenCalledTimes(0);

    startSpan({ name: 'inner' }, () => {});

    jest.runOnlyPendingTimers();
    expect(mockCallback1).toHaveBeenCalledTimes(1);
    expect(mockCallback1).toHaveBeenLastCalledWith(transaction, expect.any(Number));
    expect(mockCallback2).toHaveBeenCalledTimes(1);
    expect(mockCallback2).toHaveBeenLastCalledWith(transaction, expect.any(Number));
  });

  it('filters spans on finish', () => {
    const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub);
    transaction.initSpanRecorder(10);
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(transaction);

    // regular child - should be kept
    const regularSpan = startInactiveSpan({ name: 'span1', startTimestamp: transaction.startTimestamp + 2 })!;

    // discardedSpan - startTimestamp is too large
    startInactiveSpan({ name: 'span2', startTimestamp: 645345234 });

    // Should be cancelled - will not finish
    const cancelledSpan = startInactiveSpan({ name: 'span3', startTimestamp: transaction.startTimestamp + 4 })!;

    regularSpan.end(regularSpan.startTimestamp + 4);
    transaction.end(transaction.startTimestamp + 10);

    expect(transaction.spanRecorder).toBeDefined();
    if (transaction.spanRecorder) {
      const spans = transaction.spanRecorder.spans;
      expect(spans).toHaveLength(3);
      expect(spans[0].spanContext().spanId).toBe(transaction.spanContext().spanId);

      // Regular Span - should not modified
      expect(spans[1].spanContext().spanId).toBe(regularSpan.spanContext().spanId);
      expect(spans[1].endTimestamp).not.toBe(transaction.endTimestamp);

      // Cancelled Span - has endtimestamp of transaction
      expect(spans[2].spanContext().spanId).toBe(cancelledSpan.spanContext().spanId);
      expect(spans[2].status).toBe('cancelled');
      expect(spans[2].endTimestamp).toBe(transaction.endTimestamp);
    }
  });

  it('filters out spans that exceed final timeout', () => {
    const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, 1000, 3000);
    transaction.initSpanRecorder(10);
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(transaction);

    const span = startInactiveSpan({ name: 'span', startTimestamp: transaction.startTimestamp + 2 })!;
    span.end(span.startTimestamp + 10 + 30 + 1);

    transaction.end(transaction.startTimestamp + 50);

    expect(transaction.spanRecorder).toBeDefined();
    expect(transaction.spanRecorder!.spans).toHaveLength(1);
  });

  it('should record dropped transactions', async () => {
    const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234, sampled: false }, hub, 1000);

    const client = hub.getClient()!;

    const recordDroppedEventSpy = jest.spyOn(client, 'recordDroppedEvent');

    transaction.initSpanRecorder(10);
    transaction.end(transaction.startTimestamp + 10);

    expect(recordDroppedEventSpy).toHaveBeenCalledWith('sample_rate', 'transaction');
  });

  describe('_idleTimeout', () => {
    it('finishes if no activities are added to the transaction', () => {
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub);
      transaction.initSpanRecorder(10);

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(transaction.endTimestamp).toBeDefined();
    });

    it('does not finish if a activity is started', () => {
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub);
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      startInactiveSpan({ name: 'span' });

      jest.advanceTimersByTime(TRACING_DEFAULTS.idleTimeout);
      expect(transaction.endTimestamp).toBeUndefined();
    });

    it('does not finish when idleTimeout is not exceed after last activity finished', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      startSpan({ name: 'span1' }, () => {});

      jest.advanceTimersByTime(2);

      startSpan({ name: 'span2' }, () => {});

      jest.advanceTimersByTime(8);

      expect(transaction.endTimestamp).toBeUndefined();
    });

    it('finish when idleTimeout is exceeded after last activity finished', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      startSpan({ name: 'span1' }, () => {});

      jest.advanceTimersByTime(2);

      startSpan({ name: 'span2' }, () => {});

      jest.advanceTimersByTime(10);

      expect(transaction.endTimestamp).toBeDefined();
    });
  });

  describe('cancelIdleTimeout', () => {
    it('permanent idle timeout cancel is not restarted by child span start', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      const firstSpan = startInactiveSpan({ name: 'span1' })!;
      transaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });
      const secondSpan = startInactiveSpan({ name: 'span2' })!;
      firstSpan.end();
      secondSpan.end();

      expect(transaction.endTimestamp).toBeDefined();
    });

    it('permanent idle timeout cancel finished the transaction with the last child', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      const firstSpan = startInactiveSpan({ name: 'span1' })!;
      transaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });
      const secondSpan = startInactiveSpan({ name: 'span2' })!;
      const thirdSpan = startInactiveSpan({ name: 'span3' })!;

      firstSpan.end();
      expect(transaction.endTimestamp).toBeUndefined();

      secondSpan.end();
      expect(transaction.endTimestamp).toBeUndefined();

      thirdSpan.end();
      expect(transaction.endTimestamp).toBeDefined();
    });

    it('permanent idle timeout cancel finishes transaction if there are no activities', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      startSpan({ name: 'span' }, () => {});

      jest.advanceTimersByTime(2);

      transaction.cancelIdleTimeout(undefined, { restartOnChildSpanChange: false });

      expect(transaction.endTimestamp).toBeDefined();
    });

    it('default idle cancel timeout is restarted by child span change', () => {
      const idleTimeout = 10;
      const transaction = new IdleTransaction({ name: 'foo', startTimestamp: 1234 }, hub, idleTimeout);
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      startSpan({ name: 'span' }, () => {});

      jest.advanceTimersByTime(2);

      transaction.cancelIdleTimeout();

      startSpan({ name: 'span' }, () => {});

      jest.advanceTimersByTime(8);
      expect(transaction.endTimestamp).toBeUndefined();

      jest.advanceTimersByTime(2);
      expect(transaction.endTimestamp).toBeDefined();
    });
  });

  describe('heartbeat', () => {
    it('does not mark transaction as `DeadlineExceeded` if idle timeout has not been reached', () => {
      // 20s to exceed 3 heartbeats
      const transaction = new IdleTransaction({ name: 'foo' }, hub, 20000);
      const mockFinish = jest.spyOn(transaction, 'end');

      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 3
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(transaction.status).not.toEqual('deadline_exceeded');
      expect(mockFinish).toHaveBeenCalledTimes(0);
    });

    it('finishes a transaction after 3 beats', () => {
      const transaction = new IdleTransaction({ name: 'foo' }, hub, TRACING_DEFAULTS.idleTimeout);
      const mockFinish = jest.spyOn(transaction, 'end');
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      startInactiveSpan({ name: 'span' });

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 3
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });

    it('resets after new activities are added', () => {
      const transaction = new IdleTransaction({ name: 'foo' }, hub, TRACING_DEFAULTS.idleTimeout, 50000);
      const mockFinish = jest.spyOn(transaction, 'end');
      transaction.initSpanRecorder(10);
      // eslint-disable-next-line deprecation/deprecation
      getCurrentScope().setSpan(transaction);

      expect(mockFinish).toHaveBeenCalledTimes(0);
      startInactiveSpan({ name: 'span' });

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      const span = startInactiveSpan({ name: 'span' })!; // push activity

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      startInactiveSpan({ name: 'span' }); // push activity
      startInactiveSpan({ name: 'span' }); // push activity

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      span.end(); // pop activity

      // Beat 1
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 2
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(0);

      // Beat 3
      jest.advanceTimersByTime(TRACING_DEFAULTS.heartbeatInterval);
      expect(mockFinish).toHaveBeenCalledTimes(1);

      // Heartbeat does not keep going after finish has been called
      jest.runAllTimers();
      expect(mockFinish).toHaveBeenCalledTimes(1);
    });
  });
});

describe('IdleTransactionSpanRecorder', () => {
  it('pushes and pops activities', () => {
    const mockPushActivity = jest.fn();
    const mockPopActivity = jest.fn();
    const spanRecorder = new IdleTransactionSpanRecorder(mockPushActivity, mockPopActivity, '', 10);
    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    expect(mockPopActivity).toHaveBeenCalledTimes(0);

    const span = new Span({ sampled: true });

    expect(spanRecorder.spans).toHaveLength(0);
    spanRecorder.add(span);
    expect(spanRecorder.spans).toHaveLength(1);

    expect(mockPushActivity).toHaveBeenCalledTimes(1);
    expect(mockPushActivity).toHaveBeenLastCalledWith(span.spanContext().spanId);
    expect(mockPopActivity).toHaveBeenCalledTimes(0);

    span.end();
    expect(mockPushActivity).toHaveBeenCalledTimes(1);
    expect(mockPopActivity).toHaveBeenCalledTimes(1);
    expect(mockPushActivity).toHaveBeenLastCalledWith(span.spanContext().spanId);
  });

  it('does not push activities if a span has a timestamp', () => {
    const mockPushActivity = jest.fn();
    const mockPopActivity = jest.fn();
    const spanRecorder = new IdleTransactionSpanRecorder(mockPushActivity, mockPopActivity, '', 10);

    const span = new Span({ sampled: true, startTimestamp: 765, endTimestamp: 345 });
    spanRecorder.add(span);

    expect(mockPushActivity).toHaveBeenCalledTimes(0);
  });

  it('does not push or pop transaction spans', () => {
    const mockPushActivity = jest.fn();
    const mockPopActivity = jest.fn();

    const transaction = new IdleTransaction({ name: 'foo' }, hub);
    const spanRecorder = new IdleTransactionSpanRecorder(
      mockPushActivity,
      mockPopActivity,
      transaction.spanContext().spanId,
      10,
    );

    spanRecorder.add(transaction);
    expect(mockPushActivity).toHaveBeenCalledTimes(0);
    expect(mockPopActivity).toHaveBeenCalledTimes(0);
  });
});
