export interface RateDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * In-memory fixed-window rate limiter for the hosted MCP endpoint, keyed by API-key owner.
 * Deterministic: the caller supplies `now`. Per-process (a leaked/abusive key can't hammer a single
 * node unbounded); a Redis-backed shared limiter can replace it for multi-node, like the REST API.
 *
 * Expired windows are replaced lazily on `hit()`; abandoned keys are dropped by a periodic,
 * unref'd sweep so the map does not grow without bound.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private readonly sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    sweepIntervalMs = 60_000,
  ) {
    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => this.sweep(Date.now()), sweepIntervalMs);
      this.sweepTimer.unref?.();
    }
  }

  /** Count a request for `key`; `max` overrides the default cap (e.g. a per-API-key limit). */
  hit(key: string, now: number, max = this.max): RateDecision {
    const window = this.windows.get(key);
    if (!window || now >= window.resetAt) {
      const resetAt = now + this.windowMs;
      this.windows.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: max - 1, resetAt };
    }
    window.count += 1;
    return {
      allowed: window.count <= max,
      remaining: Math.max(0, max - window.count),
      resetAt: window.resetAt,
    };
  }

  /** Drop every window that expired before `now`. */
  sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (now >= window.resetAt) this.windows.delete(key);
    }
  }

  /** Number of tracked windows (for tests/metrics). */
  get size(): number {
    return this.windows.size;
  }

  /** Stop the periodic sweep (shutdown/tests). */
  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }
}
