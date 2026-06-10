import { describe, expect, it } from 'bun:test';
import { bm25DocumentVector, bm25QueryVector, tokenIndex, tokenizeCode } from './tokenize';

describe('tokenizeCode', () => {
  it('splits camelCase identifiers and keeps the lowercased original', () => {
    expect(tokenizeCode('ensureCollection')).toEqual(['ensurecollection', 'ensure', 'collection']);
  });

  it('splits snake_case identifiers and keeps the original', () => {
    expect(tokenizeCode('rate_limit')).toEqual(['rate_limit', 'rate', 'limit']);
  });

  it('handles acronym boundaries (HTMLParser → html + parser)', () => {
    expect(tokenizeCode('HTMLParser')).toEqual(['htmlparser', 'html', 'parser']);
  });

  it('does not duplicate sub-tokens equal to the original', () => {
    expect(tokenizeCode('token')).toEqual(['token']);
  });

  it('splits on non-word characters and preserves cross-document repeats', () => {
    expect(tokenizeCode('foo.bar(foo)')).toEqual(['foo', 'bar', 'foo']);
  });

  it('keeps digits attached to their identifier part', () => {
    expect(tokenizeCode('sha256')).toEqual(['sha256']);
  });
});

describe('tokenIndex', () => {
  it('is a deterministic unsigned 32-bit hash', () => {
    expect(tokenIndex('auth')).toBe(tokenIndex('auth'));
    expect(tokenIndex('auth')).toBeGreaterThanOrEqual(0);
    expect(tokenIndex('auth')).toBeLessThanOrEqual(0xffffffff);
    expect(tokenIndex('auth')).not.toBe(tokenIndex('Auth'));
  });
});

describe('bm25DocumentVector', () => {
  const weightOf = (tokens: string[], token: string): number => {
    const { indices, values } = bm25DocumentVector(tokens);
    const at = indices.indexOf(tokenIndex(token));
    return at === -1 ? 0 : (values[at] ?? 0);
  };

  it('weights a repeated token higher than a singleton (saturating tf)', () => {
    const tokens = ['auth', 'auth', 'auth', 'token'];
    expect(weightOf(tokens, 'auth')).toBeGreaterThan(weightOf(tokens, 'token'));
  });

  it('weights the same tf lower in a longer document (length normalization)', () => {
    const short = ['auth', 'token'];
    const long = ['auth', ...Array.from({ length: 400 }, (_, i) => `filler${i}`)];
    expect(weightOf(short, 'auth')).toBeGreaterThan(weightOf(long, 'auth'));
  });

  it('emits parallel indices/values with no duplicate indices', () => {
    const { indices, values } = bm25DocumentVector(tokenizeCode('ensureCollection ensures'));
    expect(indices).toHaveLength(values.length);
    expect(new Set(indices).size).toBe(indices.length);
    for (const v of values) expect(v).toBeGreaterThan(0);
  });
});

describe('bm25QueryVector', () => {
  it('assigns weight 1 per unique token (IDF is applied by Qdrant)', () => {
    const { indices, values } = bm25QueryVector(['auth', 'auth', 'token']);
    expect(indices).toHaveLength(2);
    expect(values).toEqual([1, 1]);
  });
});
