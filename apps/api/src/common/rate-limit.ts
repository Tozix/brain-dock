export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** In-memory fixed-window rate limiter. Deterministic: caller supplies `now`. */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string, now: number): RateLimitDecision {
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
