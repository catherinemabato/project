import type { Span, SpanTimeInput, TraceContext } from '@sentry/types';
import { dropUndefinedKeys, generateSentryTraceHeader, timestampInSeconds } from '@sentry/utils';

/**
 * Convert a span to a trace context, which can be sent as the `trace` context in an event.
 */
export function spanToTraceContext(span: Span): TraceContext {
  const { data, description, op, parent_span_id, span_id, status, tags, trace_id, origin } = span.toJSON();

  return dropUndefinedKeys({
    data,
    description,
    op,
    parent_span_id,
    span_id,
    status,
    tags,
    trace_id,
    origin,
  });
}

/**
 * Convert a Span to a Sentry trace header.
 */
export function spanToTraceHeader(span: Span): string {
  return generateSentryTraceHeader(span.traceId, span.spanId, span.isRecording());
}

/**
 * Convert a span time input intp a timestamp in seconds.
 */
export function spanTimeInputToSeconds(input: SpanTimeInput | undefined): number {
  if (typeof input === 'number') {
    return ensureTimestampInSeconds(input);
  }

  if (Array.isArray(input)) {
    // See {@link HrTime} for the array-based time format
    return input[0] + input[1] / 1e9;
  }

  if (input instanceof Date) {
    return ensureTimestampInSeconds(input.getTime());
  }

  return timestampInSeconds();
}

/**
 * Converts a timestamp to second, if it was in milliseconds, or keeps it as second.
 */
function ensureTimestampInSeconds(timestamp: number): number {
  const isMs = timestamp > 9999999999;
  return isMs ? timestamp / 1000 : timestamp;
}
