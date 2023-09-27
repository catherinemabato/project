import { SpanKind } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { flush } from '@sentry/core';
import { mapOtelStatus, parseOtelSpanDescription } from '@sentry/opentelemetry-node';
import type { DynamicSamplingContext, Span, SpanOrigin, TransactionSource } from '@sentry/types';
import { logger } from '@sentry/utils';

import { OTEL_ATTR_OP, OTEL_ATTR_ORIGIN, OTEL_ATTR_PARENT_SAMPLED, OTEL_ATTR_SOURCE } from '../constants';
import { getCurrentHub } from '../sdk/hub';
import { NodeExperimentalScope } from '../sdk/scope';
import type { NodeExperimentalTransaction } from '../sdk/transaction';
import { startTransaction } from '../sdk/transaction';
import type { OtelSpan } from '../types';
import { convertOtelTimeToSeconds } from '../utils/convertOtelTimeToSeconds';
import { getRequestSpanData } from '../utils/getRequestSpanData';
import type { OtelSpanNode } from '../utils/groupOtelSpansWithParents';
import { groupOtelSpansWithParents } from '../utils/groupOtelSpansWithParents';
import { getOtelSpanHub, getOtelSpanMetadata, getOtelSpanScope } from './spanData';

type OtelSpanNodeCompleted = OtelSpanNode & { span: OtelSpan };

/**
 * A Sentry-specific exporter that converts OpenTelemetry Spans to Sentry Spans & Transactions.
 */
export class SentrySpanExporter implements SpanExporter {
  private _finishedSpans: OtelSpan[];
  private _stopped: boolean;

  public constructor() {
    this._stopped = false;
    this._finishedSpans = [];
  }

  /** @inheritDoc */
  public export(spans: OtelSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this._stopped) {
      return resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error('Exporter has been stopped'),
      });
    }

    const openSpanCount = this._finishedSpans.length;
    const newSpanCount = spans.length;

    this._finishedSpans.push(...spans);

    const remainingSpans = maybeSend(this._finishedSpans);

    const remainingOpenSpanCount = remainingSpans.length;
    const sentSpanCount = openSpanCount + newSpanCount - remainingOpenSpanCount;

    __DEBUG_BUILD__ &&
      logger.log(`SpanExporter exported ${sentSpanCount} spans, ${remainingOpenSpanCount} unsent spans remaining`);

    this._finishedSpans = remainingSpans.filter(span => {
      const shouldDrop = shouldCleanupSpan(span, 5 * 60);
      __DEBUG_BUILD__ &&
        shouldDrop &&
        logger.log(
          `SpanExporter dropping span ${span.name} (${
            span.spanContext().spanId
          }) because it is pending for more than 5 minutes.`,
        );
      return !shouldDrop;
    });

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  /** @inheritDoc */
  public shutdown(): Promise<void> {
    this._stopped = true;
    this._finishedSpans = [];
    return this.forceFlush();
  }

  /** @inheritDoc */
  public async forceFlush(): Promise<void> {
    await flush();
  }
}

/**
 * Send the given spans, but only if they are part of a finished transaction.
 *
 * Returns the unsent spans.
 * Spans remain unsent when their parent span is not yet finished.
 * This will happen regularly, as child spans are generally finished before their parents.
 * But it _could_ also happen because, for whatever reason, a parent span was lost.
 * In this case, we'll eventually need to clean this up.
 */
function maybeSend(spans: OtelSpan[]): OtelSpan[] {
  const grouped = groupOtelSpansWithParents(spans);
  const remaining = new Set(grouped);

  const rootNodes = getCompletedRootNodes(grouped);

  rootNodes.forEach(root => {
    remaining.delete(root);
    const span = root.span;
    const transaction = createTransactionForOtelSpan(span);

    root.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, transaction, remaining);
    });

    // Now finish the transaction, which will send it together with all the spans
    // We make sure to use the current span as the activeSpan for this transaction
    const scope = getOtelSpanScope(span);
    const forkedScope = NodeExperimentalScope.clone(
      scope as NodeExperimentalScope | undefined,
    ) as NodeExperimentalScope;
    forkedScope.activeSpan = span;

    transaction.finishWithScope(convertOtelTimeToSeconds(span.endTime), forkedScope);
  });

  return Array.from(remaining)
    .map(node => node.span as OtelSpan)
    .filter(Boolean);
}

function getCompletedRootNodes(nodes: OtelSpanNode[]): OtelSpanNodeCompleted[] {
  return nodes.filter((node): node is OtelSpanNodeCompleted => !!node.span && !node.parentNode);
}

function shouldCleanupSpan(span: OtelSpan, maxStartTimeOffsetSeconds: number): boolean {
  const cutoff = Date.now() / 1000 - maxStartTimeOffsetSeconds;
  return convertOtelTimeToSeconds(span.startTime) < cutoff;
}

function parseSpan(otelSpan: OtelSpan): { op?: string; origin?: SpanOrigin; source?: TransactionSource } {
  const attributes = otelSpan.attributes;

  const origin = attributes[OTEL_ATTR_ORIGIN] as SpanOrigin | undefined;
  const op = attributes[OTEL_ATTR_OP] as string | undefined;
  const source = attributes[OTEL_ATTR_SOURCE] as TransactionSource | undefined;

  return { origin, op, source };
}

