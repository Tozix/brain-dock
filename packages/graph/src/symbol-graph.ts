import type { RelationKind, RepositoryIndex } from '@brain-dock/indexer';

export interface GraphNode {
  name: string;
  file?: string;
  role?: string;
  kind?: string;
  /** True when the symbol is defined in the indexed repo (vs. an external type). */
  internal: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: RelationKind;
}

/**
 * Dependency graph over symbols. Edge `from → to` means `from` depends on `to`
 * (DI injection, extends, implements). Built from the indexer's relations.
 */
export class SymbolGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();
  readonly edges: GraphEdge[] = [];

  static fromIndex(index: RepositoryIndex): SymbolGraph {
    const graph = new SymbolGraph();
    for (const file of index.files) {
      for (const symbol of file.symbols) {
        graph.addNode({
          name: symbol.name,
          file: file.path,
          role: symbol.nestRole,
          kind: symbol.kind,
          internal: true,
        });
      }
      for (const relation of file.relations) {
        graph.addEdge(relation.from, relation.to, relation.kind);
      }
    }
    return graph;
  }

  addNode(node: GraphNode): void {
    const existing = this.nodes.get(node.name);
    // Prefer an internal definition over an external placeholder.
    if (!existing || (!existing.internal && node.internal)) this.nodes.set(node.name, node);
  }

  addEdge(from: string, to: string, kind: RelationKind): void {
    if (!this.nodes.has(from)) this.addNode({ name: from, internal: false });
    if (!this.nodes.has(to)) this.addNode({ name: to, internal: false });
    this.edges.push({ from, to, kind });
    (this.outgoing.get(from) ?? this.set(this.outgoing, from)).add(to);
    (this.incoming.get(to) ?? this.set(this.incoming, to)).add(from);
  }

  private set(map: Map<string, Set<string>>, key: string): Set<string> {
    const s = new Set<string>();
    map.set(key, s);
    return s;
  }

  has(name: string): boolean {
    return this.nodes.has(name);
  }

  node(name: string): GraphNode | undefined {
    return this.nodes.get(name);
  }

  /** Direct dependencies (what `name` depends on). */
  dependencies(name: string): string[] {
    return [...(this.outgoing.get(name) ?? [])];
  }

  /** Direct dependents (what depends on `name`). */
  dependents(name: string): string[] {
    return [...(this.incoming.get(name) ?? [])];
  }

  /** Transitive dependents — the blast radius if `name` changes. */
  impact(name: string): string[] {
    return this.traverse(name, this.incoming);
  }

  /** Transitive dependencies of `name`. */
  closure(name: string): string[] {
    return this.traverse(name, this.outgoing);
  }

  private traverse(start: string, edges: Map<string, Set<string>>): string[] {
    const seen = new Set<string>();
    const queue = [...(edges.get(start) ?? [])];
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      for (const neighbor of edges.get(next) ?? []) {
        if (!seen.has(neighbor)) queue.push(neighbor);
      }
    }
    return [...seen];
  }
}
