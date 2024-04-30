import { registerSpanErrorInstrumentation } from '@sentry/core';

registerSpanErrorInstrumentation();

export * from './index.bundle.base';

export {
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
} from '@sentry/core';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';

import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };

export { replayIntegration } from '@sentry-internal/replay';
