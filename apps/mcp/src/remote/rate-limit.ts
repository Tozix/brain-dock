export interface RateDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter for the hosted MCP endpoint, keyed by API-key owner.
 * Deterministic: the caller supplies `now`. Per-process (a leaked/abusive key can't hammer a single
 * node unbounded); a Redis-backed shared limiter can replace it for multi-node, like the REST API.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string, now: number): RateDecision {
    const window = this.windows.get(key);
    if (!window || now >= window.resetAt) {
      const resetAt = now + this.windowMs;
      this.windows.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.max - 1, resetAt };
    }
    window.count += 1;
    return {
      allowed: window.count <= this.max,
      remaining: Math.max(0, this.max - window.count),
      resetAt: window.resetAt,
    };
  }
}
