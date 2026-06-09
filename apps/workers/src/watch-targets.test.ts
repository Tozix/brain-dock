import { describe, expect, it } from 'bun:test';
import {
  reconcileWatchTargets,
  repositoriesToWatchTargets,
  type WatchTarget,
} from './watch-targets';

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
});

describe('reconcileWatchTargets', () => {
  const t = (id: string, root: string): WatchTarget => ({
    rootDir: root,
    projectId: 'p1',
    collection: 'code',
    repo: id,
    repositoryId: id,
  });

  it('starts new, stops gone, and restarts changed repos', () => {
    const active = new Map<string, WatchTarget>([
      ['keep', t('keep', './keep')],
      ['gone', t('gone', './gone')],
      ['moved', t('moved', './old')],
    ]);
    const desired = [t('keep', './keep'), t('moved', './new'), t('fresh', './fresh')];

    const diff = reconcileWatchTargets(desired, active);
    expect(diff.toStart.map((x) => x.repositoryId)).toEqual(['fresh']);
    expect(diff.toStop).toEqual(['gone']);
    expect(diff.toRestart.map((x) => x.repositoryId)).toEqual(['moved']);
  });

  it('is a no-op when nothing changed', () => {
    const active = new Map<string, WatchTarget>([['a', t('a', './a')]]);
    const diff = reconcileWatchTargets([t('a', './a')], active);
    expect(diff).toEqual({ toStart: [], toStop: [], toRestart: [] });
  });
});

describe('repositoriesToWatchTargets — collection', () => {
  it('honours a custom collection and an empty list', () => {
    expect(repositoriesToWatchTargets([], 'code_v2')).toEqual([]);
    const [t] = repositoriesToWatchTargets(
      [{ id: 'r1', projectId: 'p1', alias: 'api', root: '.' }],
      'code_v2',
    );
    expect(t?.collection).toBe('code_v2');
  });
});
