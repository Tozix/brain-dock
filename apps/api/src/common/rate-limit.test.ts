import { describe, expect, it } from 'bun:test';
import { FixedWindowLimiter } from './rate-limit';

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
