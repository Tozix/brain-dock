import type { SparseVector } from '@brain-dock/storage';

/**
 * Code-aware tokenization + BM25 term weighting for the sparse side of hybrid search.
 * Identifiers are split on camelCase/snake_case boundaries while the original token is kept, so
 * `ensureCollection` matches both the exact identifier and the words "ensure"/"collection".
 * Qdrant applies the IDF component itself (`modifier: 'idf'`), so only the tf side lives here.
 */

const RAW_TOKEN_RE = /[\p{L}\p{N}_]+/gu;
const CAMEL_SPLIT_RE = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

const BM25_K1 = 1.2;
const BM25_B = 0.75;
/** Assumed average document length (tokens) — collection-level stats are not tracked. */
const AVG_DOC_TOKENS = 200;

/** 32-bit FNV-1a hash — the sparse vector index of a token. */
export function tokenIndex(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Tokenize source code / queries: split on non-word characters, then expand each raw token into
 * its camelCase/snake_case parts plus the lowercased original (deduplicated per raw token).
 * Repeats across the document are preserved — they drive the BM25 term frequency.
 */
export function tokenizeCode(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(RAW_TOKEN_RE) ?? []) {
    const expansion = new Set<string>([raw.toLowerCase()]);
    for (const part of raw.split('_')) {
      for (const sub of part.split(CAMEL_SPLIT_RE)) {
        if (sub) expansion.add(sub.toLowerCase());
      }
    }
    out.push(...expansion);
  }
  return out;
}

/**
 * BM25 document-side weights: value = tf·(k1+1) / (tf + k1·(1 − b + b·len/avgLen)).
 * Repeated terms weigh more (saturating), longer documents weigh less.
 */
export function bm25DocumentVector(tokens: string[]): SparseVector {
  const tf = new Map<number, number>();
  for (const token of tokens) {
    const index = tokenIndex(token);
    tf.set(index, (tf.get(index) ?? 0) + 1);
  }
  const lengthNorm = BM25_K1 * (1 - BM25_B + (BM25_B * tokens.length) / AVG_DOC_TOKENS);
  const indices: number[] = [];
  const values: number[] = [];
  for (const [index, frequency] of tf) {
    indices.push(index);
    values.push((frequency * (BM25_K1 + 1)) / (frequency + lengthNorm));
  }
  return { indices, values };
}

/** BM25 query-side vector: weight 1 per unique term — Qdrant multiplies in IDF at query time. */
export function bm25QueryVector(tokens: string[]): SparseVector {
  const indices = [...new Set(tokens.map(tokenIndex))];
  return { indices, values: indices.map(() => 1) };
}
