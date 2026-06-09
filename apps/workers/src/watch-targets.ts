import { CODE_COLLECTION } from '@brain-dock/search';

/** The fields of a DB `Repository` row that the watcher needs. */
export interface RepoRow {
  id: string;
  projectId: string;
  alias: string;
  root: string;
}

/** Resolved watch target — one per repository. */
export interface WatchTarget {
  rootDir: string;
  projectId: string;
  collection: string;
  repo: string;
  repositoryId: string;
}

/** Map DB repository rows to watch targets (pure — the testable core of watch-all). */
export function repositoriesToWatchTargets(
  repos: RepoRow[],
  collection: string = CODE_COLLECTION,
): WatchTarget[] {
  return repos.map((r) => ({
    rootDir: r.root,
    projectId: r.projectId,
    collection,
    repo: r.alias,
    repositoryId: r.id,
  }));
}

/** How the desired watch set differs from the currently active one (keyed by repositoryId). */
export interface WatcherDiff {
  toStart: WatchTarget[];
  toStop: string[];
  toRestart: WatchTarget[];
}

function targetChanged(a: WatchTarget, b: WatchTarget): boolean {
  return a.rootDir !== b.rootDir || a.repo !== b.repo || a.collection !== b.collection;
}

/**
 * Reconcile the desired watch targets against the active ones: new repos → start, gone repos →
 * stop, and repos whose root/alias/collection changed → restart. Pure — the testable core of the
 * hot re-subscribe loop.
 */
export function reconcileWatchTargets(
  desired: WatchTarget[],
  active: Map<string, WatchTarget>,
): WatcherDiff {
  const desiredById = new Map(desired.map((t) => [t.repositoryId, t]));
  const diff: WatcherDiff = { toStart: [], toStop: [], toRestart: [] };

  for (const id of active.keys()) {
    if (!desiredById.has(id)) diff.toStop.push(id);
  }
  for (const target of desired) {
    const current = active.get(target.repositoryId);
    if (!current) diff.toStart.push(target);
    else if (targetChanged(current, target)) diff.toRestart.push(target);
  }
  return diff;
}
