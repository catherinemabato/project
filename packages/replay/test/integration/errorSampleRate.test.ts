import { captureException, getCurrentHub } from '@sentry/core';

import {
  DEFAULT_FLUSH_MIN_DELAY,
  ERROR_CHECKOUT_TIME,
  MAX_SESSION_LIFE,
  REPLAY_SESSION_KEY,
  SESSION_IDLE_DURATION,
  WINDOW,
} from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import { addEvent } from '../../src/util/addEvent';
import { PerformanceEntryResource } from '../fixtures/performanceEntry/resource';
import type { RecordMock } from '../index';
import { BASE_TIMESTAMP } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';
import type { DomHandler } from '../types';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

describe('Integration | errorSampleRate', () => {
  let replay: ReplayContainer;
  let mockRecord: RecordMock;
  let domHandler: DomHandler;

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));
  });

  afterEach(async () => {
    clearSession(replay);
    replay.stop();
  });

  it('uploads a replay when `Sentry.captureException` is called and continues recording', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    // Does not capture on mouse click
    domHandler({
      name: 'click',
    });
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();

    captureException(new Error('testing'));

    await new Promise(process.nextTick);
    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
        contexts: {
          replay: {
            error_sample_rate: 1,
            session_sample_rate: 0,
          },
        },
      }),
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
        TEST_EVENT,
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });

    // This is from when we stop recording and start a session recording
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
        contexts: {
          replay: {
            error_sample_rate: 1,
            session_sample_rate: 0,
          },
        },
      }),
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY + 40, type: 2 },
      ]),
    });

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);

    // New checkout when we call `startRecording` again after uploading segment
    // after an error occurs
    expect(replay).toHaveLastSentReplay({
      recordingData: JSON.stringify([
        {
          data: { isCheckout: true },
          timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY + 40,
          type: 2,
        },
      ]),
    });

    // Check that click will get captured
    domHandler({
      name: 'click',
    });

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).toHaveLastSentReplay({
      recordingData: JSON.stringify([
        {
          type: 5,
          timestamp: BASE_TIMESTAMP + 10000 + 60,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: (BASE_TIMESTAMP + 10000 + 60) / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });
  });

  it('does not send a replay when triggering a full dom snapshot when document becomes visible after [SESSION_IDLE_DURATION]ms', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    jest.advanceTimersByTime(SESSION_IDLE_DURATION + 1);

    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not send a replay if user hides the tab and comes back within 60 seconds', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();

    // User comes back before `SESSION_IDLE_DURATION` elapses
    jest.advanceTimersByTime(SESSION_IDLE_DURATION - 100);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not upload a replay event when document becomes hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    addEvent(replay, TEST_EVENT);

    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not upload a replay event if 5 seconds have elapsed since the last replay event occurred', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not upload a replay event if 15 seconds have elapsed since the last replay upload', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Fire a new event every 4 seconds, 4 times
    [...Array(4)].forEach(() => {
      mockRecord._emitter(TEST_EVENT);
      jest.advanceTimersByTime(4000);
    });

    // We are at time = +16seconds now (relative to BASE_TIMESTAMP)
    // The next event should cause an upload immediately
    mockRecord._emitter(TEST_EVENT);
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(replay).not.toHaveLastSentReplay();

    // Let's make sure it continues to work
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();
  });

  // When the error session records as a normal session, we want to stop
  // recording after the session ends. Otherwise, we get into a state where the
  // new session is a session type replay (this could conflict with the session
  // sample rate of 0.0), or an error session that has no errors. Instead we
  // simply stop the session replay completely and wait for a new page load to
  // resample.
  it('stops replay if session exceeds MAX_SESSION_LIFE and does not start a new session thereafter', async () => {
    // Idle for 15 minutes
    jest.advanceTimersByTime(MAX_SESSION_LIFE + 1);

    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // We stop recording after 15 minutes of inactivity in error mode

    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isEnabled()).toBe(false);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    domHandler({
      name: 'click',
    });

    // Remains disabled!
    expect(replay.isEnabled()).toBe(false);
  });

  // Should behave the same as above test
  it('stops replay if user has been idle for more than SESSION_IDLE_DURATION and does not start a new session thereafter', async () => {
    // Idle for 15 minutes
    jest.advanceTimersByTime(SESSION_IDLE_DURATION + 1);

    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // We stop recording after SESSION_IDLE_DURATION of inactivity in error mode
    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isEnabled()).toBe(false);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    domHandler({
      name: 'click',
    });

    // Remains disabled!
    expect(replay.isEnabled()).toBe(false);
  });

  it('has the correct timestamps with deferred root event and last replay update', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);

    captureException(new Error('testing'));

    await new Promise(process.nextTick);
    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 }, TEST_EVENT]),
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        // the exception happens roughly 10 seconds after BASE_TIMESTAMP
        // (advance timers + waiting for flush after the checkout) and
        // extra time is likely due to async of `addMemoryEntry()`

        timestamp: (BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY + DEFAULT_FLUSH_MIN_DELAY + 40) / 1000,
        error_ids: [expect.any(String)],
        trace_ids: [],
        urls: ['http://localhost/'],
        replay_id: expect.any(String),
      }),
      recordingPayloadHeader: { segment_id: 0 },
    });
  });

  it('has correct timestamps when error occurs much later than initial pageload/checkout', async () => {
    const ELAPSED = ERROR_CHECKOUT_TIME;
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    // add a mock performance event
    replay.performanceEvents.push(PerformanceEntryResource());

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.advanceTimersByTime(ELAPSED);

    // in production, this happens at a time interval
    // session started time should be updated to this current timestamp
    mockRecord.takeFullSnapshot(true);

    jest.runAllTimers();
    jest.advanceTimersByTime(20);
    await new Promise(process.nextTick);

    captureException(new Error('testing'));

    await new Promise(process.nextTick);
    jest.runAllTimers();
    jest.advanceTimersByTime(20);
    await new Promise(process.nextTick);

    expect(replay.session?.started).toBe(BASE_TIMESTAMP + ELAPSED + 20);

    // Does not capture mouse click
    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        // Make sure the old performance event is thrown out
        replay_start_timestamp: (BASE_TIMESTAMP + ELAPSED + 20) / 1000,
      }),
      recordingData: JSON.stringify([
        {
          data: { isCheckout: true },
          timestamp: BASE_TIMESTAMP + ELAPSED + 20,
          type: 2,
        },
      ]),
    });
  });

  it('stops replay when user goes idle', async () => {
    jest.setSystemTime(BASE_TIMESTAMP);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    captureException(new Error('testing'));

    await new Promise(process.nextTick);
    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).toHaveLastSentReplay();

    // Now wait after session expires - should stop recording
    mockRecord.takeFullSnapshot.mockClear();
    (getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>).mockClear();

    expect(replay).not.toHaveLastSentReplay();

    // Go idle
    jest.advanceTimersByTime(SESSION_IDLE_DURATION + 1);
    await new Promise(process.nextTick);

    mockRecord._emitter(TEST_EVENT);

    expect(replay).not.toHaveLastSentReplay();

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);
  });

  it('stops replay when session exceeds max length', async () => {
    jest.setSystemTime(BASE_TIMESTAMP);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    captureException(new Error('testing'));

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).toHaveLastSentReplay();

    // Wait a bit, shortly before session expires
    jest.advanceTimersByTime(MAX_SESSION_LIFE - 1000);
    await new Promise(process.nextTick);

    mockRecord._emitter(TEST_EVENT);
    replay.triggerUserActivity();

    expect(replay).toHaveLastSentReplay();

    // Now wait after session expires - should stop recording
    mockRecord.takeFullSnapshot.mockClear();
    (getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>).mockClear();

    jest.advanceTimersByTime(10_000);
    await new Promise(process.nextTick);

    mockRecord._emitter(TEST_EVENT);
    replay.triggerUserActivity();

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);
  });
});

