import type { ClientRequest, IncomingMessage, RequestOptions, ServerResponse } from 'node:http';
import type { Span } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';

import {
  addBreadcrumb,
  defineIntegration,
  getCapturedScopesOnSpan,
  getCurrentScope,
  getIsolationScope,
  setCapturedScopesOnSpan,
} from '@sentry/core';
import { getClient } from '@sentry/opentelemetry';
import type { IntegrationFn, PolymorphicRequest, Request, SanitizedRequestData } from '@sentry/types';

import {
  getBreadcrumbLogLevelFromHttpStatusCode,
  getSanitizedUrlString,
  logger,
  parseUrl,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import type { NodeClient } from '../sdk/client';
import { setIsolationScope } from '../sdk/scope';
import type { HTTPModuleRequestIncomingMessage } from '../transports/http-module';
import { addOriginToSpan } from '../utils/addOriginToSpan';
import { getRequestUrl } from '../utils/getRequestUrl';

const INTEGRATION_NAME = 'Http';

const INSTRUMENTATION_NAME = '@opentelemetry_sentry-patched/instrumentation-http';

interface HttpOptions {
  /**
   * Whether breadcrumbs should be recorded for requests.
   * Defaults to true
   */
  breadcrumbs?: boolean;

  /**
   * Do not capture spans or breadcrumbs for outgoing HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   *
   * The `url` param contains the entire URL, including query string (if any), protocol, host, etc. of the outgoing request.
   * For example: `'https://someService.com/users/details?id=123'`
   *
   * The `request` param contains the original {@type RequestOptions} object used to make the outgoing request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreOutgoingRequests?: (url: string, request: RequestOptions) => boolean;

  /**
   * Do not capture spans or breadcrumbs for incoming HTTP requests to URLs where the given callback returns `true`.
   * This controls both span & breadcrumb creation - spans will be non recording if tracing is disabled.
   *
   * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
   * For example: `'/users/details?id=123'`
   *
   * The `request` param contains the original {@type IncomingMessage} object of the incoming request.
   * You can use it to filter on additional properties like method, headers, etc.
   */
  ignoreIncomingRequests?: (urlPath: string, request: IncomingMessage) => boolean;

  /**
   * Additional instrumentation options that are passed to the underlying HttpInstrumentation.
   */
  instrumentation?: {
    requestHook?: (span: Span, req: ClientRequest | HTTPModuleRequestIncomingMessage) => void;
    responseHook?: (span: Span, response: HTTPModuleRequestIncomingMessage | ServerResponse) => void;
    applyCustomAttributesOnSpan?: (
      span: Span,
      request: ClientRequest | HTTPModuleRequestIncomingMessage,
      response: HTTPModuleRequestIncomingMessage | ServerResponse,
    ) => void;

    /**
     * You can pass any configuration through to the underlying instrumention.
     * Note that there are no semver guarantees for this!
     */
    _experimentalConfig?: ConstructorParameters<typeof HttpInstrumentation>[0];
  };

  /** Allows to pass a custom version of HttpInstrumentation. We use this for Next.js. */
  _instrumentation?: typeof HttpInstrumentation;
}

let _httpOptions: HttpOptions = {};
let _httpInstrumentation: HttpInstrumentation | undefined;

/**
 * Instrument the HTTP module.
 * This can only be instrumented once! If this called again later, we just update the options.
 */
export const instrumentHttp = Object.assign(
  function (): void {
    if (_httpInstrumentation) {
      return;
    }

    const _InstrumentationClass = _httpOptions._instrumentation || HttpInstrumentation;

    _httpInstrumentation = new _InstrumentationClass({
      ..._httpOptions.instrumentation?._experimentalConfig,
      ignoreOutgoingRequestHook: request => {
        const url = getRequestUrl(request);

        if (!url) {
          return false;
        }

        const _ignoreOutgoingRequests = _httpOptions.ignoreOutgoingRequests;
        if (_ignoreOutgoingRequests && _ignoreOutgoingRequests(url, request)) {
          return true;
        }

        return false;
      },

      ignoreIncomingRequestHook: request => {
        // request.url is the only property that holds any information about the url
        // it only consists of the URL path and query string (if any)
        const urlPath = request.url;

        const method = request.method?.toUpperCase();
        // We do not capture OPTIONS/HEAD requests as transactions
        if (method === 'OPTIONS' || method === 'HEAD') {
          return true;
        }

        const _ignoreIncomingRequests = _httpOptions.ignoreIncomingRequests;
        if (urlPath && _ignoreIncomingRequests && _ignoreIncomingRequests(urlPath, request)) {
          return true;
        }

        return false;
      },

      requireParentforOutgoingSpans: false,
      requireParentforIncomingSpans: false,
      requestHook: (span, req) => {
        addOriginToSpan(span, 'auto.http.otel.http');

        // both, incoming requests and "client" requests made within the app trigger the requestHook
        // we only want to isolate and further annotate incoming requests (IncomingMessage)
        if (_isClientRequest(req)) {
          _httpOptions.instrumentation?.requestHook?.(span, req);
          return;
        }

        const scopes = getCapturedScopesOnSpan(span);

        const isolationScope = (scopes.isolationScope || getIsolationScope()).clone();
        const scope = scopes.scope || getCurrentScope();

        const headers = req.headers;
        const host = headers.host || '<no host>';
        const protocol = req.socket && (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
        const originalUrl = req.url || '';
        const absoluteUrl = originalUrl.startsWith(protocol) ? originalUrl : `${protocol}://${host}${originalUrl}`;

        // This is non-standard, but may be set on e.g. Next.js or Express requests
        const cookies = (req as PolymorphicRequest).cookies;

        const normalizedRequest: Request = {
          url: absoluteUrl,
          method: req.method,
          query_string: extractQueryParams(req),
          headers: headersToDict(req.headers),
          cookies,
        };

        patchRequestToCaptureBody(req, normalizedRequest);

        // Update the isolation scope, isolate this request
        isolationScope.setSDKProcessingMetadata({ request: req, normalizedRequest });

        const client = getClient<NodeClient>();
        if (client && client.getOptions().autoSessionTracking) {
          isolationScope.setRequestSession({ status: 'ok' });
        }
        setIsolationScope(isolationScope);
        setCapturedScopesOnSpan(span, scope, isolationScope);

        // attempt to update the scope's `transactionName` based on the request URL
        // Ideally, framework instrumentations coming after the HttpInstrumentation
        // update the transactionName once we get a parameterized route.
        const httpMethod = (req.method || 'GET').toUpperCase();
        const httpTarget = stripUrlQueryAndFragment(req.url || '/');

        const bestEffortTransactionName = `${httpMethod} ${httpTarget}`;

        isolationScope.setTransactionName(bestEffortTransactionName);

        if (isKnownPrefetchRequest(req)) {
          span.setAttribute('sentry.http.prefetch', true);
        }

        _httpOptions.instrumentation?.requestHook?.(span, req);
      },
      responseHook: (span, res) => {
        const client = getClient<NodeClient>();
        if (client && client.getOptions().autoSessionTracking) {
          setImmediate(() => {
            client['_captureRequestSession']();
          });
        }

        _httpOptions.instrumentation?.responseHook?.(span, res);
      },
      applyCustomAttributesOnSpan: (
        span: Span,
        request: ClientRequest | HTTPModuleRequestIncomingMessage,
        response: HTTPModuleRequestIncomingMessage | ServerResponse,
      ) => {
        const _breadcrumbs = typeof _httpOptions.breadcrumbs === 'undefined' ? true : _httpOptions.breadcrumbs;
        if (_breadcrumbs) {
          _addRequestBreadcrumb(request, response);
        }

        _httpOptions.instrumentation?.applyCustomAttributesOnSpan?.(span, request, response);
      },
    });

    // We want to update the logger namespace so we can better identify what is happening here
    try {
      _httpInstrumentation['_diag'] = diag.createComponentLogger({
        namespace: INSTRUMENTATION_NAME,
      });

      // @ts-expect-error This is marked as read-only, but we overwrite it anyhow
      _httpInstrumentation.instrumentationName = INSTRUMENTATION_NAME;
    } catch {
      // ignore errors here...
    }
    addOpenTelemetryInstrumentation(_httpInstrumentation);
  },
  {
    id: INTEGRATION_NAME,
  },
);

const _httpIntegration = ((options: HttpOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      _httpOptions = options;
      instrumentHttp();
    },
  };
}) satisfies IntegrationFn;

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = defineIntegration(_httpIntegration);

