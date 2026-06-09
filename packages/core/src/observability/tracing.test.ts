import { afterEach, describe, expect, it } from 'bun:test';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import {
  injectTraceContext,
  runWithTraceContext,
  selectExporter,
  tracingOptionsFromEnv,
} from './tracing';

describe('selectExporter', () => {
  it('disables tracing for "none"', () => {
    expect(selectExporter('none')).toBeNull();
  });

  it('returns a console exporter for "console"', () => {
    expect(selectExporter('console')).toBeInstanceOf(ConsoleSpanExporter);
  });

  it('returns a non-console exporter for "otlp"', () => {
    const exporter = selectExporter('otlp', 'http://localhost:4318/v1/traces');
    expect(exporter).not.toBeNull();
    expect(exporter).not.toBeInstanceOf(ConsoleSpanExporter);
  });
});

describe('tracingOptionsFromEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.OTEL_TRACES_EXPORTER = saved.OTEL_TRACES_EXPORTER;
    process.env.OTEL_SERVICE_NAME = saved.OTEL_SERVICE_NAME;
  });

  it('defaults to disabled with the given service name', () => {
    process.env.OTEL_TRACES_EXPORTER = undefined;
    process.env.OTEL_SERVICE_NAME = undefined;
    const opts = tracingOptionsFromEnv('brain-dock-workers');
    expect(opts.exporter).toBe('none');
    expect(opts.serviceName).toBe('brain-dock-workers');
  });

  it('reads exporter and service name from env', () => {
    process.env.OTEL_TRACES_EXPORTER = 'console';
    process.env.OTEL_SERVICE_NAME = 'custom';
    const opts = tracingOptionsFromEnv('brain-dock-workers');
    expect(opts.exporter).toBe('console');
    expect(opts.serviceName).toBe('custom');
  });
});

describe('trace propagation helpers', () => {
  it('inject returns a carrier and run executes within it (no-op when disabled)', () => {
    expect(typeof injectTraceContext()).toBe('object');
    expect(runWithTraceContext(undefined, () => 42)).toBe(42);
    expect(runWithTraceContext({}, () => 'ok')).toBe('ok');
    expect(runWithTraceContext({ traceparent: 'bogus' }, () => 7)).toBe(7);
  });
});
