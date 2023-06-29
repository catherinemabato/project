import ApplicationInstance from '@ember/application/instance';
import { run, _backburner, scheduleOnce } from '@ember/runloop';
import { subscribe } from '@ember/instrumentation';
import * as Sentry from '@sentry/browser';
import { ExtendedBackburner } from '@sentry/ember/runloop';
import { Span, Transaction } from '@sentry/types';
import { EmberRunQueues } from '@ember/runloop/-private/types';
import { getActiveTransaction } from '..';
import { browserPerformanceTimeOrigin, GLOBAL_OBJ, timestampInSeconds } from '@sentry/utils';
import { macroCondition, isTesting, getOwnConfig } from '@embroider/macros';
import { EmberSentryConfig, GlobalConfig, OwnConfig } from '../types';
import RouterService from '@ember/routing/router-service';
import type { BaseClient } from '@sentry/core';

function getSentryConfig() {
  const _global = GLOBAL_OBJ as typeof GLOBAL_OBJ & GlobalConfig;
  _global.__sentryEmberConfig = _global.__sentryEmberConfig ?? {};
  const environmentConfig = getOwnConfig<OwnConfig>().sentryConfig;
  if (!environmentConfig.sentry) {
    environmentConfig.sentry = {
      browserTracingOptions: {},
    };
  }
  Object.assign(environmentConfig.sentry, _global.__sentryEmberConfig);
  return environmentConfig;
}

export function initialize(appInstance: ApplicationInstance): void {
  // Disable in fastboot - we only want to run Sentry client-side
  const fastboot = appInstance.lookup('service:fastboot') as unknown as { isFastBoot: boolean } | undefined;
  if (fastboot?.isFastBoot) {
    return;
  }

  const config = getSentryConfig();
  if (config['disablePerformance']) {
    return;
  }
  const performancePromise = instrumentForPerformance(appInstance);
  if (macroCondition(isTesting())) {
    (<any>window)._sentryPerformanceLoad = performancePromise;
  }
}

