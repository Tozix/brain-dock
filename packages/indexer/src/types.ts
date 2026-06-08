/** Coarse syntactic kind of a top-level symbol. */
export type SymbolKind = 'class' | 'interface' | 'type' | 'enum' | 'function';

/** NestJS/architectural role inferred from decorators or naming conventions. */
export type NestRole =
  | 'controller'
  | 'service'
  | 'module'
  | 'guard'
  | 'pipe'
  | 'filter'
  | 'interceptor'
  | 'resolver'
  | 'repository'
  | 'dto'
  | 'entity'
  | 'none';

export type RelationKind = 'injects' | 'extends' | 'implements' | 'imports';

export interface DecoratorInfo {
  name: string;
  args: string[];
}

export interface RouteInfo {
  /** HTTP verb decorator, lowercased (get/post/put/patch/delete/all/...). */
  method: string;
  path: string;
  handler: string;
}

export interface SymbolRelation {
  from: string;
  to: string;
  kind: RelationKind;
}

export interface ImportRef {
  module: string;
  names: string[];
  typeOnly: boolean;
}

export interface IndexedSymbol {
  name: string;
  kind: SymbolKind;
  nestRole: NestRole;
  exported: boolean;
  decorators: DecoratorInfo[];
  startLine: number;
  endLine: number;
  /** Constructor parameter types — DI dependencies (for classes). */
  dependencies: string[];
  /** HTTP routes (for controllers). */
  routes: RouteInfo[];
}

/** A unit of indexable content (one per symbol). Feeds embeddings in Phase 3. */
export interface Chunk {
  id: string;
  symbol: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  hash: string;
  text: string;
}

export interface FileExtraction {
  symbols: IndexedSymbol[];
  imports: ImportRef[];
  relations: SymbolRelation[];
  chunks: Chunk[];
}

export interface FileIndex extends FileExtraction {
  /** Path relative to the repository root. */
  path: string;
  /** sha256 of the file content — drives incremental reindexing. */
  hash: string;
}

export interface IndexStats {
  files: number;
  symbols: number;
  chunks: number;
  relations: number;
}

export interface RepositoryIndex {
  rootDir: string;
  files: FileIndex[];
  stats: IndexStats;
}
