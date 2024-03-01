import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  defaultIntegrations: false,
  integrations: [new Sentry.breadcrumbsIntegration()],
  sampleRate: 1,
});
