import * as Sentry from '@sentry/node';
import type { MonitorConfig } from '@sentry/types';

/**
 * A decorator wrapping the native nest Cron decorator, sending check-ins to Sentry.
 */
export const SentryCron = (monitorSlug: string, monitorConfig: MonitorConfig | undefined): MethodDecorator => {
  return (target: unknown, propertyKey, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalMethod = descriptor.value as (...args: any[]) => Promise<any>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    descriptor.value = async function (...args: any[]) {
      return Sentry.withMonitor(
        monitorSlug,
        async () => {
          return originalMethod.apply(this, args);
        },
        monitorConfig,
      );
    };
    return descriptor;
  };
};
