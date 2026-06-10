import { isNotFoundError, type QdrantStore } from '@brain-dock/storage';

/**
 * Purges all Qdrant points of a project across the platform collections when the project is
 * deleted (Postgres rows are handled by FK cascades; vectors have no such mechanism).
 *
 * Best-effort by design: leftover points are unreachable anyway (every query filters by
 * projectId), so a vector-store outage must not block project deletion — failures are logged
 * loudly instead.
 */
export class VectorCleanupService {
  constructor(
    private readonly store: QdrantStore,
    private readonly collections: string[],
  ) {}

  async purgeProject(projectId: string): Promise<void> {
    for (const collection of this.collections) {
      try {
        await this.store.deleteByFilter(collection, {
          must: [{ key: 'projectId', match: { value: projectId } }],
        });
      } catch (error) {
        if (isNotFoundError(error)) continue; // collection not created yet — nothing to purge
        console.error(
          `[projects] failed to purge vectors of project ${projectId} from "${collection}" — ` +
            'orphan points remain (unreachable, projectId-filtered):',
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}
