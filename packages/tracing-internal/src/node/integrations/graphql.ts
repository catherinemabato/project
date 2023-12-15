import type { Hub } from '@sentry/core';
import type { EventProcessor } from '@sentry/types';
import { fill, isThenable, loadModule, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../../common/debug-build';
import type { LazyLoadedIntegration } from './lazy';
import { shouldDisableAutoInstrumentation } from './utils/node-utils';

type GraphQLModule = {
  [method: string]: (...args: unknown[]) => unknown;
};

/** Tracing integration for graphql package */
export class GraphQL implements LazyLoadedIntegration<GraphQLModule> {
  /**
   * @inheritDoc
   */
  public static id = 'GraphQL';

  /**
   * @inheritDoc
   */
  public name: string;

  private _module?: GraphQLModule;

  public constructor() {
    this.name = GraphQL.id;
  }

  /** @inheritdoc */
  public loadDependency(): GraphQLModule | undefined {
    return (this._module = this._module || loadModule('graphql/execution/execute.js'));
  }

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (shouldDisableAutoInstrumentation(getCurrentHub)) {
      DEBUG_BUILD && logger.log('GraphQL Integration is skipped because of instrumenter configuration.');
      return;
    }

    const pkg = this.loadDependency();

    if (!pkg) {
      DEBUG_BUILD && logger.error('GraphQL Integration was unable to require graphql/execution package.');
      return;
    }

    fill(
      pkg,
      'execute',
      (orig: () => void | Promise<unknown>) =>
        function (this: unknown, ...args: unknown[]) {
          const scope = getCurrentHub().getScope();
          const parentSpan = scope.getSpan();

          const span = parentSpan?.startChild({
            description: 'execute',
            op: 'graphql.execute',
            origin: 'auto.graphql.graphql',
          });

          scope?.setSpan(span);

          const rv = orig.call(this, ...args);

          if (isThenable(rv)) {
            return rv.then((res: unknown) => {
              span?.finish();
              scope?.setSpan(parentSpan);

              return res;
            });
          }

          span?.finish();
          scope?.setSpan(parentSpan);
          return rv;
        },
    );
  }
}
