import { createHash } from 'node:crypto';

/** Stable content hash (sha256 hex) used for chunk ids and incremental reindexing. */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
