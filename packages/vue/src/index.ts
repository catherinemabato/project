export * from '@sentry/browser';

export { init } from './sdk';
export { vueRouterInstrumentation } from './router';
export { attachErrorHandler } from './errorhandler';
export { createTracingMixins } from './tracing';
export {
  vueIntegration,
  // eslint-disable-next-line deprecation/deprecation
  VueIntegration,
} from './integration';
