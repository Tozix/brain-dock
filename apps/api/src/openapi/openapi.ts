import { z } from 'zod';
import { issueApiKeySchema } from '../api-keys/api-keys.dto';
import { credentialsSchema, refreshSchema } from '../auth/auth.dto';
import { createDocumentSchema } from '../knowledge/documents.dto';
import { createKnowledgeSchema, createMemorySchema } from '../knowledge/knowledge.dto';
import { createProjectSchema } from '../projects/projects.dto';
import { createRepositorySchema, updateRepositorySchema } from '../repositories/repositories.dto';

/** Convert a Zod schema to JSON Schema (OpenAPI 3.1 = JSON Schema 2020-12); drop `$schema`. */
function js(schema: z.ZodType): Record<string, unknown> {
  // `unrepresentable: 'any'` keeps non-JSON types (e.g. coerced dates) as open schemas
  // instead of throwing.
  const out = z.toJSONSchema(schema, { unrepresentable: 'any' }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const body = (name: string) => ({
  required: true,
  content: { 'application/json': { schema: ref(name) } },
});
const PUBLIC: { security: [] } = { security: [] };

/** Build the brain-dock OpenAPI 3.1 document from the live Zod schemas. */
export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'brain-dock API',
      version: '0.1.0',
      description:
        'AI Knowledge Platform — auth, API keys, projects, project memory & knowledge base.',
    },
    servers: [{ url: '/' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Credentials: js(credentialsSchema),
        Refresh: js(refreshSchema),
        IssueApiKey: js(issueApiKeySchema),
        CreateProject: js(createProjectSchema),
        CreateMemory: js(createMemorySchema),
        CreateKnowledge: js(createKnowledgeSchema),
        CreateDocument: js(createDocumentSchema),
        CreateRepository: js(createRepositorySchema),
        UpdateRepository: js(updateRepositorySchema),
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['health'],
          summary: 'Liveness',
          ...PUBLIC,
          responses: { '200': { description: 'OK' } },
        },
      },
      '/health/ready': {
        get: {
          tags: ['health'],
          summary: 'Readiness',
          ...PUBLIC,
          responses: { '200': { description: 'OK' }, '503': { description: 'Degraded' } },
        },
      },
      '/metrics': {
        get: {
          tags: ['health'],
          summary: 'Prometheus metrics',
          ...PUBLIC,
          responses: { '200': { description: 'Prometheus text exposition' } },
        },
      },
      '/api/v1/auth/register': {
        post: {
          tags: ['auth'],
          summary: 'Register (first user becomes SUPER_ADMIN)',
          ...PUBLIC,
          requestBody: body('Credentials'),
          responses: {
            '201': { description: 'Tokens + user' },
            '409': { description: 'Email exists' },
          },
        },
      },
      '/api/v1/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Login',
          ...PUBLIC,
          requestBody: body('Credentials'),
          responses: {
            '200': { description: 'Tokens + user' },
            '401': { description: 'Invalid credentials' },
          },
        },
      },
      '/api/v1/auth/refresh': {
        post: {
          tags: ['auth'],
          summary: 'Refresh tokens',
          ...PUBLIC,
          requestBody: body('Refresh'),
          responses: {
            '200': { description: 'Tokens + user' },
            '401': { description: 'Invalid token' },
          },
        },
      },
      '/api/v1/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'Current principal',
          responses: { '200': { description: 'User' } },
        },
      },
      '/api/v1/api-keys': {
        post: {
          tags: ['api-keys'],
          summary: 'Issue API key (SUPER_ADMIN)',
          requestBody: body('IssueApiKey'),
          responses: {
            '201': { description: 'Key (secret shown once)' },
            '403': { description: 'Forbidden' },
          },
        },
        get: {
          tags: ['api-keys'],
          summary: 'List own keys',
          responses: { '200': { description: 'Keys' } },
        },
      },
      '/api/v1/projects': {
        post: {
          tags: ['projects'],
          summary: 'Create project',
          requestBody: body('CreateProject'),
          responses: { '201': { description: 'Project' }, '409': { description: 'Slug exists' } },
        },
        get: {
          tags: ['projects'],
          summary: 'List own projects',
          responses: { '200': { description: 'Projects' } },
        },
      },
      '/api/v1/projects/{id}': {
        get: {
          tags: ['projects'],
          summary: 'Get project',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Project' },
            '403': { description: 'Not owner' },
            '404': { description: 'Not found' },
          },
        },
        delete: {
          tags: ['projects'],
          summary: 'Delete project',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Deleted' } },
        },
      },
      '/api/v1/projects/{projectId}/repositories': {
        post: {
          tags: ['repositories'],
          summary: 'Create repository',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('CreateRepository'),
          responses: {
            '201': { description: 'Repository' },
            '409': { description: 'Alias exists in project' },
          },
        },
        get: {
          tags: ['repositories'],
          summary: 'List repositories',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Repositories' } },
        },
      },
      '/api/v1/projects/{projectId}/repositories/{id}': {
        get: {
          tags: ['repositories'],
          summary: 'Get repository',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Repository' }, '404': { description: 'Not found' } },
        },
        patch: {
          tags: ['repositories'],
          summary: 'Update repository (alias is immutable)',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('UpdateRepository'),
          responses: { '200': { description: 'Repository' }, '404': { description: 'Not found' } },
        },
        delete: {
          tags: ['repositories'],
          summary: 'Delete repository',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Deleted' }, '404': { description: 'Not found' } },
        },
      },
      '/api/v1/projects/{projectId}/repositories/{id}/reindex': {
        post: {
          tags: ['repositories'],
          summary: 'Enqueue an indexing job for the repository',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '201': { description: 'Job queued' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/api/v1/projects/{projectId}/memory': {
        post: {
          tags: ['memory'],
          summary: 'Remember',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('CreateMemory'),
          responses: { '201': { description: 'Memory item' } },
        },
        get: {
          tags: ['memory'],
          summary: 'List memory',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Memory items' } },
        },
      },
      '/api/v1/projects/{projectId}/memory/search': {
        get: {
          tags: ['memory'],
          summary: 'Search memory',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Scored memory hits' } },
        },
      },
      '/api/v1/projects/{projectId}/knowledge': {
        post: {
          tags: ['knowledge'],
          summary: 'Save knowledge',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('CreateKnowledge'),
          responses: { '201': { description: 'Knowledge item' } },
        },
        get: {
          tags: ['knowledge'],
          summary: 'List knowledge',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Knowledge items' } },
        },
      },
      '/api/v1/projects/{projectId}/knowledge/search': {
        get: {
          tags: ['knowledge'],
          summary: 'Search knowledge',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Scored knowledge hits' } },
        },
      },
      '/api/v1/projects/{projectId}/documents': {
        post: {
          tags: ['documents'],
          summary: 'Ingest a text document (md/txt/mdx/json/yaml)',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('CreateDocument'),
          responses: { '201': { description: 'Document + chunk count' } },
        },
        get: {
          tags: ['documents'],
          summary: 'List documents',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Documents' } },
        },
      },
      '/api/v1/projects/{projectId}/documents/search': {
        get: {
          tags: ['documents'],
          summary: 'Search documents',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Scored document hits' } },
        },
      },
      '/api/v1/projects/{projectId}/search': {
        get: {
          tags: ['search'],
          summary: 'Unified search (code + memory + knowledge + documents)',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Ranked unified results with a source tag' } },
        },
      },
    },
  };
}
