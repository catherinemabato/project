import {
  addGlobalEventProcessor,
  captureException,
  captureMessage,
  flush,
  getCurrentHub,
  Scope,
  SDK_VERSION,
  Severity,
  startTransaction,
  withScope,
} from '@sentry/node';
import * as Sentry from '@sentry/node';
import { Integration } from '@sentry/types';
import { addExceptionMechanism } from '@sentry/utils';
// NOTE: I have no idea how to fix this right now, and don't want to waste more time, as it builds just fine — Kamil
// eslint-disable-next-line import/no-unresolved
import { Context, Handler } from 'aws-lambda';
import { hostname } from 'os';
import { performance } from 'perf_hooks';
import { types } from 'util';

import { AWSServices } from './awsservices';

export * from '@sentry/node';

const { isPromise } = types;

// https://www.npmjs.com/package/aws-lambda-consumer
type SyncHandler<T extends Handler> = (
  event: Parameters<T>[0],
  context: Parameters<T>[1],
  callback: Parameters<T>[2],
) => void;

export type AsyncHandler<T extends Handler> = (
  event: Parameters<T>[0],
  context: Parameters<T>[1],
) => Promise<NonNullable<Parameters<Parameters<T>[2]>[1]>>;

export interface WrapperOptions {
  flushTimeout: number;
  rethrowAfterCapture: boolean;
  callbackWaitsForEmptyEventLoop: boolean;
  captureTimeoutWarning: boolean;
  timeoutWarningLimit: number;
}

export const defaultIntegrations: Integration[] = [...Sentry.defaultIntegrations, new AWSServices()];

/**
 * @see {@link Sentry.init}
 */
export function init(options: Sentry.NodeOptions = {}): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }
  return Sentry.init(options);
}

/**
 * Add SDK info
 */
