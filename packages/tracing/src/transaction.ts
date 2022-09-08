import { getCurrentHub, Hub } from '@sentry/hub';
import {
  DynamicSamplingContext,
  Event,
  Measurements,
  MeasurementUnit,
  Transaction as TransactionInterface,
  TransactionContext,
  TransactionMetadata,
} from '@sentry/types';
import { dropUndefinedKeys, logger } from '@sentry/utils';

import { Span as SpanClass, SpanRecorder } from './span';

/** JSDoc */
export class Transaction extends SpanClass implements TransactionInterface {
  public metadata: TransactionMetadata;

  /**
   * The reference to the current hub.
   */
  public readonly _hub: Hub;

  private _name: string;

  private _measurements: Measurements = {};

  private _trimEnd?: boolean;

  // Uncomment if we want to make DSC immutable (Search for "IMMUTABLE DSC" to find all commented out code sections)
  // This value is null
  // private _frozenDynamicSamplingContext: Partial<DynamicSamplingContext> | undefined = undefined;

  /**
   * This constructor should never be called manually. Those instrumenting tracing should use
   * `Sentry.startTransaction()`, and internal methods should use `hub.startTransaction()`.
   * @internal
   * @hideconstructor
   * @hidden
   */
  public constructor(transactionContext: TransactionContext, hub?: Hub) {
    super(transactionContext);

    this._hub = hub || getCurrentHub();

    this._name = transactionContext.name || '';

    this.metadata = {
      ...transactionContext.metadata,
      spanMetadata: {},
    };

    this._trimEnd = transactionContext.trimEnd;

    // this is because transactions are also spans, and spans have a transaction pointer
    this.transaction = this;

    // Uncomment if we want to make DSC immutable (Search for "IMMUTABLE DSC" to find all commented out code sections)
    // if ((transactionContext.metadata || {}).dynamicSamplingContext) {
    //   this.freezeDynamicSamplingContext();
    // }
  }

  /** Getter for `name` property */
  public get name(): string {
    return this._name;
  }

  /** Setter for `name` property, which also sets `source` */
  public set name(newName: string) {
    this._name = newName;
    this.metadata.source = 'custom';
  }

  /**
   * JSDoc
   */
  public setName(name: string, source: TransactionMetadata['source'] = 'custom'): void {
    this.name = name;
    this.metadata.source = source;
  }

  /**
   * Attaches SpanRecorder to the span itself
   * @param maxlen maximum number of spans that can be recorded
   */
  public initSpanRecorder(maxlen: number = 1000): void {
    if (!this.spanRecorder) {
      this.spanRecorder = new SpanRecorder(maxlen);
    }
    this.spanRecorder.add(this);
  }

  /**
   * @inheritDoc
   */
  public setMeasurement(name: string, value: number, unit: MeasurementUnit = ''): void {
    this._measurements[name] = { value, unit };
  }

  /**
   * @inheritDoc
   */
  public setMetadata(newMetadata: Partial<TransactionMetadata>): void {
    this.metadata = { ...this.metadata, ...newMetadata };
  }

  /**
   * @inheritDoc
   */
  public finish(endTimestamp?: number): string | undefined {
    // This transaction is already finished, so we should not flush it again.
    if (this.endTimestamp !== undefined) {
      return undefined;
    }

    if (!this.name) {
      __DEBUG_BUILD__ && logger.warn('Transaction has no name, falling back to `<unlabeled transaction>`.');
      this.name = '<unlabeled transaction>';
    }

    // just sets the end timestamp
    super.finish(endTimestamp);

    if (this.sampled !== true) {
      // At this point if `sampled !== true` we want to discard the transaction.
      __DEBUG_BUILD__ && logger.log('[Tracing] Discarding transaction because its trace was not chosen to be sampled.');

      const client = this._hub.getClient();
      if (client) {
        client.recordDroppedEvent('sample_rate', 'transaction');
      }

      return undefined;
    }

    const finishedSpans = this.spanRecorder ? this.spanRecorder.spans.filter(s => s !== this && s.endTimestamp) : [];

    if (this._trimEnd && finishedSpans.length > 0) {
      this.endTimestamp = finishedSpans.reduce((prev: SpanClass, current: SpanClass) => {
        if (prev.endTimestamp && current.endTimestamp) {
          return prev.endTimestamp > current.endTimestamp ? prev : current;
        }
        return prev;
      }).endTimestamp;
    }

    // Uncomment if we want to make DSC immutable (Search for "IMMUTABLE DSC" to find all commented out code sections)
    // if ((transactionContext.metadata || {}).dynamicSamplingContext) {
    //   this.freezeDynamicSamplingContext();
    // }

    const metadata = this.metadata;

    const transaction: Event = {
      contexts: {
        trace: this.getTraceContext(),
      },
      spans: finishedSpans,
      start_timestamp: this.startTimestamp,
      tags: this.tags,
      timestamp: this.endTimestamp,
      transaction: this.name,
      type: 'transaction',
      sdkProcessingMetadata: {
        ...metadata,
        dynamicSamplingContext: this.getDynamicSamplingContext(),
      },
      ...(metadata.source && {
        transaction_info: {
          source: metadata.source,
        },
      }),
    };

    const hasMeasurements = Object.keys(this._measurements).length > 0;

    if (hasMeasurements) {
      __DEBUG_BUILD__ &&
        logger.log(
          '[Measurements] Adding measurements to transaction',
          JSON.stringify(this._measurements, undefined, 2),
        );
      transaction.measurements = this._measurements;
    }

    __DEBUG_BUILD__ && logger.log(`[Tracing] Finishing ${this.op} transaction: ${this.name}.`);

    return this._hub.captureEvent(transaction);
  }

  /**
   * @inheritDoc
   */
  public toContext(): TransactionContext {
    const spanContext = super.toContext();

    return dropUndefinedKeys({
      ...spanContext,
      name: this.name,
      trimEnd: this._trimEnd,
    });
  }

  /**
   * @inheritDoc
   */
  public updateWithContext(transactionContext: TransactionContext): this {
    super.updateWithContext(transactionContext);

    this.name = transactionContext.name ?? '';

    this._trimEnd = transactionContext.trimEnd;

    return this;
  }

  /**
   *
   */
  public getDynamicSamplingContext(): Partial<DynamicSamplingContext> | undefined {
    // Uncomment if we want to make DSC immutable (Search for "IMMUTABLE DSC" to find all commented out code sections)
    // if (this._frozenDynamicSamplingContext) {
    //   return this._frozenDynamicSamplingContext;
    // }

    const hub: Hub = this._hub || getCurrentHub();
    const client = hub && hub.getClient();

    if (!client) return undefined;

    const { environment, release } = client.getOptions() || {};
    const { publicKey: public_key } = client.getDsn() || {};

    const maybeSampleRate = (this.metadata.transactionSampling || {}).rate;
    const sample_rate = maybeSampleRate !== undefined ? maybeSampleRate.toString() : undefined;

    const scope = hub.getScope();
    const { segment: user_segment } = (scope && scope.getUser()) || {};

    const source = this.metadata.source;

    // We don't want to have a transaction name in the DSC if the source is "url" because URLs might contain PII
    const transaction = source && source !== 'url' ? this.name : undefined;

    const dsc = dropUndefinedKeys({
      environment,
      release,
      transaction,
      user_segment,
      public_key,
      trace_id: this.traceId,
      sample_rate,
    });

    // Uncomment if we want to make DSC immutable (Search for "IMMUTABLE DSC" to find all commented out code sections)
    // this._frozenDynamicSamplingContext = dsc;

    return dsc;
  }
}
