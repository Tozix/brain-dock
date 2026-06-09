import { INDEX_QUEUE, type IndexJob, type IndexQueue } from '@brain-dock/core';
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
    this.queue = new Queue<IndexJob>(INDEX_QUEUE, { connection: redisConnection(redisUrl) });
  }

  async enqueue(job: IndexJob): Promise<void> {
    await this.queue.add('index', job);
  }
}
