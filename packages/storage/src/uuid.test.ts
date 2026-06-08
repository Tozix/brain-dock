import { describe, expect, it } from 'bun:test';
import { uuidFromHash } from './uuid';

describe('uuidFromHash', () => {
  it('formats a hex hash as a UUID and is deterministic', () => {
    const hash = 'a'.repeat(64);
    const id = uuidFromHash(hash);
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
    expect(uuidFromHash(hash)).toBe(id);
  });

  it('maps different hashes to different ids', () => {
    expect(uuidFromHash('a'.repeat(64))).not.toBe(uuidFromHash('b'.repeat(64)));
  });
});
