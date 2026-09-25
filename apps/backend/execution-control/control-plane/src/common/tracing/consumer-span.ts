import { randomBytes } from 'crypto';
import {
  generateW3cTraceparent,
  isValidTraceparent,
} from '../interceptors/trace.interceptor';

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, string>;
}

export interface ConsumerSpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceparent: string;
  tracestate?: string;
  links: SpanLink[];
  kind: 'CONSUMER';
}

const TRACEPARENT_REGEX = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export function parseSpanComponents(traceparent?: string): {
  version: string;
  traceId: string;
  spanId: string;
  flags: string;
} | null {
  if (!traceparent || typeof traceparent !== 'string') return null;
  const match = traceparent.trim().match(TRACEPARENT_REGEX);
  if (!match) return null;
  const [, traceId, spanId, flags] = match;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return { version: '00', traceId: traceId.toLowerCase(), spanId: spanId.toLowerCase(), flags: flags.toLowerCase() };
}

/**
 * Creates a W3C-compliant Consumer Span context for asynchronous messaging
 * consumers (Outbox Dispatcher, Schedule Fire Dispatcher) in accordance with ADR-002.
 *
 * For single plan steps, the incoming traceparent is treated as the causal parent.
 * For batch events (Schedule Fire fan-out), span links are recorded to link
 * the consumer span to the batch root span without creating an artificially deep hierarchy.
 */
export function createConsumerSpan(options: {
  incomingTraceparent?: string;
  tracestate?: string;
  links?: SpanLink[];
  fallbackTraceId?: string;
}): ConsumerSpanContext {
  const { incomingTraceparent, tracestate, links = [], fallbackTraceId } = options;
  const parsed = parseSpanComponents(incomingTraceparent);

  const spanId = randomBytes(8).toString('hex');

  if (parsed) {
    const traceparent = `00-${parsed.traceId}-${spanId}-${parsed.flags}`;
    return {
      traceId: parsed.traceId,
      spanId,
      parentSpanId: parsed.spanId,
      traceparent,
      tracestate,
      links,
      kind: 'CONSUMER',
    };
  }

  const generated = generateW3cTraceparent(fallbackTraceId);
  const genParsed = parseSpanComponents(generated)!;

  return {
    traceId: genParsed.traceId,
    spanId: genParsed.spanId,
    traceparent: generated,
    tracestate,
    links,
    kind: 'CONSUMER',
  };
}

/**
 * Formats a structured log payload containing OpenTelemetry trace, span, and link attributes
 * per ADR-002 Section 2.4.
 */
export function formatStructuredSpanLog(
  span: ConsumerSpanContext,
  message: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    spanKind: span.kind,
    traceparent: span.traceparent,
    ...(span.links.length > 0 ? { links: span.links } : {}),
    message,
    ...extra,
  };
}
