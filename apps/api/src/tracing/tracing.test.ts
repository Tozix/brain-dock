import { describe, expect, it } from 'bun:test';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { selectExporter } from './tracing';

describe('selectExporter', () => {
  it('disables tracing for "none"', () => {
    expect(selectExporter('none')).toBeNull();
  });

  it('returns a console exporter for "console"', () => {
    expect(selectExporter('console')).toBeInstanceOf(ConsoleSpanExporter);
  });

  it('returns an OTLP exporter for "otlp"', () => {
    const exporter = selectExporter('otlp', 'http://localhost:4318/v1/traces');
    expect(exporter).not.toBeNull();
    expect(exporter).not.toBeInstanceOf(ConsoleSpanExporter);
  });
});
