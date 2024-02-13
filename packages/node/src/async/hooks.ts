import type { Carrier } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy } from '@sentry/core';
import type { Hub } from '@sentry/types';
import * as async_hooks from 'async_hooks';

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

type AsyncLocalStorageConstructor = { new <T>(): AsyncLocalStorage<T> };
// AsyncLocalStorage only exists in async_hook after Node v12.17.0 or v13.10.0
type NewerAsyncHooks = typeof async_hooks & { AsyncLocalStorage: AsyncLocalStorageConstructor };

let asyncStorage: AsyncLocalStorage<Hub>;

/**
 * Sets the async context strategy to use AsyncLocalStorage which requires Node v12.17.0 or v13.10.0.
 */
export function setHooksAsyncContextStrategy(): void {
  if (!asyncStorage) {
    asyncStorage = new (async_hooks as NewerAsyncHooks).AsyncLocalStorage<Hub>();
  }

  function getCurrentHub(): Hub | undefined {
    return asyncStorage.getStore();
  }

  function createNewHub(parent: Hub | undefined): Hub {
    const carrier: Carrier = {};
    ensureHubOnCarrier(carrier, parent);
    return getHubFromCarrier(carrier);
  }

  function runWithAsyncContext<T>(callback: () => T): T {
    const existingHub = getCurrentHub();

    const newHub = createNewHub(existingHub);

    return asyncStorage.run(newHub, () => {
      return callback();
    });
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}
