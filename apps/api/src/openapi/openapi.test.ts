import { describe, expect, it } from 'bun:test';
import { buildOpenApiDocument } from './openapi';

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument();
  const components = doc.components as {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, { scheme: string }>;
  };
  const paths = doc.paths as Record<string, unknown>;

  it('is an OpenAPI 3.1 document with bearer security', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(components.securitySchemes.bearerAuth?.scheme).toBe('bearer');
  });

  it('derives component schemas from the Zod DTOs', () => {
    expect(Object.keys(components.schemas)).toEqual(
      expect.arrayContaining([
        'Credentials',
        'IssueApiKey',
        'CreateProject',
        'CreateMemory',
        'CreateKnowledge',
        'CreateRepository',
        'UpdateRepository',
        'UpdateMemory',
        'UpdateKnowledge',
        'UpdateDocument',
      ]),
    );
    const credentials = components.schemas.Credentials as { properties?: Record<string, unknown> };
    expect(credentials.properties?.email).toBeDefined();
  });

  it('documents the key REST paths', () => {
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/api/v1/auth/login',
        '/api/v1/projects',
        '/api/v1/projects/{projectId}/memory',
        '/api/v1/projects/{projectId}/knowledge/search',
        '/api/v1/projects/{projectId}/repositories',
        '/api/v1/projects/{projectId}/repositories/{id}/reindex',
        '/api/v1/projects/{projectId}/memory/{id}',
        '/api/v1/projects/{projectId}/documents/{id}',
      ]),
    );
  });

  it('documents PATCH and DELETE on item paths', () => {
    const item = paths['/api/v1/projects/{projectId}/knowledge/{id}'] as Record<string, unknown>;
    expect(item.patch).toBeDefined();
    expect(item.delete).toBeDefined();
  });
});
