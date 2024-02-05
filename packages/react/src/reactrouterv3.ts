import {
  WINDOW,
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import type {
  Integration,
  SpanAttributes,
  StartSpanOptions,
  Transaction,
  TransactionContext,
  TransactionSource,
} from '@sentry/types';

import type { Location, ReactRouterInstrumentation } from './types';

// Many of the types below had to be mocked out to prevent typescript issues
// these types are required for correct functionality.

type HistoryV3 = {
  location?: Location;
  listen?(cb: (location: Location) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, any>;

export type Route = { path?: string; childRoutes?: Route[] };

export type Match = (
  props: { location: Location; routes: Route[] },
  cb: (error?: Error, _redirectLocation?: Location, renderProps?: { routes?: Route[] }) => void,
) => void;

type ReactRouterV3TransactionSource = Extract<TransactionSource, 'url' | 'route'>;

interface ReactRouterOptions {
  history: HistoryV3;
  routes: Route[];
  match: Match;
}

/**
 * A browser tracing integration that uses React Router v3 to instrument navigations.
 * Expects `history` (and optionally `routes` and `matchPath`) to be passed as options.
 */
export function browserTracingReactRouterV3Integration(
  options: Parameters<typeof browserTracingIntegration>[0] & ReactRouterOptions,
): Integration {
  const integration = browserTracingIntegration({
    ...options,
    instrumentPageLoad: false,
    instrumentNavigation: false,
  });

  const { history, routes, match, instrumentPageLoad = true, instrumentNavigation = true } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      const startPageloadCallback = (startSpanOptions: StartSpanOptions): undefined => {
        startBrowserTracingPageLoadSpan(client, startSpanOptions);
        return undefined;
      };

      const startNavigationCallback = (startSpanOptions: StartSpanOptions): undefined => {
        startBrowserTracingNavigationSpan(client, startSpanOptions);
        return undefined;
      };

      // eslint-disable-next-line deprecation/deprecation
      const instrumentation = reactRouterV3Instrumentation(history, routes, match);

      // Now instrument page load & navigation with correct settings
      instrumentation(startPageloadCallback, instrumentPageLoad, false);
      instrumentation(startNavigationCallback, false, instrumentNavigation);
    },
  };
}

/**
 * Creates routing instrumentation for React Router v3
 * Works for React Router >= 3.2.0 and < 4.0.0
 *
 * @param history object from the `history` library
 * @param routes a list of all routes, should be
 * @param match `Router.match` utility
 *
 * @deprecated Use `browserTracingReactRouterV3Integration()` instead
 */
export function reactRouterV3Instrumentation(
  history: HistoryV3,
  routes: Route[],
  match: Match,
): ReactRouterInstrumentation {
  return (
    startTransaction: (context: TransactionContext) => Transaction | undefined,
    startTransactionOnPageLoad: boolean = true,
    startTransactionOnLocationChange: boolean = true,
  ) => {
    let activeTransaction: Transaction | undefined;
    let prevName: string | undefined;

    // Have to use window.location because history.location might not be defined.
    if (startTransactionOnPageLoad && WINDOW && WINDOW.location) {
      normalizeTransactionName(
        routes,
        WINDOW.location as unknown as Location,
        match,
        (localName: string, source: ReactRouterV3TransactionSource = 'url') => {
          prevName = localName;
          activeTransaction = startTransaction({
            name: prevName,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'pageload',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.react.reactrouter_v3',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
            },
          });
        },
      );
    }

    if (startTransactionOnLocationChange && history.listen) {
      history.listen(location => {
        if (location.action === 'PUSH' || location.action === 'POP') {
          if (activeTransaction) {
            activeTransaction.end();
          }
          const from = prevName;
          normalizeTransactionName(routes, location, match, (localName: string, source: TransactionSource = 'url') => {
            prevName = localName;

            const attributes: SpanAttributes = {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react.reactrouter_v3',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
            };

            if (from) {
              attributes.from = from;
            }

            activeTransaction = startTransaction({
              name: prevName,
              attributes,
            });
          });
        }
      });
    }
  };
}

/**
 * Normalize transaction names using `Router.match`
 */
function normalizeTransactionName(
  appRoutes: Route[],
  location: Location,
  match: Match,
  callback: (pathname: string, source?: ReactRouterV3TransactionSource) => void,
): void {
  let name = location.pathname;
  match(
    {
      location,
      routes: appRoutes,
    },
    (error, _redirectLocation, renderProps) => {
      if (error || !renderProps) {
        return callback(name);
      }

      const routePath = getRouteStringFromRoutes(renderProps.routes || []);
      if (routePath.length === 0 || routePath === '/*') {
        return callback(name);
      }

      name = routePath;
      return callback(name, 'route');
    },
  );
}

/**
 * Generate route name from array of routes
 */
function getRouteStringFromRoutes(routes: Route[]): string {
  if (!Array.isArray(routes) || routes.length === 0) {
    return '';
  }

  const routesWithPaths: Route[] = routes.filter((route: Route) => !!route.path);

  let index = -1;
  for (let x = routesWithPaths.length - 1; x >= 0; x--) {
    const route = routesWithPaths[x];
    if (route.path && route.path.startsWith('/')) {
      index = x;
      break;
    }
  }

  return routesWithPaths
    .slice(index)
    .filter(({ path }) => !!path)
    .map(({ path }) => path)
    .join('');
}
