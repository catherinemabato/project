import type { Envelope, Transport } from '@sentry/types';

import type { Replay as ReplayIntegration } from '../../src';
import type { ReplayContainer } from '../../src/replay';
import type { ReplayConfiguration } from '../../src/types';
import type { TestClientOptions } from '../utils/TestClient';
import { getDefaultClientOptions, init } from '../utils/TestClient';
import { EventCounter } from '../../src/util/EventCounter';

export interface MockSdkParams {
  replayOptions?: ReplayConfiguration;
  sentryOptions?: Partial<TestClientOptions>;
  autoStart?: boolean;
}

class MockTransport implements Transport {
  send: (request: Envelope) => PromiseLike<void> = jest.fn(async () => {
    return;
  });
  async flush() {
    return true;
  }
  async sendEvent(_e: Event) {
    return {
      status: 'skipped',
      event: 'ok',
      type: 'transaction',
    };
  }
  async sendSession() {
    return;
  }
  async recordLostEvent() {
    return;
  }
  async close() {
    return;
  }
}

export async function mockSdk({ replayOptions, sentryOptions, autoStart = true }: MockSdkParams = {}): Promise<{
  replay: ReplayContainer;
  integration: ReplayIntegration;
}> {
  const { Replay } = await import('../../src');

  // Scope this to the test, instead of the module
  let _initialized = false;
  class TestReplayIntegration extends Replay {
    protected get _isInitialized(): boolean {
      return _initialized;
    }
    protected set _isInitialized(value: boolean) {
      _initialized = value;
    }

    public setupOnce(): void {
      // do nothing
    }
  }

  const replayIntegration = new TestReplayIntegration({
    stickySession: false,
    ...replayOptions,
  });

  init({
    ...getDefaultClientOptions(),
    dsn: 'https://dsn@ingest.f00.f00/1',
    autoSessionTracking: false,
    sendClientReports: false,
    transport: () => new MockTransport(),
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 0.0,
    ...sentryOptions,
    integrations: [replayIntegration],
  });

  // Instead of `setupOnce`, which is tricky to test, we call this manually here
  replayIntegration['_setup']();

  if (autoStart) {
    replayIntegration.start();
  }

  const replay = replayIntegration['_replay']!;

  // In tests, we want to ignore the event counter by default
  // As it adds timeouts that can interfere with other things
  replay.eventCounter = new EventCounter(0);

  return { replay, integration: replayIntegration };
}
