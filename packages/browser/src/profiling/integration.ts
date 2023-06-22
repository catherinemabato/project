import type { EventProcessor, Hub, Integration, Transaction } from '@sentry/types';
import type { Profile } from '@sentry/types/src/profiling';
import { logger } from '@sentry/utils';

import type { BrowserClient } from './../client';
import { wrapTransactionWithProfiling } from './hubextensions';
import type { ProfiledEvent } from './utils';
import {
  addProfilesToEnvelope,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
  PROFILE_QUEUE,
} from './utils';

/**
 * Browser profiling integration. Stores any event that has contexts["profile"]["profile_id"]
 * This exists because we do not want to await async profiler.stop calls as transaction.finish is called
 * in a synchronous context. Instead, we handle sending the profile async from the promise callback and
 * rely on being able to pull the event from the cache when we need to construct the envelope. This makes the
 * integration less reliable as we might be dropping profiles when the cache is full.
 *
 * @experimental
 */
export class BrowserProfilingIntegration implements Integration {
  public readonly name: string = 'BrowserProfilingIntegration';
  public getCurrentHub?: () => Hub = undefined;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this.getCurrentHub = getCurrentHub;
    const client = this.getCurrentHub().getClient() as BrowserClient;

    if (client && typeof client.on === 'function') {
      client.on('startTransaction', (transaction: Transaction) => {
        wrapTransactionWithProfiling(transaction);
      });

      client.on('beforeEnvelope', (envelope): void => {
        // if not profiles are in queue, there is nothing to add to the envelope.

        if (!PROFILE_QUEUE.length) {
          return;
        }

        const profiledTransactionEvents = findProfiledTransactionsFromEnvelope(envelope);
        if (!profiledTransactionEvents.length) {
          return;
        }

        const profilesToAddToEnvelope: Profile[] = [];

        for (const profiledTransaction of profiledTransactionEvents) {
          const profile_id =
            profiledTransaction &&
            profiledTransaction.contexts &&
            profiledTransaction.contexts['profile'] &&
            profiledTransaction.contexts['profile']['profile_id'];

          if (!profile_id) {
            throw new TypeError('[Profiling] cannot find profile for a transaction without a profile context');
          }

          // Remove the profile from the transaction context before sending, relay will take care of the rest.
          if (profiledTransaction && profiledTransaction.contexts && profiledTransaction.contexts['.profile']) {
            delete profiledTransaction.contexts.profile;
          }

          // We need to find both a profile and a transaction event for the same profile_id.
          const profileIndex = PROFILE_QUEUE.findIndex(p => p.profile_id === profile_id);
          if (profileIndex === -1) {
            __DEBUG_BUILD__ && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          const cpuProfile = PROFILE_QUEUE[profileIndex];
          if (!cpuProfile) {
            __DEBUG_BUILD__ && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
            continue;
          }

          // Remove the profile from the queue.
          PROFILE_QUEUE.splice(profileIndex, 1);
          const profileEvent = createProfilingEvent(cpuProfile, profiledTransaction as ProfiledEvent);

          if (profileEvent) {
            profilesToAddToEnvelope.push(profileEvent);
          }
        }

        addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
      });
    } else {
      logger.warn('[Profiling] Client does not support hooks, profiling will be disabled');
    }
  }
}
