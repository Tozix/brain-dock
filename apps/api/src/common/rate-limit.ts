import { RedisClient } from 'bun';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** DI token for the active rate limiter. */
export const RATE_LIMITER = Symbol('RATE_LIMITER');

/** Pluggable rate limiter (in-memory or Redis-backed). */
export interface RateLimiter {
  hit(key: string, now: number): Promise<RateLimitDecision>;
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

/** Per-process limiter (wraps FixedWindowLimiter behind the async RateLimiter interface). */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly limiter: FixedWindowLimiter;

  constructor(max: number, windowMs: number) {
    this.limiter = new FixedWindowLimiter(max, windowMs);
  }

  async hit(key: string, now: number): Promise<RateLimitDecision> {
    return this.limiter.hit(key, now);
  }
}

/** Cross-instance limiter using Redis INCR + EXPIRE on a per-window bucket key. */
export class RedisRateLimiter implements RateLimiter {
  private readonly client: RedisClient;
  private readonly windowSeconds: number;

  constructor(
    url: string,
    private readonly max: number,
    private readonly windowMs: number,
  ) {
    this.client = new RedisClient(url);
    this.windowSeconds = Math.ceil(windowMs / 1000);
  }

  async hit(key: string, now: number): Promise<RateLimitDecision> {
    const bucket = Math.floor(now / this.windowMs);
    const rkey = `bd:rl:${key}:${bucket}`;
    const count = await this.client.incr(rkey);
    if (count === 1) await this.client.expire(rkey, this.windowSeconds);
    return {
      allowed: count <= this.max,
      remaining: Math.max(0, this.max - count),
      resetAt: (bucket + 1) * this.windowMs,
    };
  }
}
