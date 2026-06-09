export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

function hardSplit(s: string, maxChars: number, overlap: number): string[] {
  const out: string[] = [];
  const step = Math.max(1, maxChars - overlap);
  for (let i = 0; i < s.length; i += step) out.push(s.slice(i, i + maxChars));
  return out;
}

/**
 * Split text into chunks: pack paragraphs up to `maxChars`; paragraphs longer than
 * the limit are hard-split with `overlap`. One chunk per coherent block.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1200;
  const overlap = options.overlap ?? 100;

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...hardSplit(paragraph, maxChars, overlap));
      continue;
    }
    if (current && current.length + 2 + paragraph.length > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);

  if (chunks.length > 0) return chunks;
  const trimmed = text.trim();
  return trimmed ? [trimmed] : [];
}
