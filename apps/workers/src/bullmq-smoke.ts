#!/usr/bin/env bun
// Smoke test: verify BullMQ works on the Bun runtime against Redis (ADR-0001 open risk).
// Requires Redis up (`bun run infra:up`). Usage: bun apps/workers/src/bullmq-smoke.ts
import { Queue, QueueEvents, Worker } from 'bullmq';
import { redisConnection } from './redis';

const connection = redisConnection(process.env.REDIS_URL ?? 'redis://localhost:16379');
const name = 'brain-dock-smoke';

const worker = new Worker<{ x: number }, number>(name, async (job) => job.data.x * 2, {
  connection,
});
const queue = new Queue<{ x: number }, number>(name, { connection });
const events = new QueueEvents(name, { connection });
await events.waitUntilReady();

const job = await queue.add('double', { x: 21 });
const result = await job.waitUntilFinished(events);

console.log(`bullmq-on-bun OK: double(21) = ${result}`);

await worker.close();
await queue.close();
await events.close();
process.exit(result === 42 ? 0 : 1);
