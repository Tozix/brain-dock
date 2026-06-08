import { describe, expect, it } from 'bun:test';
import type { FileInput } from './indexer';
import { RepositoryIndexer } from './indexer';

const controller = `
import { Controller, Get, Post } from '@nestjs/common';
import { CatsService } from './cats.service';

@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Get()
  findAll() {
    return this.catsService.findAll();
  }

  @Post(':id')
  create() {
    return 'ok';
  }
}
`;

const service = `
import { Injectable } from '@nestjs/common';

@Injectable()
export class CatsService {
  findAll() {
    return [];
  }
}
`;

const guard = `
import type { CanActivate } from '@nestjs/common';

export class AuthGuard implements CanActivate {
  canActivate() {
    return true;
  }
}
`;

const misc = `
export interface Cat {
  name: string;
}
export type CatId = string;
export enum CatStatus {
  Active,
  Inactive,
}
export function makeCat(): Cat {
  return { name: 'x' };
}
`;

const files: FileInput[] = [
  { path: 'cats/cats.controller.ts', content: controller },
  { path: 'cats/cats.service.ts', content: service },
  { path: 'common/auth.guard.ts', content: guard },
  { path: 'cats/cat.model.ts', content: misc },
];

function indexFixtures() {
  return new RepositoryIndexer().indexFiles('/repo', files);
}

describe('RepositoryIndexer — extraction', () => {
  const index = indexFixtures();
  const byPath = (p: string) => {
    const file = index.files.find((f) => f.path === p);
    if (!file) throw new Error(`fixture file not indexed: ${p}`);
    return file;
  };
  const symbol = (p: string, name: string) => {
    const found = byPath(p).symbols.find((s) => s.name === name);
    if (!found) throw new Error(`symbol not found: ${name} in ${p}`);
    return found;
  };

  it('classifies a NestJS controller with routes and DI dependencies', () => {
    const ctrl = symbol('cats/cats.controller.ts', 'CatsController');
    expect(ctrl.kind).toBe('class');
    expect(ctrl.nestRole).toBe('controller');
    expect(ctrl.exported).toBe(true);
    expect(ctrl.dependencies).toContain('CatsService');
    expect(ctrl.routes).toHaveLength(2);
    expect(ctrl.routes.map((r) => r.method).sort()).toEqual(['get', 'post']);
    expect(ctrl.routes.find((r) => r.method === 'post')?.path).toBe(':id');
  });

  it('records an injects relation from controller to service', () => {
    const relations = byPath('cats/cats.controller.ts').relations;
    expect(relations).toContainEqual({
      from: 'CatsController',
      to: 'CatsService',
      kind: 'injects',
    });
  });

  it('classifies an Injectable as a service', () => {
    expect(symbol('cats/cats.service.ts', 'CatsService').nestRole).toBe('service');
  });

  it('classifies a guard via its implements clause', () => {
    expect(symbol('common/auth.guard.ts', 'AuthGuard').nestRole).toBe('guard');
  });

  it('extracts interfaces, type aliases, enums and functions', () => {
    const kinds = byPath('cats/cat.model.ts').symbols.reduce<Record<string, string>>((acc, s) => {
      acc[s.name] = s.kind;
      return acc;
    }, {});
    expect(kinds).toMatchObject({
      Cat: 'interface',
      CatId: 'type',
      CatStatus: 'enum',
      makeCat: 'function',
    });
  });

  it('captures imports with module specifiers', () => {
    const imports = byPath('cats/cats.controller.ts').imports;
    const nest = imports.find((i) => i.module === '@nestjs/common');
    expect(nest?.names).toEqual(expect.arrayContaining(['Controller', 'Get', 'Post']));
    expect(imports.find((i) => i.module === './cats.service')?.names).toContain('CatsService');
  });

  it('produces one chunk per symbol with a content hash', () => {
    const ctrlFile = byPath('cats/cats.controller.ts');
    expect(ctrlFile.chunks).toHaveLength(ctrlFile.symbols.length);
    for (const chunk of ctrlFile.chunks) {
      expect(chunk.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('aggregates repository stats', () => {
    expect(index.stats.files).toBe(4);
    expect(index.stats.symbols).toBeGreaterThanOrEqual(7);
    expect(index.stats.chunks).toBe(index.stats.symbols);
  });
});

describe('RepositoryIndexer — incremental', () => {
  it('reuses unchanged files and re-parses changed ones', () => {
    const indexer = new RepositoryIndexer();
    const first = indexer.indexFiles('/repo', files);

    const changed = files.map((f) =>
      f.path === 'cats/cats.service.ts' ? { ...f, content: `${f.content}\n// touched` } : f,
    );
    const second = indexer.indexFiles('/repo', changed, { previous: first });

    const firstCtrl = first.files.find((f) => f.path === 'cats/cats.controller.ts');
    const secondCtrl = second.files.find((f) => f.path === 'cats/cats.controller.ts');
    const firstSvc = first.files.find((f) => f.path === 'cats/cats.service.ts');
    const secondSvc = second.files.find((f) => f.path === 'cats/cats.service.ts');

    // Unchanged controller is the very same object (reused, not re-parsed).
    expect(secondCtrl).toBe(firstCtrl);
    // Changed service is a fresh object with a different hash.
    expect(secondSvc).not.toBe(firstSvc);
    expect(secondSvc?.hash).not.toBe(firstSvc?.hash);
  });
});
