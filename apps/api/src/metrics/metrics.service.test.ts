import { describe, expect, it } from 'bun:test';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('renders Prometheus counters and a duration summary', () => {
    const m = new MetricsService();
    m.recordHttp('GET', '/health', 200, 5);
    m.recordHttp('GET', '/health', 200, 7);
    m.recordHttp('POST', '/api/v1/auth/login', 401, 10);
    m.incCounter('rate_limit_blocked_total');

    const out = m.render();
    expect(out).toContain('# TYPE http_requests_total counter');
    expect(out).toContain('http_requests_total{method="GET",route="/health",status="200"} 2');
    expect(out).toContain('http_request_duration_seconds_count{method="GET",route="/health"} 2');
    expect(out).toContain('rate_limit_blocked_total 1');
    expect(out).toContain('process_uptime_seconds');
  });

  it('escapes label values', () => {
    const m = new MetricsService();
    m.incCounter('http_requests_total', { route: 'a"b' });
    expect(m.render()).toContain('route="a\\"b"');
  });
});
