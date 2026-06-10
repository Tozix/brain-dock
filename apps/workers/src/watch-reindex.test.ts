import { describe, expect, it } from 'bun:test';
import { DeterministicEmbeddingProvider } from '@brain-dock/embedding';
import { shouldScheduleReindex, startWatchReindexer } from './watch-reindex';

describe('shouldScheduleReindex', () => {
  it('schedules rename events regardless of extension (covers deleted dirs)', () => {
    expect(shouldScheduleReindex('rename', 'some-dir')).toBe(true);
    expect(shouldScheduleReindex('rename', 'notes.md')).toBe(true);
    expect(shouldScheduleReindex('rename', 'a.ts')).toBe(true);
    expect(shouldScheduleReindex('rename', null)).toBe(true);
  });

  it('filters change events to .ts/.tsx sources', () => {
    expect(shouldScheduleReindex('change', 'a.ts')).toBe(true);
    expect(shouldScheduleReindex('change', 'a.tsx')).toBe(true);
    expect(shouldScheduleReindex('change', 'README.md')).toBe(false);
    expect(shouldScheduleReindex('change', 'image.png')).toBe(false);
  });

  it('schedules change events without a filename (platforms may omit it)', () => {
    expect(shouldScheduleReindex('change', null)).toBe(true);
  });
});

describe('startWatchReindexer', () => {
  it('throws a clear error when the root directory does not exist', () => {
    expect(() =>
      startWatchReindexer({
        rootDir: '/nonexistent/brain-dock-watch-test',
        projectId: 'p1',
        collection: 'code',
        qdrantUrl: 'http://localhost:16333',
        embedder: new DeterministicEmbeddingProvider(8),
      }),
    ).toThrow('watch root does not exist');
  });
});
