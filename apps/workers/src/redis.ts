/** Parse a redis:// URL into BullMQ/ioredis connection options. */
export function redisConnection(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port) || 6379 };
}
