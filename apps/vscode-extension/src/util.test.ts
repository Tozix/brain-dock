import { describe, expect, it } from 'bun:test';
import {
  classifyUpload,
  findProject,
  isIndexablePath,
  normalizeBase,
  type Project,
  parseJsonRpc,
  parseSummary,
  pickProject,
  slugify,
  toolText,
} from './util';

describe('slugify', () => {
  it('lowercases and dasherizes', () => {
    expect(slugify('Brain Dock')).toBe('brain-dock');
    expect(slugify('My_App.v2')).toBe('my-app-v2');
  });
  it('trims dashes and falls back for empty input', () => {
    expect(slugify('  --Hello--  ')).toBe('hello');
    expect(slugify('!!!')).toBe('workspace');
  });
});

describe('normalizeBase', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeBase('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(normalizeBase('  https://api.example.com///  ')).toBe('https://api.example.com');
  });
});

describe('parseJsonRpc', () => {
  it('parses plain JSON', () => {
    const r = parseJsonRpc('{"result":{"content":[{"text":"hi"}]}}');
    expect(r.result?.content?.[0]?.text).toBe('hi');
  });

  it('parses an SSE data frame', () => {
    const sse = 'event: message\ndata: {"result":{"content":[{"text":"yo"}]}}\n\n';
    expect(parseJsonRpc(sse).result?.content?.[0]?.text).toBe('yo');
  });

  it('throws on garbage', () => {
    expect(() => parseJsonRpc('not json')).toThrow();
  });
});

describe('toolText', () => {
  it('returns the first content text', () => {
    expect(toolText('{"result":{"content":[{"text":"ok"}]}}')).toBe('ok');
  });

  it('throws on a JSON-RPC error', () => {
    expect(() => toolText('{"error":{"message":"boom"}}')).toThrow('boom');
  });
});

describe('parseSummary', () => {
  it('parses repos, files, symbols and roles', () => {
    const text = [
      'Repositories (1): brain-dock',
      'Files: 103',
      'Symbols: 247',
      'Roles:',
      '  module: 12',
      '  controller: 11',
    ].join('\n');
    const s = parseSummary(text);
    expect(s.repos).toEqual(['brain-dock']);
    expect(s.files).toBe(103);
    expect(s.symbols).toBe(247);
    expect(s.roles.module).toBe(12);
    expect(s.roles.controller).toBe(11);
  });

  it('is lenient with missing sections', () => {
    expect(parseSummary('')).toEqual({ files: 0, symbols: 0, edges: 0, repos: [], roles: {} });
  });

  it('parses edges', () => {
    expect(parseSummary('Edges: 86').edges).toBe(86);
  });

  it('does not mistake the "(none — reindex first)" placeholder for a repo name', () => {
    expect(parseSummary('Repositories (0): (none — reindex first)').repos).toEqual([]);
  });

  it('filters out names that are not plausible repo aliases', () => {
    const s = parseSummary('Repositories (2): api, (broken entry)');
    expect(s.repos).toEqual(['api']);
  });
});

describe('findProject / pickProject', () => {
  const projects: Project[] = [
    { id: 'id-1', name: 'Alpha', slug: 'alpha' },
    { id: 'id-2', name: 'Beta', slug: 'beta' },
  ];

  it('finds by slug or id', () => {
    expect(findProject(projects, 'beta')?.id).toBe('id-2');
    expect(findProject(projects, 'id-1')?.slug).toBe('alpha');
    expect(findProject(projects, 'missing')).toBeUndefined();
  });

  it('prefers the configured project when it still exists', () => {
    expect(pickProject(projects, 'beta', 'alpha')?.slug).toBe('beta');
    expect(pickProject(projects, 'id-2', 'alpha')?.slug).toBe('beta');
  });

  it('falls back to the folder slug when nothing (valid) is configured', () => {
    expect(pickProject(projects, undefined, 'alpha')?.slug).toBe('alpha');
    expect(pickProject(projects, 'gone', 'alpha')?.slug).toBe('alpha');
  });

  it('returns undefined when neither matches (a new project must be created)', () => {
    expect(pickProject(projects, 'gone', 'new-folder')).toBeUndefined();
  });
});

describe('isIndexablePath', () => {
  it('rejects declaration and minified files, accepts source', () => {
    expect(isIndexablePath('src/index.ts')).toBe(true);
    expect(isIndexablePath('types/global.d.ts')).toBe(false);
    expect(isIndexablePath('vendor/lib.min.js')).toBe(false);
  });
});

describe('classifyUpload', () => {
  const budget = 100;
  const maxFile = 50;

  it('adds files that fit both the per-file cap and the budget', () => {
    expect(classifyUpload('a.ts', 40, 0, budget, maxFile)).toBe('add');
    expect(classifyUpload('a.ts', 40, 60, budget, maxFile)).toBe('add');
  });

  it('skips oversized and non-indexable files without touching the budget', () => {
    expect(classifyUpload('big.ts', 51, 0, budget, maxFile)).toBe('skip');
    expect(classifyUpload('x.d.ts', 1, 0, budget, maxFile)).toBe('skip');
  });

  it('stops once the shared budget would be exceeded', () => {
    expect(classifyUpload('a.ts', 41, 60, budget, maxFile)).toBe('stop');
    expect(classifyUpload('a.ts', 1, 100, budget, maxFile)).toBe('stop');
  });
});
