import { describe, expect, it } from 'bun:test';
import { redisConnection } from './redis';

describe('redisConnection', () => {
  it('passes the full URL through so credentials/db/TLS survive', () => {
    const url = 'rediss://user:secret@redis.internal:6380/2';
    expect(redisConnection(url)).toEqual({ url, maxRetriesPerRequest: null });
  });

  it('disables request retries as BullMQ workers require', () => {
    expect(redisConnection('redis://localhost:16379').maxRetriesPerRequest).toBeNull();
  });
});
