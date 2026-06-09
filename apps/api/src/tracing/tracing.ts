import {
  getTracer as coreGetTracer,
  type TracesExporter,
  type TracingOptions,
} from '@brain-dock/core';
import type { Tracer } from '@opentelemetry/api';

// Shared tracing init lives in @brain-dock/core (reused by api + workers).
export { initTracing, selectExporter, tracingOptionsFromEnv } from '@brain-dock/core';
export type { TracesExporter, TracingOptions };

const SERVICE = 'brain-dock-api';

/** The brain-dock API tracer. Returns a no-op tracer when tracing is disabled. */
export function getTracer(): Tracer {
  return coreGetTracer(SERVICE);
}
