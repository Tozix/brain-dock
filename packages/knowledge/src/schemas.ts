import { z } from 'zod';

export const MEMORY_TYPES = ['DECISION', 'FACT', 'NOTE', 'TODO'] as const;
export const KNOWLEDGE_TYPES = [
  'BUSINESS_RULE',
  'ARCHITECTURE',
  'REQUIREMENT',
  'ADR',
  'FAQ',
  'RESEARCH',
  'NOTE',
] as const;

// Upper bounds shared by the create/update schemas — unbounded content would let a single
// request blow up Postgres rows and embedding payloads.
const MAX_CONTENT_LENGTH = 2_000_000;
const MAX_TITLE_LENGTH = 500;

const contentSchema = z.string().min(1).max(MAX_CONTENT_LENGTH);
const tagsSchema = z.array(z.string().min(1).max(100)).max(64);

export const rememberSchema = z.object({
  projectId: z.string().min(1),
  content: contentSchema,
  type: z.enum(MEMORY_TYPES).optional(),
  tags: tagsSchema.optional(),
});
export type RememberInput = z.infer<typeof rememberSchema>;

export const saveKnowledgeSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  content: contentSchema,
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  tags: tagsSchema.optional(),
});
export type SaveKnowledgeInput = z.infer<typeof saveKnowledgeSchema>;

// Ingestable document formats. PDF/DOCX content must be base64-encoded.
export const DOC_FORMATS = ['MD', 'TXT', 'MDX', 'JSON', 'YAML', 'PDF', 'DOCX'] as const;

export const saveDocumentSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  format: z.enum(DOC_FORMATS).default('MD'),
  content: contentSchema,
  source: z.string().max(500).optional(),
});
export type SaveDocumentInput = z.infer<typeof saveDocumentSchema>;

export const updateMemorySchema = z.object({
  content: contentSchema.optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  tags: tagsSchema.optional(),
});
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;

export const updateKnowledgeSchema = z.object({
  title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
  content: contentSchema.optional(),
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  tags: tagsSchema.optional(),
});
export type UpdateKnowledgeInput = z.infer<typeof updateKnowledgeSchema>;

// Re-chunking/re-embedding happens only when `content` is provided (`format` defaults to the
// stored one). Title/source-only updates touch Postgres without re-embedding.
export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  format: z.enum(DOC_FORMATS).optional(),
  content: contentSchema.optional(),
  source: z.string().max(500).optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
