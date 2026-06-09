import type { RelationKind, RepositoryIndex } from '@brain-dock/indexer';

export interface GraphNode {
  name: string;
  file?: string;
  role?: string;
  kind?: string;
  /** Repository alias where the symbol is defined (set for internal nodes in a merged graph). */
  repo?: string;
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

  static fromIndex(index: RepositoryIndex, repo?: string): SymbolGraph {
    const graph = new SymbolGraph();
    for (const file of index.files) {
      for (const symbol of file.symbols) {
        graph.addNode({
          name: symbol.name,
          file: file.path,
          role: symbol.nestRole,
          kind: symbol.kind,
          repo,
          internal: true,
        });
      }
      for (const relation of file.relations) {
        graph.addEdge(relation.from, relation.to, relation.kind);
      }
    }
    return graph;
  }

  /**
   * Merge per-repo graphs into one, linking cross-repo references: a symbol that is external
   * (unresolved) in one repo and internal (defined) in another collapses into a single internal
   * node, so edges from every repo form one connected graph. Name collisions (a symbol defined
   * internally in more than one repo) keep the first definition seen.
   */
  static merge(graphs: SymbolGraph[]): SymbolGraph {
    const merged = new SymbolGraph();
    for (const graph of graphs) {
      for (const node of graph.nodeList()) merged.addNode(node);
      for (const edge of graph.edges) merged.addEdge(edge.from, edge.to, edge.kind);
    }
    return merged;
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

  /** All nodes, in insertion order. */
  nodeList(): GraphNode[] {
    return [...this.nodes.values()];
  }

  /** Serialize the whole graph (nodes + edges) — e.g. for tooling or visualization. */
  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return { nodes: this.nodeList(), edges: [...this.edges] };
  }

  /** Render the graph as Graphviz DOT (external symbols dashed; edges labelled by relation). */
  toDot(): string {
    const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const lines = ['digraph deps {', '  rankdir=LR;', '  node [shape=box];'];
    for (const node of this.nodes.values()) {
      const attrs: string[] = [];
      if (!node.internal) attrs.push('style=dashed');
      if (node.role && node.role !== 'none') attrs.push(`label=${q(`${node.role}\n${node.name}`)}`);
      lines.push(`  ${q(node.name)}${attrs.length > 0 ? ` [${attrs.join(', ')}]` : ''};`);
    }
    for (const edge of this.edges) {
      lines.push(`  ${q(edge.from)} -> ${q(edge.to)} [label=${q(edge.kind)}];`);
    }
    lines.push('}');
    return lines.join('\n');
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
