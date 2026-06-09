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