function getBackburner(): Pick<ExtendedBackburner, 'on' | 'off'> {
  if (_backburner) {
    return _backburner as unknown as Pick<ExtendedBackburner, 'on' | 'off'>;
  }

  if ((run as unknown as { backburner?: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner) {
    return (run as unknown as { backburner: Pick<ExtendedBackburner, 'on' | 'off'> }).backburner;
  }

  return {
    on() {},
    off() {},
  };
}

function getTransitionInformation(transition: any, router: any) {
  const fromRoute = transition?.from?.name;
  const toRoute = transition && transition.to ? transition.to.name : router.currentRouteName;
  return {
    fromRoute,
    toRoute,
  };
}

function getLocationURL(location: any) {
  if (!location || !location.getURL || !location.formatURL) {
    return '';
  }
  const url = location.formatURL(location.getURL());

  if (location.implementation === 'hash') {
    return `${location.rootURL}${url}`;
  }
  return url;
}

export function _instrumentEmberRouter(
  routerService: any,
  routerMain: any,
  config: EmberSentryConfig,
  startTransaction: Function,
  startTransactionOnPageLoad?: boolean,
) {
  const { disableRunloopPerformance } = config;
  const location = routerMain.location;
  let activeTransaction: Transaction;
  let transitionSpan: Span;

  const url = getLocationURL(location);

  if (macroCondition(isTesting())) {
    routerService._sentryInstrumented = true;
    routerService._startTransaction = startTransaction;
  }

  if (startTransactionOnPageLoad && url) {
    const routeInfo = routerService.recognize(url);
    activeTransaction = startTransaction({
      name: `route:${routeInfo.name}`,
      op: 'pageload',
      tags: {
        url,
        toRoute: routeInfo.name,
        'routing.instrumentation': '@sentry/ember',
      },
    });
  }

  const finishActiveTransaction = function (_: any, nextInstance: any) {
    if (nextInstance) {
      return;
    }
    activeTransaction.finish();
    getBackburner().off('end', finishActiveTransaction);
  };

  routerService.on('routeWillChange', (transition: any) => {
    const { fromRoute, toRoute } = getTransitionInformation(transition, routerService);
    activeTransaction?.finish();
    activeTransaction = startTransaction({
      name: `route:${toRoute}`,
      op: 'navigation',
      tags: {
        fromRoute,
        toRoute,
        'routing.instrumentation': '@sentry/ember',
      },
    });
    transitionSpan = activeTransaction.startChild({
      op: 'ui.ember.transition',
      description: `route:${fromRoute} -> route:${toRoute}`,
    });
  });

  routerService.on('routeDidChange', () => {
    if (!transitionSpan || !activeTransaction) {
      return;
    }
    transitionSpan.finish();

    if (disableRunloopPerformance) {
      activeTransaction.finish();
      return;
    }

    getBackburner().on('end', finishActiveTransaction);
  });

  return {
    startTransaction,
  };
}

function _instrumentEmberRunloop(config: EmberSentryConfig) {
  const { disableRunloopPerformance, minimumRunloopQueueDuration } = config;
  if (disableRunloopPerformance) {
    return;
  }

  let currentQueueStart: number | undefined;
  let currentQueueSpan: Span | undefined;
  const instrumentedEmberQueues = [
    'actions',
    'routerTransitions',
    'render',
    'afterRender',
    'destroy',
  ] as EmberRunQueues[];

  getBackburner().on('begin', (_: any, previousInstance: any) => {
    if (previousInstance) {
      return;
    }
    const activeTransaction = getActiveTransaction();
    if (!activeTransaction) {
      return;
    }
    if (currentQueueSpan) {
      currentQueueSpan.finish();
    }
    currentQueueStart = timestampInSeconds();

    instrumentedEmberQueues.forEach(queue => {
      scheduleOnce(queue, null, () => {
        scheduleOnce(queue, null, () => {
          // Process this queue using the end of the previous queue.
          if (currentQueueStart) {
            const now = timestampInSeconds();
            const minQueueDuration = minimumRunloopQueueDuration ?? 5;

            if ((now - currentQueueStart) * 1000 >= minQueueDuration) {
              activeTransaction
                ?.startChild({
                  op: `ui.ember.runloop.${queue}`,
                  startTimestamp: currentQueueStart,
                  endTimestamp: now,
                })
                .finish();
            }
            currentQueueStart = undefined;
          }

          // Setup for next queue

          const stillActiveTransaction = getActiveTransaction();
          if (!stillActiveTransaction) {
            return;
          }
          currentQueueStart = timestampInSeconds();
        });
      });
    });
  });
  getBackburner().on('end', (_: any, nextInstance: any) => {
    if (nextInstance) {
      return;
    }
    if (currentQueueSpan) {
      currentQueueSpan.finish();
      currentQueueSpan = undefined;
    }
  });
}

type Payload = {
  containerKey: string;
  initialRender: true;
  object: string;
};

type RenderEntry = {
  payload: Payload;
  now: number;
};

interface RenderEntries {
  [name: string]: RenderEntry;
}

function processComponentRenderBefore(payload: Payload, beforeEntries: RenderEntries) {
  const info = {
    payload,
    now: timestampInSeconds(),
  };
  beforeEntries[payload.object] = info;
}

function processComponentRenderAfter(
  payload: Payload,
  beforeEntries: RenderEntries,
  op: string,
  minComponentDuration: number,
) {
  const begin = beforeEntries[payload.object];

  if (!begin) {
    return;
  }

  const now = timestampInSeconds();
  const componentRenderDuration = now - begin.now;

  if (componentRenderDuration * 1000 >= minComponentDuration) {
    const activeTransaction = getActiveTransaction();

    activeTransaction?.startChild({
      op,
      description: payload.containerKey || payload.object,
      startTimestamp: begin.now,
      endTimestamp: now,
    });
  }
}

function _instrumentComponents(config: EmberSentryConfig) {
  const { disableInstrumentComponents, minimumComponentRenderDuration, enableComponentDefinitions } = config;
  if (disableInstrumentComponents) {
    return;
  }

  const minComponentDuration = minimumComponentRenderDuration ?? 2;

  const beforeEntries = {} as RenderEntries;
  const beforeComponentDefinitionEntries = {} as RenderEntries;

  function _subscribeToRenderEvents() {
    subscribe('render.component', {
      before(_name: string, _timestamp: number, payload: Payload) {
        processComponentRenderBefore(payload, beforeEntries);
      },

      after(_name: string, _timestamp: number, payload: any, _beganIndex: number) {
        processComponentRenderAfter(payload, beforeEntries, 'ui.ember.component.render', minComponentDuration);
      },
    });
    if (enableComponentDefinitions) {
      subscribe('render.getComponentDefinition', {
        before(_name: string, _timestamp: number, payload: Payload) {
          processComponentRenderBefore(payload, beforeComponentDefinitionEntries);
        },

        after(_name: string, _timestamp: number, payload: any, _beganIndex: number) {
          processComponentRenderAfter(payload, beforeComponentDefinitionEntries, 'ui.ember.component.definition', 0);
        },
      });
    }
  }
  _subscribeToRenderEvents();
}

function _instrumentInitialLoad(config: EmberSentryConfig) {
  const startName = '@sentry/ember:initial-load-start';
  const endName = '@sentry/ember:initial-load-end';

  let { HAS_PERFORMANCE, HAS_PERFORMANCE_TIMING } = _hasPerformanceSupport();

  if (!HAS_PERFORMANCE) {
    return;
  }

  const { performance } = window;

  if (config.disableInitialLoadInstrumentation) {
    performance.clearMarks(startName);
    performance.clearMarks(endName);
    return;
  }

  // Split performance check in two so clearMarks still happens even if timeOrigin isn't available.
  if (!HAS_PERFORMANCE_TIMING) {
    return;
  }
  const measureName = '@sentry/ember:initial-load';

  const startMarkExists = performance.getEntriesByName(startName).length > 0;
  const endMarkExists = performance.getEntriesByName(endName).length > 0;
  if (!startMarkExists || !endMarkExists) {
    return;
  }

  performance.measure(measureName, startName, endName);
  const measures = performance.getEntriesByName(measureName);
  const measure = measures[0]!;

  const startTimestamp = (measure.startTime + browserPerformanceTimeOrigin!) / 1000;
  const endTimestamp = startTimestamp + measure.duration / 1000;

  const transaction = getActiveTransaction();
  const span = transaction?.startChild({
    op: 'ui.ember.init',
    startTimestamp,
  });
  span?.finish(endTimestamp);
  performance.clearMarks(startName);
  performance.clearMarks(endName);

  performance.clearMeasures(measureName);
}

function _hasPerformanceSupport() {
  // TS says that all of these methods are always available, but some of them may not be supported in older browsers
  // So we "pretend" they are all optional in order to be able to check this properly without TS complaining
  const _performance = window.performance as {
    clearMarks?: Performance['clearMarks'];
    clearMeasures?: Performance['clearMeasures'];
    measure?: Performance['measure'];
    getEntriesByName?: Performance['getEntriesByName'];
  };
  const HAS_PERFORMANCE = Boolean(_performance && _performance.clearMarks && _performance.clearMeasures);
  const HAS_PERFORMANCE_TIMING = Boolean(
    _performance.measure && _performance.getEntriesByName && browserPerformanceTimeOrigin !== undefined,
  );

  return {
    HAS_PERFORMANCE,
    HAS_PERFORMANCE_TIMING,
  };
}

export async function instrumentForPerformance(appInstance: ApplicationInstance) {
  const config = getSentryConfig();
  const sentryConfig = config.sentry;
  // Maintaining backwards compatibility with config.browserTracingOptions, but passing it with Sentry options is preferred.
  const browserTracingOptions = config.browserTracingOptions || config.sentry.browserTracingOptions || {};

  const { BrowserTracing } = await import('@sentry/browser');

  const idleTimeout = config.transitionTimeout || 5000;

  const browserTracing = new BrowserTracing({
    routingInstrumentation: (customStartTransaction, startTransactionOnPageLoad) => {
      const routerMain = appInstance.lookup('router:main');
      let routerService = appInstance.lookup('service:router') as
        | RouterService & { externalRouter?: RouterService; _hasMountedSentryPerformanceRouting?: boolean };

      if (routerService.externalRouter) {
        // Using ember-engines-router-service in an engine.
        routerService = routerService.externalRouter;
      }
      if (routerService._hasMountedSentryPerformanceRouting) {
        // Routing listens to route changes on the main router, and should not be initialized multiple times per page.
        return;
      }
      if (!routerService.recognize) {
        // Router is missing critical functionality to limit cardinality of the transaction names.
        return;
      }
      routerService._hasMountedSentryPerformanceRouting = true;
      _instrumentEmberRouter(routerService, routerMain, config, customStartTransaction, startTransactionOnPageLoad);
    },
    idleTimeout,
    ...browserTracingOptions,
  });

  if (macroCondition(isTesting())) {
    const client = Sentry.getCurrentHub().getClient();

    if (
      client &&
      (client as BaseClient<any>).getIntegrationById &&
      (client as BaseClient<any>).getIntegrationById('BrowserTracing')
    ) {
      // Initializers are called more than once in tests, causing the integrations to not be setup correctly.
      return;
    }
  }

  const client = Sentry.getCurrentHub().getClient();
  if (client && client.addIntegration) {
    client.addIntegration(browserTracing);
  }

  _instrumentEmberRunloop(config);
  _instrumentComponents(config);
  _instrumentInitialLoad(config);
}

export default {
  initialize,
};
