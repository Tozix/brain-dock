import { describe, expect, it } from 'bun:test';
import { FixedWindowLimiter, InMemoryRateLimiter } from './rate-limit';

describe('FixedWindowLimiter', () => {
  it('allows up to max within a window, then blocks', () => {
    const limiter = new FixedWindowLimiter(3, 1000);
    expect(limiter.hit('k', 0).allowed).toBe(true);
    expect(limiter.hit('k', 100).allowed).toBe(true);
    expect(limiter.hit('k', 200).allowed).toBe(true);
    expect(limiter.hit('k', 300).allowed).toBe(false);
  });

  it('resets after the window elapses', () => {
    const limiter = new FixedWindowLimiter(1, 1000);
    expect(limiter.hit('k', 0).allowed).toBe(true);
    expect(limiter.hit('k', 500).allowed).toBe(false);
    expect(limiter.hit('k', 1000).allowed).toBe(true); // new window
  });

  it('tracks keys independently', () => {
    const limiter = new FixedWindowLimiter(1, 1000);
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('b', 0).allowed).toBe(true);
    expect(limiter.hit('a', 0).allowed).toBe(false);
  });
});

describe('InMemoryRateLimiter', () => {
  it('exposes the limiter via the async RateLimiter interface', async () => {
    const limiter = new InMemoryRateLimiter(2, 1000);
    expect((await limiter.hit('k', 0)).allowed).toBe(true);
    expect((await limiter.hit('k', 1)).allowed).toBe(true);
    expect((await limiter.hit('k', 2)).allowed).toBe(false);
  });
});
