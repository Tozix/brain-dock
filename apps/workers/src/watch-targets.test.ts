import { describe, expect, it } from 'bun:test';
import { repositoriesToWatchTargets } from './watch-targets';

describe('repositoriesToWatchTargets', () => {
  it('maps repository rows to watch targets carrying alias + id', () => {
    const targets = repositoriesToWatchTargets([
      { id: 'r1', projectId: 'p1', alias: 'api', root: './apps/api' },
      { id: 'r2', projectId: 'p1', alias: 'web', root: './apps/web' },
    ]);

    expect(targets).toEqual([
      {
        rootDir: './apps/api',
        projectId: 'p1',
        collection: 'code',
        repo: 'api',
        repositoryId: 'r1',
      },
      {
        rootDir: './apps/web',
        projectId: 'p1',
        collection: 'code',
        repo: 'web',
        repositoryId: 'r2',
      },
    ]);
  });

  it('honours a custom collection and an empty list', () => {
    expect(repositoriesToWatchTargets([], 'code_v2')).toEqual([]);
    const [t] = repositoriesToWatchTargets(
      [{ id: 'r1', projectId: 'p1', alias: 'api', root: '.' }],
      'code_v2',
    );
    expect(t?.collection).toBe('code_v2');
  });
});
