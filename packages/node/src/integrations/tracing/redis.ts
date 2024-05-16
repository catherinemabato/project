import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import {
  SEMANTIC_ATTRIBUTE_CACHE_HIT,
  SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  defineIntegration,
  spanToJSON,
} from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

function keyHasPrefix(key: string, prefixes: string[]): boolean {
  return prefixes.some(prefix => key.startsWith(prefix));
}

/** Currently, caching only supports 'get' and 'set' commands. More commands will be added (setex, mget, del, expire) */
function shouldConsiderForCache(
  redisCommand: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  key: string | number | any[] | Buffer,
  prefixes: string[],
): boolean {
  return (redisCommand === 'get' || redisCommand === 'set') && typeof key === 'string' && keyHasPrefix(key, prefixes);
}

function calculateCacheItemSize(response: unknown): number {
  try {
    if (Buffer.isBuffer(response)) return response.byteLength;
    else if (typeof response === 'string') return response.length;
    else if (typeof response === 'number') return response.toString().length;
    else if (response === null || response === undefined) return 0;
    return JSON.stringify(response).length;
  } catch (e) {
    return 0;
  }
}

interface RedisOptions {
  cachePrefixes?: string[];
}

const _redisIntegration = ((options?: RedisOptions) => {
  return {
    name: 'Redis',
    setupOnce() {
      addOpenTelemetryInstrumentation([
        new IORedisInstrumentation({
          responseHook: (span, redisCommand, cmdArgs, response) => {
            const key = cmdArgs[0];

            if (!options?.cachePrefixes || !shouldConsiderForCache(redisCommand, key, options.cachePrefixes)) {
              // not relevant for cache
              return;
            }

            const networkPeerAddress = spanToJSON(span).data?.['net.peer.name'];
            const networkPeerPort = spanToJSON(span).data?.['net.peer.port'];
            span.setAttributes({ 'network.peer.address': networkPeerAddress, 'network.peer.port': networkPeerPort });

            const cacheItemSize = calculateCacheItemSize(response);
            span.setAttribute(SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE, cacheItemSize);

            if (typeof key === 'string') {
              switch (redisCommand) {
                case 'get':
                  span.setAttributes({
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.get_item',
                    [SEMANTIC_ATTRIBUTE_CACHE_KEY]: key,
                    [SEMANTIC_ATTRIBUTE_CACHE_HIT]: cacheItemSize > 0,
                  });
                  break;
                case 'set':
                  span.setAttributes({
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'cache.put',
                    [SEMANTIC_ATTRIBUTE_CACHE_KEY]: key,
                  });
                  break;
              }
            }
          },
        }),
        // todo: implement them gradually
        // new LegacyRedisInstrumentation({}),
        // new RedisInstrumentation({}),
      ]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Redis integration for "ioredis"
 *
 * Capture tracing data for redis and ioredis.
 */
export const redisIntegration = defineIntegration(_redisIntegration);
