import { getGlobalObject } from '@sentry/utils/misc';
import { API_VERSION, Hub } from './hub';
import { Carrier } from './interfaces';

/** Returns the global shim registry. */
export function getMainCarrier(): Carrier {
  const carrier: any = getGlobalObject();
  carrier.__SENTRY__ = carrier.__SENTRY__ || {
    hub: undefined,
  };
  return carrier.__SENTRY__;
}

/**
 * Replaces the current main hub with the passed one on the global object
 *
 * @returns The old replaced hub
 */
export function makeMain(hub?: Hub): Hub | undefined {
  const registry = getMainCarrier();
  const oldHub = registry.hub;
  registry.hub = hub;
  return oldHub;
}

/**
 * Returns the default hub instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 */
export function getCurrentHub(): Hub {
  const registry = getMainCarrier();

  if (!registry.hub || registry.hub.isOlderThan(API_VERSION)) {
    registry.hub = new Hub();
  }

  return registry.hub;
}

/**
 * This will create a new {@link Hub} and add to the passed object on
 * __SENTRY__.hub.
 * @param carrier object
 */
export function getHubFromCarrier(carrier: any): Hub {
  if (carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub) {
    return carrier.__SENTRY__.hub;
  } else {
    carrier.__SENTRY__ = {};
    carrier.__SENTRY__.hub = new Hub();
    return carrier.__SENTRY__.hub;
  }
}
