import { describe, expect, it } from 'bun:test';
import { TsMorphEngine } from './ts-morph-engine';

const pad = (label: string) => `    // ${label} ${'x'.repeat(120)}\n`.repeat(4);

const bigClass = `
import { Injectable } from '@nestjs/common';

@Injectable()
export class BigService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly dep: string) {}

  alpha(): string {
${pad('alpha')}    return 'a';
  }

  beta(): string {
${pad('beta')}    return 'b';
  }

  gamma(): string {
${pad('gamma')}    return 'c';
  }
}
`;

const smallClass = `
export class SmallService {
  one(): number {
    return 1;
  }
}
`;

describe('TsMorphEngine — sub-chunking of large classes', () => {
  const engine = new TsMorphEngine({ subchunkThreshold: 300 });

  it('splits an oversized class into a header chunk plus one chunk per method', () => {
    const { chunks, symbols } = engine.extract('src/big.service.ts', bigClass);

    // 1 header + 3 methods; the symbol record itself stays a single class entry.
    expect(chunks).toHaveLength(4);
    expect(symbols.filter((s) => s.name === 'BigService')).toHaveLength(1);

    const header = chunks[0];
    expect(header?.symbol).toBe('BigService');
    expect(header?.text).toContain('src/big.service.ts > BigService');
    expect(header?.text).toContain('export class BigService {');
    expect(header?.text).toContain('constructor(private readonly dep: string)');
    expect(header?.text).not.toContain("return 'a'"); // method bodies live in their own chunks

    const methodChunks = chunks.slice(1);
    expect(methodChunks.map((c) => c.symbol)).toEqual([
      'BigService.alpha',
      'BigService.beta',
      'BigService.gamma',
    ]);
    for (const chunk of methodChunks) {
      // breadcrumb + class signature + the full method text
      expect(chunk.text).toContain('src/big.service.ts > BigService');
      expect(chunk.text).toContain('export class BigService {');
      expect(chunk.startLine).toBeGreaterThan(0);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
    expect(methodChunks[1]?.text).toContain("return 'b'");
  });

  it('gives every sub-chunk a deterministic, unique id', () => {
    const first = engine.extract('src/big.service.ts', bigClass);
    const second = engine.extract('src/big.service.ts', bigClass);
    expect(first.chunks.map((c) => c.id)).toEqual(second.chunks.map((c) => c.id));
    expect(new Set(first.chunks.map((c) => c.id)).size).toBe(first.chunks.length);
  });

  it('keeps a small class as a single chunk', () => {
    const { chunks } = engine.extract('src/small.service.ts', smallClass);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.symbol).toBe('SmallService');
    expect(chunks[0]?.text).not.toContain(' > '); // no breadcrumb on regular chunks
  });

  it('uses the default 6000-char threshold when no options are given', () => {
    const { chunks } = new TsMorphEngine().extract('src/big.service.ts', bigClass);
    expect(chunks).toHaveLength(1); // bigClass is ~2k chars — under the default threshold
  });
});
