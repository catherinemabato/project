/* eslint-disable @typescript-eslint/no-explicit-any */

import { getCurrentHub } from '@sentry/hub';
import { Primitive, TraceparentData, Transaction, TransactionContext, TransactionSource } from '@sentry/types';
import {
  extractTraceparentData,
  getGlobalObject,
  logger,
  parseBaggageHeader,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import type { NEXT_DATA as NextData } from 'next/dist/next-server/lib/utils';
import { default as Router } from 'next/router';
import type { ParsedUrlQuery } from 'querystring';

const global = getGlobalObject<Window>();

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

declare const __INJECTED_ROUTE_TABLE__: { [parameterizedRoute: string]: string } | undefined;
const routeTable = typeof __INJECTED_ROUTE_TABLE__ === 'undefined' ? undefined : __INJECTED_ROUTE_TABLE__;

/**
 * Describes data located in the __NEXT_DATA__ script tag. This tag is present on every page of a Next.js app.
 */
interface SentryEnhancedNextData extends NextData {
  props: {
    pageProps?: {
      _sentryTraceData?: string; // trace parent info, if injected by a data-fetcher
      _sentryBaggage?: string; // baggage, if injected by a data-fetcher
      // These two values are only injected by `getStaticProps` in a very special case with the following conditions:
      // 1. The page's `getStaticPaths` method must have returned `fallback: 'blocking'`.
      // 2. The requested page must be a "miss" in terms of "Incremental Static Regeneration", meaning the requested page has not been generated before.
      // In this case, a page is requested and only served when `getStaticProps` is done. There is not even a fallback page or similar.
    };
  };
}

interface NextDataTagInfo {
  route?: string;
  traceParentData?: TraceparentData;
  baggage?: string;
  params?: ParsedUrlQuery;
}

/**
 * Every Next.js page (static and dynamic ones) comes with a script tag with the id "__NEXT_DATA__". This script tag
 * contains a JSON object with data that was either generated at build time for static pages (`getStaticProps`), or at
 * runtime with data fetchers like `getServerSideProps.`.
 *
 * We can use this information to:
 * - Always get the parameterized route we're in when loading a page.
 * - Send trace information (trace-id, baggage) from the server to the client.
 *
 * This function extracts this information.
 */
function extractNextDataTagInformation(): NextDataTagInfo {
  let nextData: SentryEnhancedNextData | undefined;
  // Let's be on the safe side and actually check first if there is really a __NEXT_DATA__ script tag on the page.
  // Theoretically this should always be the case though.
  const nextDataTag = global.document.getElementById('__NEXT_DATA__');
  if (nextDataTag && nextDataTag.innerHTML) {
    try {
      nextData = JSON.parse(nextDataTag.innerHTML);
    } catch (e) {
      __DEBUG_BUILD__ && logger.warn('Could not extract __NEXT_DATA__');
    }
  }

  if (!nextData) {
    return {};
  }

  const nextDataTagInfo: NextDataTagInfo = {};

  const { page, query, props } = nextData;

  // `nextData.page` always contains the parameterized route - except for when an error occurs in a data fetching
  // function, then it is "/_error", but that isn't a problem since users know which route threw by looking at the
  // parent transaction
  nextDataTagInfo.route = page;
  nextDataTagInfo.params = query;

  if (props && props.pageProps) {
    if (props.pageProps._sentryBaggage) {
      nextDataTagInfo.baggage = props.pageProps._sentryBaggage;
    }

    if (props.pageProps._sentryTraceData) {
      nextDataTagInfo.traceParentData = extractTraceparentData(props.pageProps._sentryTraceData);
    }
  }

  return nextDataTagInfo;
}

const DEFAULT_TAGS = {
  'routing.instrumentation': 'next-router',
} as const;

let activeTransaction: Transaction | undefined = undefined;

// We keep track of the previous transaction name so we can set the `from` field on navigation transactions.
let prevTransactionName: string | undefined = undefined;

const client = getCurrentHub().getClient();

/**
 * Creates routing instrumention for Next Router. Only supported for
 * client side routing. Works for Next >= 10.
 *
 * Leverages the SingletonRouter from the `next/router` to
 * generate pageload/navigation transactions and parameterize
 * transaction names.
 */
export function nextRouterInstrumentation(
  startTransactionCb: StartTransactionCb,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  if (startTransactionOnPageLoad) {
    const { route, traceParentData, baggage, params } = extractNextDataTagInformation();

    prevTransactionName = route || global.location.pathname;

    const source = route ? 'route' : 'url';

    activeTransaction = startTransactionCb({
      name: prevTransactionName,
      op: 'pageload',
      tags: DEFAULT_TAGS,
      ...(params && client && client.getOptions().sendDefaultPii && { data: params }),
      ...traceParentData,
      metadata: {
        source,
        ...(baggage && { baggage: parseBaggageHeader(baggage) }),
      },
    });
  }

  if (startTransactionOnLocationChange) {
    Router.events.on('routeChangeStart', (pathname: string) => {
      function getNavigationTargetName(): [string, TransactionSource] {
        if (routeTable) {
          const match = Object.entries(routeTable).find(([, routeRegExpr]) => {
            return pathname.match(new RegExp(routeRegExpr));
          });

          if (match) {
            return [match[0], 'route'];
          } else {
            return [stripUrlQueryAndFragment(pathname), 'route'];
          }
        } else {
          return [stripUrlQueryAndFragment(pathname), 'url'];
        }
      }

      const [newTransactionName, source] = getNavigationTargetName();

      if (activeTransaction) {
        activeTransaction.finish();
      }

      const tags: Record<string, Primitive> = {
        ...DEFAULT_TAGS,
        from: prevTransactionName,
      };

      prevTransactionName = newTransactionName;

      startTransactionCb({
        name: newTransactionName,
        op: 'navigation',
        tags,
        metadata: { source },
      });
    });
  }
}
