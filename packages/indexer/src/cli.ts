#!/usr/bin/env bun
import { RepositoryIndexer } from './indexer';
import type { NestRole } from './types';

/** Dev CLI: `bun packages/indexer/src/cli.ts <dir> [--json]`. */
function main(): void {
  const root = process.argv[2] ?? process.cwd();
  const asJson = process.argv.includes('--json');

  const result = new RepositoryIndexer().index(root, {
    include: (p) => !p.includes('.test.') && !p.includes('.spec.'),
  });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`brain-dock index — ${result.rootDir}`);
  console.log(`  files:     ${result.stats.files}`);
  console.log(`  symbols:   ${result.stats.symbols}`);
  console.log(`  chunks:    ${result.stats.chunks}`);
  console.log(`  relations: ${result.stats.relations}`);

  const roles = new Map<NestRole, number>();
  for (const file of result.files) {
    for (const symbol of file.symbols) {
      if (symbol.nestRole !== 'none') {
        roles.set(symbol.nestRole, (roles.get(symbol.nestRole) ?? 0) + 1);
      }
    }
  }
  if (roles.size > 0) {
    console.log('  roles:');
    for (const [role, count] of [...roles].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${role}: ${count}`);
    }
  }
}

main();
