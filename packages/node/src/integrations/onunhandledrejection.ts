import { Integration } from '@sentry/types';
import { getGlobalHub } from '../hub';

/** Global Promise Rejection handler */
export class OnUnhandledRejection implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUnhandledRejection';
  /**
   * @inheritDoc
   */
  public install(): void {
    global.process.on(
      'unhandledRejection',
      this.sendUnhandledPromise.bind(this),
    );
  }

  /**
   * Send an exception with reason
   * @param reason string
   * @param promise promise
   */
  public sendUnhandledPromise(reason: any, promise: any): void {
    const context = (promise.domain && promise.domain.sentryContext) || {};
    getGlobalHub().withScope(() => {
      getGlobalHub().configureScope(scope => {
        // Preserve backwards compatibility with raven-node for now
        if (context.user) {
          scope.setUser(context.user);
        }
        if (context.tags) {
          Object.keys(context.tags).forEach(key => {
            scope.setTag(key, context.tags[key]);
          });
        }
        if (context.extra) {
          Object.keys(context.extra).forEach(key => {
            scope.setExtra(key, context.extra[key]);
          });
        }
        scope.setExtra('unhandledPromiseRejection', true);
      });
      getGlobalHub().captureException(reason);
    });
  }
}
