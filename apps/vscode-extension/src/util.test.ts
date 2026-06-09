import { describe, expect, it } from 'bun:test';
import { normalizeBase, parseJsonRpc, parseSummary, toolText } from './util';

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
    expect(parseSummary('')).toEqual({ files: 0, symbols: 0, repos: [], roles: {} });
  });
});
