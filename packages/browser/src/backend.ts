import { Backend, Frontend, Options, SentryError } from '@sentry/core';
import {
  addBreadcrumb,
  captureEvent,
  SentryEvent,
  SentryException,
} from '@sentry/shim';
import { Raven, SendMethod } from './raven';

/** Original raven send function. */
const sendRavenEvent = Raven._sendProcessedPayload.bind(Raven) as SendMethod;

/** Normalizes the event so it is consistent with our domain interface. */
function normalizeRavenEvent(event: SentryEvent): SentryEvent {
  const ex = ((event && event.exception) || {}) as {
    values?: SentryException[];
  };
  if (ex && ex.values) {
    event.exception = ex.values;
  }

  return event;
}

/** Prepares an event so it can be send with raven-js. */
function prepareEventForRaven(event: SentryEvent): SentryEvent {
  const ravenEvent = event as any;
  if (event.exception) {
    // tslint:disable-next-line:no-unsafe-any
    ravenEvent.exception = { values: event.exception };
  }
  return ravenEvent as SentryEvent;
}

/**
 * Configuration options for the Sentry Browser SDK.
 * @see BrowserFrontend for more information.
 */
export interface BrowserOptions extends Options {
  /**
   * A pattern for error messages which should not be sent to Sentry. By
   * default, all errors will be sent.
   */
  ignoreErrors?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should not be sent to Sentry. To whitelist
   * certain errors instead, use {@link Options.whitelistUrls}. By default, all
   * errors will be sent.
   */
  ignoreUrls?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should exclusively be sent to Sentry. This
   * is the opposite of {@link Options.ignoreUrls}. By default, all errors will
   * be sent.
   */
  whitelistUrls?: Array<string | RegExp>;

  /**
   * Defines a list source code file paths. Only errors including these paths in
   * their stack traces will be sent to Sentry. By default, all errors will be
   * sent.
   */
  includePaths?: Array<string | RegExp>;
}

/** The Sentry Browser SDK Backend. */
export class BrowserBackend implements Backend {
  /** Handle to the SDK frontend for callbacks. */
  private readonly frontend: Frontend<BrowserOptions>;

  /** Creates a new browser backend instance. */
  public constructor(frontend: Frontend<BrowserOptions>) {
    this.frontend = frontend;
  }

  /**
   * @inheritDoc
   */
  public install(): boolean {
    // We are only called by the frontend if the SDK is enabled and a valid DSN
    // has been configured. If no DSN is present, this indicates a programming
    // error.
    const dsn = this.frontend.getDSN();
    if (!dsn) {
      throw new SentryError(
        'Invariant exception: install() must not be called when disabled',
      );
    }

    Raven.config(dsn.toString(), this.frontend.getOptions()).install();

    // Hook into Raven's breadcrumb mechanism. This allows us to intercept both
    // breadcrumbs created internally by Raven and pass them to the Frontend
    // first, before actually capturing them.
    Raven.setBreadcrumbCallback(breadcrumb => {
      addBreadcrumb(breadcrumb);
      return false;
    });

    // Hook into Raven's internal event sending mechanism. This allows us to
    // pass events to the frontend, before they will be sent back here for
    // actual submission.
    Raven._sendProcessedPayload = event => {
      captureEvent(normalizeRavenEvent(event));
    };

    return true;
  }

  /**
   * @inheritDoc
   */
  public async eventFromException(exception: any): Promise<SentryEvent> {
    const originalSend = Raven._sendProcessedPayload;
    try {
      let event!: SentryEvent;
      Raven._sendProcessedPayload = evt => {
        event = evt;
      };

      Raven.captureException(exception);
      return normalizeRavenEvent(event);
    } finally {
      Raven._sendProcessedPayload = originalSend;
    }
  }

  /**
   * @inheritDoc
   */
  public async eventFromMessage(message: string): Promise<SentryEvent> {
    const originalSend = Raven._sendProcessedPayload;
    try {
      let event!: SentryEvent;
      Raven._sendProcessedPayload = evt => {
        event = evt;
      };

      Raven.captureMessage(message);
      return normalizeRavenEvent(event);
    } finally {
      Raven._sendProcessedPayload = originalSend;
    }
  }

  /**
   * @inheritDoc
   */
  public async sendEvent(event: SentryEvent): Promise<number> {
    return new Promise<number>(resolve => {
      sendRavenEvent(prepareEventForRaven(event), error => {
        // TODO: Check the response status code
        resolve(error ? 500 : 200);
      });
    });
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(): boolean {
    return true;
  }

  /**
   * @inheritDoc
   */
  public storeContext(): boolean {
    return true;
  }
}