addGlobalEventProcessor(event => {
  event.sdk = {
    ...event.sdk,
    name: 'sentry.javascript.serverless',
    integrations: [...((event.sdk && event.sdk.integrations) || []), 'AWSLambda'],
    packages: [
      ...((event.sdk && event.sdk.packages) || []),
      {
        name: 'npm:@sentry/serverless',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  return event;
});

/**
 * Add event processor that will override SDK details to point to the serverless SDK instead of Node,
 * as well as set correct mechanism type, which should be set to `handled: false`.
 * We do it like this, so that we don't introduce any side-effects in this module, which makes it tree-shakeable.
 * @param scope Scope that processor should be added to
 */
function addServerlessEventProcessor(scope: Scope): void {
  scope.addEventProcessor(event => {
    addExceptionMechanism(event, {
      handled: false,
    });

    return event;
  });
}

/**
 * Adds additional information from the environment and AWS Context to the Sentry Scope.
 *
 * @param scope Scope that should be enhanced
 * @param context AWS Lambda context that will be used to extract some part of the data
 */
function enhanceScopeWithEnvironmentData(scope: Scope, context: Context): void {
  scope.setTransactionName(context.functionName);

  scope.setTag('server_name', process.env._AWS_XRAY_DAEMON_ADDRESS || process.env.SENTRY_NAME || hostname());
  scope.setTag('url', `awslambda:///${context.functionName}`);

  scope.setContext('runtime', {
    name: 'node',
    version: global.process.version,
  });

  scope.setContext('aws.lambda', {
    aws_request_id: context.awsRequestId,
    function_name: context.functionName,
    function_version: context.functionVersion,
    invoked_function_arn: context.invokedFunctionArn,
    execution_duration_in_millis: performance.now(),
    remaining_time_in_millis: context.getRemainingTimeInMillis(),
    'sys.argv': process.argv,
  });

  scope.setContext('aws.cloudwatch.logs', {
    log_group: context.logGroupName,
    log_stream: context.logStreamName,
    url: `https://console.aws.amazon.com/cloudwatch/home?region=${
      process.env.AWS_REGION
    }#logsV2:log-groups/log-group/${encodeURIComponent(context.logGroupName)}/log-events/${encodeURIComponent(
      context.logStreamName,
    )}`,
  });
}

/**
 * Capture exception with a a context.
 *
 * @param e exception to be captured
 * @param context Context
 */
function captureExceptionWithContext(e: unknown, context: Context): void {
  withScope(scope => {
    addServerlessEventProcessor(scope);
    enhanceScopeWithEnvironmentData(scope, context);
    captureException(e);
  });
}

/**
 * Wraps a lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Handler
 * @param options Options
 * @returns Handler
 */
export function wrapHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  wrapOptions: Partial<WrapperOptions> = {},
): Handler<TEvent, TResult | undefined> {
  const options: WrapperOptions = {
    flushTimeout: 2000,
    rethrowAfterCapture: true,
    callbackWaitsForEmptyEventLoop: false,
    captureTimeoutWarning: true,
    timeoutWarningLimit: 500,
    ...wrapOptions,
  };
  let timeoutWarningTimer: NodeJS.Timeout;

  // AWSLambda is like Express. It makes a distinction about handlers based on it's last argument
  // async (event) => async handler
  // async (event, context) => async handler
  // (event, context, callback) => sync handler
  // Nevertheless whatever option is chosen by user, we convert it to async handler.
  const asyncHandler: AsyncHandler<typeof handler> =
    handler.length > 2
      ? (event, context) =>
          new Promise((resolve, reject) => {
            const rv = (handler as SyncHandler<typeof handler>)(event, context, (error, result) => {
              if (error === null || error === undefined) {
                resolve(result!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
              } else {
                reject(error);
              }
            }) as unknown;

            // This should never happen, but still can if someone writes a handler as
            // `async (event, context, callback) => {}`
            if (isPromise(rv)) {
              (rv as Promise<NonNullable<TResult>>).then(resolve, reject);
            }
          })
      : (handler as AsyncHandler<typeof handler>);

  return async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = options.callbackWaitsForEmptyEventLoop;

    // In seconds. You cannot go any more granular than this in AWS Lambda.
    const configuredTimeout = Math.ceil(context.getRemainingTimeInMillis() / 1000);
    const configuredTimeoutMinutes = Math.floor(configuredTimeout / 60);
    const configuredTimeoutSeconds = configuredTimeout % 60;

    const humanReadableTimeout =
      configuredTimeoutMinutes > 0
        ? `${configuredTimeoutMinutes}m${configuredTimeoutSeconds}s`
        : `${configuredTimeoutSeconds}s`;

    // When `callbackWaitsForEmptyEventLoop` is set to false, which it should when using `captureTimeoutWarning`,
    // we don't have a guarantee that this message will be delivered. Because of that, we don't flush it.
    if (options.captureTimeoutWarning) {
      const timeoutWarningDelay = context.getRemainingTimeInMillis() - options.timeoutWarningLimit;

      timeoutWarningTimer = setTimeout(() => {
        withScope(scope => {
          addServerlessEventProcessor(scope);
          enhanceScopeWithEnvironmentData(scope, context);
          scope.setTag('timeout', humanReadableTimeout);
          captureMessage(`Possible function timeout: ${context.functionName}`, Severity.Warning);
        });
      }, timeoutWarningDelay);
    }

    const transaction = startTransaction({
      name: context.functionName,
      op: 'awslambda.handler',
    });
    // We put the transaction on the scope so users can attach children to it
    getCurrentHub().configureScope(scope => {
      scope.setSpan(transaction);
    });

    let rv: TResult | undefined;
    try {
      rv = await asyncHandler(event, context);
    } catch (e) {
      captureExceptionWithContext(e, context);
      if (options.rethrowAfterCapture) {
        throw e;
      }
    } finally {
      clearTimeout(timeoutWarningTimer);
      transaction.finish();
      await flush(options.flushTimeout);
    }
    return rv;
  };
}
