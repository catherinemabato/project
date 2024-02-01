import type { MeasurementUnit, MetricSummaryAggregator as MetricSummaryAggregatorInterface } from '@sentry/types';
import type { MetricSummary } from '@sentry/types';
import type { Primitive } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { getActiveSpan } from '../tracing';

/**
 * Updates the metric summary on the currently active span
 */
export function updateMetricSummaryOnActiveSpan(
  metricType: 'c' | 'g' | 's' | 'd',
  sanitizedName: string,
  value: number | string,
  unit: MeasurementUnit,
  tags: Record<string, Primitive>,
  bucketKey: string,
): void {
  const span = getActiveSpan();
  if (span) {
    const summary = span.getMetricSummary() || new MetricSummaryAggregator();
    summary.add(metricType, sanitizedName, value, unit, tags, bucketKey);
    span.setMetricSummary(summary);
  }
}

/**
 * Summaries metrics for spans
 */
class MetricSummaryAggregator implements MetricSummaryAggregatorInterface {
  /**
   * key: bucketKey
   * value: [exportKey, MetricSpanSummary]
   */
  private readonly _measurements: Map<string, [string, MetricSummary]>;

  public constructor() {
    this._measurements = new Map<string, [string, MetricSummary]>();
  }

  /** @inheritdoc */
  public add(
    metricType: 'c' | 'g' | 's' | 'd',
    sanitizedName: string,
    value: number | string,
    unit: MeasurementUnit,
    tags: Record<string, Primitive>,
    bucketKey: string,
  ): void {
    const exportKey = `${metricType}:${sanitizedName}@${unit}`;
    const bucketItem = this._measurements.get(bucketKey);

    if (bucketItem) {
      // if value is string, this was a set, so value should be 1
      const val = typeof value === 'string' ? 1 : value;
      const [, summary] = bucketItem;
      this._measurements.set(bucketKey, [
        exportKey,
        {
          min: Math.min(summary.min, val),
          max: Math.max(summary.max, val),
          count: (summary.count += 1),
          sum: (summary.sum += val),
          tags: summary.tags,
        },
      ]);
    } else {
      // if value is string, this was a set, so value should be 0
      const val = typeof value === 'string' ? 0 : value;
      this._measurements.set(bucketKey, [
        exportKey,
        {
          min: val,
          max: val,
          count: 1,
          sum: val,
          tags,
        },
      ]);
    }
  }

  /** @inheritdoc */
  public getJson(): Record<string, MetricSummary> {
    const output: Record<string, MetricSummary> = {};

    for (const [, [exportKey, summary]] of this._measurements) {
      output[exportKey] = dropUndefinedKeys(summary);
    }

    return output;
  }
}
