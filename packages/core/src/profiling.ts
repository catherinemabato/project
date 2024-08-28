import { logger } from '@sentry/utils';
import { ProfilingIntegration, Profiler } from '@sentry/types';

import { DEBUG_BUILD } from "./debug-build";
import { getClient } from "./currentScopes";

/**
 * Starts the Sentry continuous profiler.
 * This mode is exclusive with the transaction profiler and will only work if the profilesSampleRate is set to a falsy value.
 * In continuous profiling mode, the profiler will keep reporting profile chunks to Sentry until it is stopped, which allows for continuous profiling of the application.
 */
function startProfiler() {
  const client = getClient()
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
  if (!integration) {
    DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
    return
  }
  integration._profiler.start();
}

/**
 * Stops the Sentry continuous profiler.
 * Calls to stop will stop the profiler and flush the currently collected profile data to Sentry.
 */
function stopProfiler() {
  const client = getClient()
  if (!client) {
    DEBUG_BUILD && logger.warn('No Sentry client available, profiling is not started');
    return;
  }

  const integration = client.getIntegrationByName<ProfilingIntegration<any>>('ProfilingIntegration');
  if (!integration) {
    DEBUG_BUILD && logger.warn('ProfilingIntegration is not available');
    return
  }
  integration._profiler.stop();
}

export const profiler: Profiler = {
  startProfiler,
  stopProfiler
}
