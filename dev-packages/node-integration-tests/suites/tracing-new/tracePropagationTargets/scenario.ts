import * as http from 'http';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/\/v0/, 'v1'],
  integrations: [new Sentry.Integrations.Http({ tracing: true })],
});

Sentry.startSpan({ name: 'test_span' }, () => {
  http.get('http://match-this-url.com/api/v0');
  http.get('http://match-this-url.com/api/v1');
  http.get('http://dont-match-this-url.com/api/v2');
  http.get('http://dont-match-this-url.com/api/v3');
});
