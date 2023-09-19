import { SDK_VERSION } from '@sentry/core';
import type { VercelEdgeOptions } from '@sentry/vercel-edge';
import { init as vercelEdgeInit } from '@sentry/vercel-edge';

export type EdgeOptions = VercelEdgeOptions;

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: VercelEdgeOptions = {}): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk = options._metadata.sdk || {
    name: 'sentry.javascript.nextjs',
    packages: [
      {
        name: 'npm:@sentry/nextjs',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  vercelEdgeInit(options);
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}

export * from '@sentry/vercel-edge';
export { Span, Transaction } from '@sentry/core';

// eslint-disable-next-line import/export
export * from '../common';

export {
  // eslint-disable-next-line deprecation/deprecation, import/export
  withSentryAPI,
  // eslint-disable-next-line import/export
  wrapApiHandlerWithSentry,
} from './wrapApiHandlerWithSentry';
