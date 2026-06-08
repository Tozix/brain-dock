/**
 * Derive a deterministic UUID (v4-shaped) from a hex hash so chunk content hashes
 * become valid Qdrant point ids. Same input → same id (stable upserts).
 */
export function uuidFromHash(hash: string): string {
  const hex = hash
    .replace(/[^a-f0-9]/gi, '')
    .padEnd(32, '0')
    .slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
