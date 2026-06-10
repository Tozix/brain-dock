import {
  updateDocumentSchema,
  updateKnowledgeSchema,
  updateMemorySchema,
} from '@brain-dock/knowledge';
import { z } from 'zod';
import { issueApiKeySchema } from '../api-keys/api-keys.dto';
import { credentialsSchema, refreshSchema } from '../auth/auth.dto';
import { createDocumentSchema } from '../knowledge/documents.dto';
import { createKnowledgeSchema, createMemorySchema } from '../knowledge/knowledge.dto';
import { createProjectSchema, updateProjectProfileSchema } from '../projects/projects.dto';
import { createRepositorySchema, updateRepositorySchema } from '../repositories/repositories.dto';
import { updateUserSchema } from '../users/users.dto';

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

// Optional list pagination, shared by every collection GET.
const PAGE_PARAMS = [
  {
    name: 'take',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
  },
  {
    name: 'skip',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 0, default: 0 },
  },
];

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
        UpdateProjectProfile: js(updateProjectProfileSchema),
        CreateMemory: js(createMemorySchema),
        CreateKnowledge: js(createKnowledgeSchema),
        CreateDocument: js(createDocumentSchema),
        CreateRepository: js(createRepositorySchema),
        UpdateRepository: js(updateRepositorySchema),
        UpdateMemory: js(updateMemorySchema),
        UpdateKnowledge: js(updateKnowledgeSchema),
        UpdateDocument: js(updateDocumentSchema),
        UpdateUser: js(updateUserSchema),
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
          summary: 'Issue API key for yourself (userId/rateLimit are ADMIN-only)',
          requestBody: body('IssueApiKey'),
          responses: {
            '201': { description: 'Key (secret shown once)' },
            '403': { description: 'userId/rateLimit used without ADMIN role' },
          },
        },
        get: {
          tags: ['api-keys'],
          summary: 'List own keys (all=true: every key with owner email, ADMIN+)',
          parameters: [
            ...PAGE_PARAMS,
            {
              name: 'all',
              in: 'query',
              required: false,
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            '200': { description: 'Keys' },
            '403': { description: 'all=true without ADMIN role' },
          },
        },
      },
      '/api/v1/api-keys/{id}': {
        delete: {
          tags: ['api-keys'],
          summary: 'Revoke own key (ADMIN+ may revoke anyone’s)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Revoked' },
            '404': { description: 'Not found (incl. foreign keys for non-admins)' },
          },
        },
      },
      '/api/v1/users': {
        get: {
          tags: ['users'],
          summary: 'List users with project/key counters (ADMIN/SUPER_ADMIN)',
          parameters: [
            ...PAGE_PARAMS,
            {
              name: 'q',
              in: 'query',
              required: false,
              description: 'Case-insensitive email substring filter',
              schema: { type: 'string' },
            },
          ],
          responses: { '200': { description: 'Users' }, '403': { description: 'Forbidden' } },
        },
      },
      '/api/v1/users/{id}': {
        get: {
          tags: ['users'],
          summary: 'Get user (ADMIN/SUPER_ADMIN)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'User' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Not found' },
          },
        },
        patch: {
          tags: ['users'],
          summary: 'Update user: isActive (ADMIN+, not self), role (SUPER_ADMIN, not self)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: body('UpdateUser'),
          responses: {
            '200': { description: 'Updated user' },
            '400': { description: 'Self-deactivation / self role change' },
            '403': { description: 'Role change without SUPER_ADMIN' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/api/v1/usage': {
        get: {
          tags: ['usage'],
          summary: 'Own MCP usage rollup (calls + tokens served)',
          parameters: [
            {
              name: 'days',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
            },
          ],
          responses: { '200': { description: 'Usage summary' } },
        },
      },
      '/api/v1/usage/admin': {
        get: {
          tags: ['usage'],
          summary: 'Per-user usage rollup + summary, calls desc (ADMIN/SUPER_ADMIN)',
          parameters: [
            ...PAGE_PARAMS,
            {
              name: 'days',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
            },
          ],
          responses: {
            '200': { description: 'Per-user rows + {totalCalls, totalTokens, activeUsers}' },
            '403': { description: 'Forbidden' },
          },
        },
      },
      '/api/v1/audit': {
        get: {
          tags: ['audit'],
          summary: 'List audit log (ADMIN/SUPER_ADMIN)',
          parameters: [
            ...PAGE_PARAMS,
            {
              name: 'actor',
              in: 'query',
              required: false,
              schema: { type: 'string', format: 'uuid' },
            },
            { name: 'action', in: 'query', required: false, schema: { type: 'string' } },
            {
              name: 'from',
              in: 'query',
              required: false,
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'to',
              in: 'query',
              required: false,
              schema: { type: 'string', format: 'date-time' },
            },
          ],
          responses: {
            '200': { description: 'Audit entries (newest first)' },
            '403': { description: 'Forbidden' },
          },
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
          parameters: [...PAGE_PARAMS],
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
      '/api/v1/projects/{id}/profile': {
        get: {
          tags: ['projects'],
          summary: 'Get the pinned project profile (core memory block)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Profile (null when unset)' },
            '403': { description: 'Not owner' },
            '404': { description: 'Not found' },
          },
        },
        put: {
          tags: ['projects'],
          summary: 'Replace the project profile (≤4096 chars; empty string clears it)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: body('UpdateProjectProfile'),
          responses: {
            '200': { description: 'Updated profile' },
            '400': { description: 'Profile too long' },
            '403': { description: 'Not owner' },
            '404': { description: 'Not found' },
          },
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
            ...PAGE_PARAMS,
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
      '/api/v1/projects/{projectId}/repositories/{id}/status': {
        get: {
          tags: ['repositories'],
          summary: 'Indexing status (QUEUED/INDEXING/READY/FAILED, error, counters)',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Indexing lifecycle of the repository' },
            '404': { description: 'Not found' },
          },
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
            ...PAGE_PARAMS,
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
      '/api/v1/projects/{projectId}/memory/{id}': {
        patch: {
          tags: ['memory'],
          summary: 'Update memory',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('UpdateMemory'),
          responses: { '200': { description: 'Memory item' }, '404': { description: 'Not found' } },
        },
        delete: {
          tags: ['memory'],
          summary: 'Delete memory',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Deleted' }, '404': { description: 'Not found' } },
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
            ...PAGE_PARAMS,
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
      '/api/v1/projects/{projectId}/knowledge/{id}': {
        patch: {
          tags: ['knowledge'],
          summary: 'Update knowledge',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('UpdateKnowledge'),
          responses: {
            '200': { description: 'Knowledge item' },
            '404': { description: 'Not found' },
          },
        },
        delete: {
          tags: ['knowledge'],
          summary: 'Delete knowledge',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Deleted' }, '404': { description: 'Not found' } },
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
            ...PAGE_PARAMS,
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
      '/api/v1/projects/{projectId}/documents/{id}': {
        patch: {
          tags: ['documents'],
          summary: 'Update document (content change re-embeds)',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: body('UpdateDocument'),
          responses: {
            '200': { description: 'Document + chunk count' },
            '404': { description: 'Not found' },
          },
        },
        delete: {
          tags: ['documents'],
          summary: 'Delete document',
          parameters: [
            { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Deleted' }, '404': { description: 'Not found' } },
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
