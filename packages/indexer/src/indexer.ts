import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { AstEngine } from './ast-engine';
import { sha256 } from './hash';
import { TsMorphEngine } from './ts-morph-engine';
import type { FileIndex, IndexStats, RepositoryIndex } from './types';

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.turbo', '.git', 'generated', 'coverage']);

function isIndexable(fileName: string): boolean {
  return /\.tsx?$/.test(fileName) && !fileName.endsWith('.d.ts');
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
    } else if (entry.isFile() && isIndexable(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

function computeStats(files: FileIndex[]): IndexStats {
  return {
    files: files.length,
    symbols: files.reduce((n, f) => n + f.symbols.length, 0),
    chunks: files.reduce((n, f) => n + f.chunks.length, 0),
    relations: files.reduce((n, f) => n + f.relations.length, 0),
  };
}

export interface FileInput {
  path: string;
  content: string;
}

export interface IndexOptions {
  /** Previous index — unchanged files (by content hash) are reused, not re-parsed. */
  previous?: RepositoryIndex;
  /** Optional filter on the repo-relative path. */
  include?: (relativePath: string) => boolean;
}

export class RepositoryIndexer {
  constructor(private readonly engine: AstEngine = new TsMorphEngine()) {}

  /** Index a directory tree on disk. */
  index(rootDir: string, options: IndexOptions = {}): RepositoryIndex {
    const inputs: FileInput[] = [];
    let skippedFiles = 0;
    for (const abs of walk(rootDir)) {
      const relPath = toPosix(relative(rootDir, abs));
      if (options.include && !options.include(relPath)) continue;
      let content: string;
      try {
        content = readFileSync(abs, 'utf8');
      } catch (error) {
        // One unreadable file (EACCES, races with deletes, …) must not fail the whole index.
        skippedFiles++;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[indexer] skipping unreadable file ${relPath}: ${message}`);
        continue;
      }
      inputs.push({ path: relPath, content });
    }
    const index = this.indexFiles(rootDir, inputs, options);
    return { ...index, stats: { ...index.stats, skippedFiles } };
  }

  /** Index an explicit set of in-memory files (used in tests and by callers that already read files). */
  indexFiles(rootDir: string, inputs: FileInput[], options: IndexOptions = {}): RepositoryIndex {
    const previousByPath = new Map((options.previous?.files ?? []).map((f) => [f.path, f]));

    const files = inputs.map((input) => {
      const hash = sha256(input.content);
      const previous = previousByPath.get(input.path);
      if (previous && previous.hash === hash) return previous; // incremental reuse
      const extraction = this.engine.extract(input.path, input.content);
      return { path: input.path, hash, ...extraction } satisfies FileIndex;
    });

    return { rootDir, files, stats: computeStats(files) };
  }
}
