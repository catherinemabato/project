import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.onLoad(function () {
  Sentry.init({});
});
