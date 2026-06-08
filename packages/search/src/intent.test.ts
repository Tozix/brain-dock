import { describe, expect, it } from 'bun:test';
import { detectIntent } from './intent';

describe('detectIntent', () => {
  it('classifies common query phrasings', () => {
    expect(detectIntent('why does the login fail with an exception').intent).toBe('debug');
    expect(detectIntent('refactor the auth module to simplify it').intent).toBe('refactor');
    expect(detectIntent('add a new endpoint to create projects').intent).toBe('modify');
    expect(detectIntent('how does authentication work here').intent).toBe('explore');
  });

  it('defaults to explore and always returns role boosts', () => {
    const result = detectIntent('cats');
    expect(result.intent).toBe('explore');
    expect(Object.keys(result.roleBoosts).length).toBeGreaterThan(0);
  });
});
