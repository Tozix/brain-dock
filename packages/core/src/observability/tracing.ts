import { context, propagation, type Tracer, trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  NodeTracerProvider,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export type TracesExporter = 'none' | 'console' | 'otlp';

export interface TracingOptions {
  exporter: TracesExporter;
  otlpEndpoint?: string;
  serviceName: string;
  serviceVersion: string;
}

/** Build the span exporter for the configured kind; null disables tracing entirely. */
export function selectExporter(kind: TracesExporter, otlpEndpoint?: string): SpanExporter | null {
  switch (kind) {
    case 'console':
      return new ConsoleSpanExporter();
    case 'otlp':
      return new OTLPTraceExporter(otlpEndpoint ? { url: otlpEndpoint } : {});
    default:
      return null;
  }
}

let started = false;

/**
 * Initialize tracing once per process. Returns true when a provider was registered, false when
 * disabled (`exporter: 'none'`) — then the API's no-op tracer is used, so instrumentation is
 * nearly free. Shared by api and workers.
 */
export function initTracing(options: TracingOptions): boolean {
  if (started) return true;
  const exporter = selectExporter(options.exporter, options.otlpEndpoint);
  if (!exporter) return false;

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
  started = true;
  return true;
}

/** Resolve tracing options from environment variables (shared OTEL_* convention). */
export function tracingOptionsFromEnv(
  serviceName: string,
  serviceVersion = '0.1.0',
): TracingOptions {
  return {
    exporter: (process.env.OTEL_TRACES_EXPORTER ?? 'none') as TracesExporter,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: process.env.OTEL_SERVICE_NAME ?? serviceName,
    serviceVersion,
  };
}

/** Get a named tracer (no-op when tracing is disabled). */
export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/** A W3C trace-context carrier (e.g. `{ traceparent, tracestate }`). */
export type TraceCarrier = Record<string, string>;

/** Capture the active trace context into a carrier — attach it to a queued job for propagation. */
export function injectTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** Run `fn` within the trace context extracted from a carrier (no-op when absent/disabled). */
export function runWithTraceContext<T>(carrier: TraceCarrier | undefined, fn: () => T): T {
  if (!carrier) return fn();
  return context.with(propagation.extract(context.active(), carrier), fn);
}
