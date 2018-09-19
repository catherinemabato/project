export {
  Breadcrumb,
  Request,
  SdkInfo,
  SentryEvent,
  SentryException,
  SentryResponse,
  Severity,
  StackFrame,
  Stacktrace,
  Status,
  Thread,
  User,
} from '@sentry/types';

export {
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  getHubFromCarrier,
  Hub,
  Scope,
  withScope,
} from '@sentry/core';

export { getCurrentHub } from './hub';
export { NodeBackend, NodeOptions } from './backend';
export { NodeClient } from './client';
export { defaultIntegrations, init } from './sdk';
export { SDK_NAME, SDK_VERSION } from './version';

import { Integrations as CoreIntegrations } from '@sentry/core';
import * as Handlers from './handlers';
import * as NodeIntegrations from './integrations';
import * as Transports from './transports';

const INTEGRATIONS = {
  ...CoreIntegrations,
  ...NodeIntegrations,
};

export { INTEGRATIONS as Integrations, Transports, Handlers };
