/* eslint-disable max-lines */
import {
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
} from '@sentry/core';
import {
  consoleIntegration,
  contextLinesIntegration,
  httpIntegration,
  init as initNode,
  modulesIntegration,
  nodeContextIntegration,
  undiciIntegration,
} from '@sentry/node';
import type { Integration, Options } from '@sentry/types';

import { BunClient } from './client';
import { BunServer } from './integrations';
import { makeFetchTransport } from './transports';
import type { BunOptions } from './types';

/** @deprecated Use `getDefaultIntegrations(options)` instead. */
export const defaultIntegrations = [
  // Common
  inboundFiltersIntegration(),
  functionToStringIntegration(),
  linkedErrorsIntegration(),
  requestDataIntegration(),
  // Native Wrappers
  consoleIntegration(),
  httpIntegration(),
  undiciIntegration(),
  // Global Handlers # TODO (waiting for https://github.com/oven-sh/bun/issues/5091)
  // new NodeIntegrations.OnUncaughtException(),
  // new NodeIntegrations.OnUnhandledRejection(),
  // Event Info
  contextLinesIntegration(),
  // new NodeIntegrations.LocalVariables(), # does't work with Bun
  nodeContextIntegration(),
  modulesIntegration(),
  // Bun Specific
  new BunServer(),
];

/** Get the default integrations for the Bun SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  // We return a copy of the defaultIntegrations here to avoid mutating this
  return [
    // eslint-disable-next-line deprecation/deprecation
    ...defaultIntegrations,
  ];
}

/**
 * The Sentry Bun SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```
 *
 * const { init } = require('@sentry/bun');
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { configureScope } = require('@sentry/node');
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTag({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { addBreadcrumb } = require('@sentry/node');
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const Sentry = require('@sentry/node');
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * ```
 *
 * @see {@link BunOptions} for documentation on configuration options.
 */
export function init(options: BunOptions = {}): void {
  options.clientClass = BunClient;
  options.transport = options.transport || makeFetchTransport;

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  initNode(options);
}
