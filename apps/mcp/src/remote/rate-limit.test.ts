import { describe, expect, it } from 'bun:test';
import { FixedWindowLimiter } from './rate-limit';

describe('FixedWindowLimiter', () => {
  it('allows up to max per window, then blocks', () => {
    const l = new FixedWindowLimiter(2, 1000);
    expect(l.hit('k', 0).allowed).toBe(true);
    expect(l.hit('k', 100).allowed).toBe(true);
    const third = l.hit('k', 200);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('resets after the window and isolates keys', () => {
    const l = new FixedWindowLimiter(1, 1000);
    expect(l.hit('a', 0).allowed).toBe(true);
    expect(l.hit('a', 500).allowed).toBe(false);
    expect(l.hit('a', 1000).allowed).toBe(true); // new window
    expect(l.hit('b', 500).allowed).toBe(true); // different key
  });
});
