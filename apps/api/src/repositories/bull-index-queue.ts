import { INDEX_QUEUE, type IndexJob, type IndexQueue, injectTraceContext } from '@brain-dock/core';
import { Queue } from 'bullmq';

function redisConnection(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port) || 6379 };
}

/**
 * BullMQ-backed producer for the shared index queue. Imported only by the module
 * (not by the service/tests) — bullmq → msgpackr loads a native addon that crashes
 * under Bun unless run with `--no-addons` (see apps/api start/dev scripts).
 */
export class BullIndexQueue implements IndexQueue {
  private readonly queue: Queue<IndexJob>;

  constructor(redisUrl: string) {
    this.queue = new Queue<IndexJob>(INDEX_QUEUE, {
      connection: redisConnection(redisUrl),
      // Retry transient failures with backoff; cap kept history so Redis doesn't grow unbounded.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }

  async enqueue(job: IndexJob): Promise<void> {
    // Upload jobs index a throwaway staging dir the API just wrote: don't retry (the bytes only
    // existed for that request — a retry would re-run the same now-stale dir or, after the worker
    // deletes it, find nothing), and drop the job on completion so large file trees don't linger
    // in Redis. Server-path jobs keep the default retry/backoff (the path persists).
    const options = job.kind === 'upload' ? { attempts: 1, removeOnComplete: true } : undefined;
    // Carry the active trace context so the worker's span links to this request.
    await this.queue.add('index', { ...job, trace: injectTraceContext() }, options);
  }
}
