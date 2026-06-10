/**
 * Build BullMQ connection options from a redis:// URL. The full URL is passed through (BullMQ
 * hands it to `new IORedis(url, rest)` internally), so credentials, db index and TLS
 * (rediss://) are preserved — unlike parsing out host/port only.
 * `maxRetriesPerRequest: null` is what BullMQ requires for blocking worker connections.
 */
export function redisConnection(url: string): { url: string; maxRetriesPerRequest: null } {
  return { url, maxRetriesPerRequest: null };
}