/**
 * This is testing a case that should only happen with error-only sessions.
 * Previously we had assumed that loading a session from session storage meant
 * that the session was not new. However, this is not the case with error-only
 * sampling since we can load a saved session that did not have an error (and
 * thus no replay was created).
 */
it('sends a replay after loading the session multiple times', async () => {
  // Pretend that a session is already saved before loading replay
  WINDOW.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    `{"segmentId":0,"id":"fd09adfc4117477abc8de643e5a5798a","sampled":"buffer","started":${BASE_TIMESTAMP},"lastActivity":${BASE_TIMESTAMP}}`,
  );
  const { mockRecord, replay, integration } = await resetSdkMock({
    replayOptions: {
      stickySession: true,
    },
    sentryOptions: {
      replaysOnErrorSampleRate: 1.0,
    },
    autoStart: false,
  });
  // @ts-ignore this is protected, but we want to call it for this test
  integration._initialize();

  jest.runAllTimers();

  await new Promise(process.nextTick);
  const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
  mockRecord._emitter(TEST_EVENT);

  expect(replay).not.toHaveLastSentReplay();

  captureException(new Error('testing'));

  await new Promise(process.nextTick);
  jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
  await new Promise(process.nextTick);

  expect(replay).toHaveSentReplay({
    recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 }, TEST_EVENT]),
  });

  // Latest checkout when we call `startRecording` again after uploading segment
  // after an error occurs (e.g. when we switch to session replay recording)
  expect(replay).toHaveLastSentReplay({
    recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + 5040, type: 2 }]),
  });
});
