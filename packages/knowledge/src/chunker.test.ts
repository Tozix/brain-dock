import { describe, expect, it } from 'bun:test';
import { chunkText } from './chunker';

describe('chunkText', () => {
  it('keeps small text as a single chunk', () => {
    expect(chunkText('hello world')).toEqual(['hello world']);
  });

  it('starts a new chunk when the limit would be exceeded', () => {
    const para = 'a'.repeat(60);
    const chunks = chunkText([para, para, para].join('\n\n'), { maxChars: 100 });
    expect(chunks).toHaveLength(3);
  });

  it('hard-splits a paragraph longer than the limit', () => {
    const chunks = chunkText('x'.repeat(500), { maxChars: 100, overlap: 0 });
    expect(chunks).toHaveLength(5);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
  });

  it('returns an empty array for blank input', () => {
    expect(chunkText('   \n\n  ')).toEqual([]);
  });
});