function createTransactionForOtelSpan(span: OtelSpan): NodeExperimentalTransaction {
  const scope = getOtelSpanScope(span);
  const hub = getOtelSpanHub(span) || getCurrentHub();
  const spanContext = span.spanContext();
  const spanId = spanContext.spanId;
  const traceId = spanContext.traceId;
  const parentSpanId = span.parentSpanId;

  const parentSampled = span.attributes[OTEL_ATTR_PARENT_SAMPLED] as boolean | undefined;
  const dynamicSamplingContext: DynamicSamplingContext | undefined = scope
    ? scope.getPropagationContext().dsc
    : undefined;

  const { op, description, tags, data, origin, source } = getSpanData(span);
  const metadata = getOtelSpanMetadata(span);

  const transaction = startTransaction(hub, {
    spanId,
    traceId,
    parentSpanId,
    parentSampled,
    name: description,
    op,
    instrumenter: 'otel',
    status: mapOtelStatus(span),
    startTimestamp: convertOtelTimeToSeconds(span.startTime),
    metadata: {
      dynamicSamplingContext,
      source,
      ...metadata,
    },
    data: removeSentryAttributes(data),
    origin,
    tags,
  }) as NodeExperimentalTransaction;

  transaction.setContext('otel', {
    attributes: removeSentryAttributes(span.attributes),
    resource: span.resource.attributes,
  });

  return transaction;
}

function createAndFinishSpanForOtelSpan(
  node: OtelSpanNode,
  sentryParentSpan: Span,
  remaining: Set<OtelSpanNode>,
): void {
  remaining.delete(node);
  const otelSpan = node.span;

  const shouldDrop = !otelSpan;

  // If this span should be dropped, we still want to create spans for the children of this
  if (shouldDrop) {
    node.children.forEach(child => {
      createAndFinishSpanForOtelSpan(child, sentryParentSpan, remaining);
    });
    return;
  }

  const otelSpanId = otelSpan.spanContext().spanId;
  const { attributes } = otelSpan;

  const { op, description, tags, data, origin } = getSpanData(otelSpan);
  const allData = { ...removeSentryAttributes(attributes), ...data };

  const sentrySpan = sentryParentSpan.startChild({
    description,
    op,
    data: allData,
    status: mapOtelStatus(otelSpan),
    instrumenter: 'otel',
    startTimestamp: convertOtelTimeToSeconds(otelSpan.startTime),
    spanId: otelSpanId,
    origin,
    tags,
  });

  node.children.forEach(child => {
    createAndFinishSpanForOtelSpan(child, sentrySpan, remaining);
  });

  sentrySpan.finish(convertOtelTimeToSeconds(otelSpan.endTime));
}

function getSpanData(span: OtelSpan): {
  tags: Record<string, string>;
  data: Record<string, unknown>;
  op?: string;
  description: string;
  source?: TransactionSource;
  origin?: SpanOrigin;
} {
  const { op: definedOp, source: definedSource, origin } = parseSpan(span);
  const { op: inferredOp, description, source: inferredSource, data: inferredData } = parseOtelSpanDescription(span);

  const op = definedOp || inferredOp;
  const source = definedSource || inferredSource;

  const tags = getTags(span);
  const data = { ...inferredData, ...getData(span) };

  return {
    op,
    description,
    source,
    origin,
    tags,
    data,
  };
}

/**
 * Remove custom `sentry.` attribtues we do not need to send.
 * These are more carrier attributes we use inside of the SDK, we do not need to send them to the API.
 */
function removeSentryAttributes(data: Record<string, unknown>): Record<string, unknown> {
  const cleanedData = { ...data };

  /* eslint-disable @typescript-eslint/no-dynamic-delete */
  delete cleanedData[OTEL_ATTR_PARENT_SAMPLED];
  delete cleanedData[OTEL_ATTR_ORIGIN];
  delete cleanedData[OTEL_ATTR_OP];
  delete cleanedData[OTEL_ATTR_SOURCE];
  /* eslint-enable @typescript-eslint/no-dynamic-delete */

  return cleanedData;
}

function getTags(span: OtelSpan): Record<string, string> {
  const attributes = span.attributes;
  const tags: Record<string, string> = {};

  if (attributes[SemanticAttributes.HTTP_STATUS_CODE]) {
    const statusCode = attributes[SemanticAttributes.HTTP_STATUS_CODE] as string;

    tags['http.status_code'] = statusCode;
  }

  return tags;
}

function getData(span: OtelSpan): Record<string, unknown> {
  const attributes = span.attributes;
  const data: Record<string, unknown> = {
    'otel.kind': SpanKind[span.kind],
  };

  if (attributes[SemanticAttributes.HTTP_STATUS_CODE]) {
    const statusCode = attributes[SemanticAttributes.HTTP_STATUS_CODE] as string;
    data['http.response.status_code'] = statusCode;
  }

  const requestData = getRequestSpanData(span);

  if (requestData.url) {
    data.url = requestData.url;
  }

  if (requestData['http.query']) {
    data['http.query'] = requestData['http.query'].slice(1);
  }
  if (requestData['http.fragment']) {
    data['http.fragment'] = requestData['http.fragment'].slice(1);
  }

  return data;
}
