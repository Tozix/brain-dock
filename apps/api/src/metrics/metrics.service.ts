import { Injectable } from '@nestjs/common';

type Labels = Record<string, string>;

const COUNTER_HELP: Record<string, string> = {
  http_requests_total: 'Total HTTP requests handled',
  rate_limit_blocked_total: 'Requests rejected by the rate limiter',
};

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function withLabels(name: string, labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return name;
  const inner = entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',');
  return `${name}{${inner}}`;
}

/** Minimal in-process metrics with Prometheus text exposition (no external deps). */
@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, { labels: Labels; sum: number; count: number }>();
  private readonly startedAt = Date.now();

  incCounter(name: string, labels: Labels = {}, by = 1): void {
    const key = withLabels(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  recordHttp(method: string, route: string, status: number, durationMs: number): void {
    this.incCounter('http_requests_total', { method, route, status: String(status) });
    const key = withLabels('http_request_duration_seconds', { method, route });
    const bucket = this.durations.get(key) ?? { labels: { method, route }, sum: 0, count: 0 };
    bucket.sum += durationMs / 1000;
    bucket.count += 1;
    this.durations.set(key, bucket);
  }

  /** Prometheus text exposition (version 0.0.4). */
  render(): string {
    const lines: string[] = [];

    const byBase = new Map<string, Array<[string, number]>>();
    for (const [key, value] of this.counters) {
      const base = key.split('{')[0] ?? key;
      let series = byBase.get(base);
      if (!series) {
        series = [];
        byBase.set(base, series);
      }
      series.push([key, value]);
    }
    for (const [base, series] of byBase) {
      lines.push(`# HELP ${base} ${COUNTER_HELP[base] ?? base}`);
      lines.push(`# TYPE ${base} counter`);
      for (const [key, value] of series) lines.push(`${key} ${value}`);
    }

    if (this.durations.size > 0) {
      lines.push('# HELP http_request_duration_seconds HTTP request duration');
      lines.push('# TYPE http_request_duration_seconds summary');
      for (const { labels, sum, count } of this.durations.values()) {
        lines.push(`${withLabels('http_request_duration_seconds_sum', labels)} ${sum}`);
        lines.push(`${withLabels('http_request_duration_seconds_count', labels)} ${count}`);
      }
    }

    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`);

    return `${lines.join('\n')}\n`;
  }
}
