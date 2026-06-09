import { describe, expect, it } from 'bun:test';
import { RepositoryIndexer } from '@brain-dock/indexer';
import { SymbolGraph } from './symbol-graph';

const files = [
  {
    path: 'cats.controller.ts',
    content: `import { Controller } from '@nestjs/common';
import { CatsService } from './cats.service';
@Controller('cats')
export class CatsController {
  constructor(private readonly cats: CatsService) {}
}`,
  },
  {
    path: 'cats.service.ts',
    content: `import { Injectable } from '@nestjs/common';
import { CatsRepository } from './cats.repository';
@Injectable()
export class CatsService {
  constructor(private readonly repo: CatsRepository) {}
}`,
  },
  {
    path: 'cats.repository.ts',
    content: `import { Injectable } from '@nestjs/common';
@Injectable()
export class CatsRepository {}`,
  },
];

function buildGraph() {
  return SymbolGraph.fromIndex(new RepositoryIndexer().indexFiles('/repo', files));
}

describe('SymbolGraph', () => {
  const graph = buildGraph();

  it('records direct dependencies and dependents', () => {
    expect(graph.dependencies('CatsController')).toContain('CatsService');
    expect(graph.dependents('CatsService')).toContain('CatsController');
    expect(graph.dependents('CatsRepository')).toContain('CatsService');
  });

  it('computes the transitive blast radius (impact)', () => {
    expect(graph.impact('CatsRepository').sort()).toEqual(['CatsController', 'CatsService']);
  });

  it('computes the transitive dependency closure', () => {
    expect(graph.closure('CatsController').sort()).toEqual(['CatsRepository', 'CatsService']);
  });

  it('tags internal nodes with file and role', () => {
    const node = graph.node('CatsRepository');
    expect(node?.internal).toBe(true);
    expect(node?.role).toBe('repository');
    expect(node?.file).toBe('cats.repository.ts');
  });
});