/** Add a breadcrumb for outgoing requests. */
function _addRequestBreadcrumb(
  request: ClientRequest | HTTPModuleRequestIncomingMessage,
  response: HTTPModuleRequestIncomingMessage | ServerResponse,
): void {
  // Only generate breadcrumbs for outgoing requests
  if (!_isClientRequest(request)) {
    return;
  }

  const data = getBreadcrumbData(request);
  const statusCode = response.statusCode;
  const level = getBreadcrumbLogLevelFromHttpStatusCode(statusCode);

  addBreadcrumb(
    {
      category: 'http',
      data: {
        status_code: statusCode,
        ...data,
      },
      type: 'http',
      level,
    },
    {
      event: 'response',
      request,
      response,
    },
  );
}

function getBreadcrumbData(request: ClientRequest): Partial<SanitizedRequestData> {
  try {
    // `request.host` does not contain the port, but the host header does
    const host = request.getHeader('host') || request.host;
    const url = new URL(request.path, `${request.protocol}//${host}`);
    const parsedUrl = parseUrl(url.toString());

    const data: Partial<SanitizedRequestData> = {
      url: getSanitizedUrlString(parsedUrl),
      'http.method': request.method || 'GET',
    };

    if (parsedUrl.search) {
      data['http.query'] = parsedUrl.search;
    }
    if (parsedUrl.hash) {
      data['http.fragment'] = parsedUrl.hash;
    }

    return data;
  } catch {
    return {};
  }
}

