import { afterEach, describe, expect, it } from 'bun:test';
import { ApiError, BrainDockClient } from './client';

const realFetch = globalThis.fetch;

const opts = {
  serverUrl: 'http://server',
  mcpUrl: 'http://server:8080/mcp',
  apiKey: 'bd_key',
  project: 'my-app',
};

describe('BrainDockClient', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('parses a successful REST response', async () => {
    globalThis.fetch = (async (url: string) => {
      expect(String(url)).toBe('http://server/api/v1/projects');
      return new Response(JSON.stringify([{ id: 'p1', name: 'A', slug: 'a' }]), { status: 200 });
    }) as unknown as typeof fetch;

    const projects = await new BrainDockClient(opts).listProjects();
    expect(projects).toEqual([{ id: 'p1', name: 'A', slug: 'a' }]);
  });

  it('throws ApiError with the status and the response body in the message', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'slug already taken' }), {
        status: 409,
        statusText: 'Conflict',
      })) as unknown as typeof fetch;

    const err = await new BrainDockClient(opts).createProject('A', 'a').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(409);
    expect(apiErr.message).toContain('409');
    expect(apiErr.message).toContain('slug already taken');
  });

  it('truncates huge error bodies to ~300 chars', async () => {
    globalThis.fetch = (async () =>
      new Response('x'.repeat(5000), {
        status: 500,
        statusText: 'Boom',
      })) as unknown as typeof fetch;

    const err = (await new BrainDockClient(opts).listProjects().catch((e: unknown) => e)) as Error;
    expect(err.message.length).toBeLessThan(400);
  });

  it('throws ApiError for MCP tool-call HTTP failures too', async () => {
    globalThis.fetch = (async () =>
      new Response('project not found', {
        status: 404,
        statusText: 'Not Found',
      })) as unknown as typeof fetch;

    const err = await new BrainDockClient(opts).indexStatus().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toContain('project not found');
  });

  it('passes an abort signal so requests cannot hang forever', async () => {
    let signal: AbortSignal | undefined;
    globalThis.fetch = (async (_url: string, init: { signal?: AbortSignal }) => {
      signal = init.signal;
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;

    await new BrainDockClient(opts).listProjects();
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
