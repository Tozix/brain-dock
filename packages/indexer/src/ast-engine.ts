import type { FileExtraction } from './types';

/**
 * Pluggable AST backend. The current implementation is ts-morph (ADR / plan 002);
 * keeping it behind this port lets us swap to a faster parser (SWC/oxc) later
 * without touching the RepositoryIndexer.
 */
export interface AstEngine {
  /** Extract symbols, imports, relations and chunks from a single TS file (syntactic, per-file). */
  extract(filePath: string, content: string): FileExtraction;
}