/**
 * Determines if @param req is a ClientRequest, meaning the request was created within the express app
 * and it's an outgoing request.
 * Checking for properties instead of using `instanceOf` to avoid importing the request classes.
 */
function _isClientRequest(req: ClientRequest | HTTPModuleRequestIncomingMessage): req is ClientRequest {
  return 'outputData' in req && 'outputSize' in req && !('client' in req) && !('statusCode' in req);
}

/**
 * Detects if an incoming request is a prefetch request.
 */
function isKnownPrefetchRequest(req: HTTPModuleRequestIncomingMessage): boolean {
  // Currently only handles Next.js prefetch requests but may check other frameworks in the future.
  return req.headers['next-router-prefetch'] === '1';
}

/**
 * This method patches the request object to capture the body.
 * Instead of actually consuming the streamed body ourselves, which has potential side effects,
 * we monkey patch `req.on('data')` to intercept the body chunks.
 * This way, we only read the body if the user also consumes the body, ensuring we do not change any behavior in unexpected ways.
 */
function patchRequestToCaptureBody(req: HTTPModuleRequestIncomingMessage, normalizedRequest: Request): void {
  const chunks: Buffer[] = [];

  /**
   * We need to keep track of the original callbacks, in order to be able to remove listeners again.
   * Since `off` depends on having the exact same function reference passed in, we need to be able to map
   * original listeners to our wrapped ones.
   */
  const callbackMap = new WeakMap();

  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.on = new Proxy(req.on, {
      apply: (target, thisArg, args: Parameters<typeof req.on>) => {
        const [event, listener, ...restArgs] = args;

        if (event === 'data') {
          const callback = new Proxy(listener, {
            apply: (target, thisArg, args: Parameters<typeof listener>) => {
              const chunk = args[0];
              chunks.push(chunk);
              return Reflect.apply(target, thisArg, args);
            },
          });

          callbackMap.set(listener, callback);

          return Reflect.apply(target, thisArg, [event, callback, ...restArgs]);
        }

        if (event === 'end') {
          const callback = new Proxy(listener, {
            apply: (target, thisArg, args) => {
              try {
                const body = Buffer.concat(chunks).toString('utf-8');

                // We mutate the passed in normalizedRequest and add the body to it
                if (body) {
                  normalizedRequest.data = body;
                }
              } catch {
                // ignore errors here
              }

              return Reflect.apply(target, thisArg, args);
            },
          });

          callbackMap.set(listener, callback);

          return Reflect.apply(target, thisArg, [event, callback, ...restArgs]);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });

    // Ensure we also remove callbacks correctly
    // eslint-disable-next-line @typescript-eslint/unbound-method
    req.off = new Proxy(req.off, {
      apply: (target, thisArg, args: Parameters<typeof req.off>) => {
        const [, listener] = args;

        const callback = callbackMap.get(listener);
        if (callback) {
          callbackMap.delete(listener);

          const modifiedArgs = args.slice();
          modifiedArgs[1] = callback;
          return Reflect.apply(target, thisArg, modifiedArgs);
        }

        return Reflect.apply(target, thisArg, args);
      },
    });
  } catch {
    // ignore errors if we can't patch stuff
  }
}

function extractQueryParams(req: IncomingMessage): string | undefined {
  // url (including path and query string):
  let originalUrl = req.url || '';

  if (!originalUrl) {
    return;
  }

  // The `URL` constructor can't handle internal URLs of the form `/some/path/here`, so stick a dummy protocol and
  // hostname on the beginning. Since the point here is just to grab the query string, it doesn't matter what we use.
  if (originalUrl.startsWith('/')) {
    originalUrl = `http://dogs.are.great${originalUrl}`;
  }

  try {
    const queryParams = new URL(originalUrl).search.slice(1);
    return queryParams.length ? queryParams : undefined;
  } catch {
    return undefined;
  }
}

function headersToDict(reqHeaders: Record<string, string | string[] | undefined>): Record<string, string> {
  const headers: Record<string, string> = {};

  try {
    Object.entries(reqHeaders).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    });
  } catch (e) {
    DEBUG_BUILD &&
      logger.warn('Sentry failed extracting headers from a request object. If you see this, please file an issue.');
  }

  return headers;
}
