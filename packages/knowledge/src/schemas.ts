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

export const rememberSchema = z.object({
  projectId: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(MEMORY_TYPES).optional(),
  tags: z.array(z.string()).optional(),
});
export type RememberInput = z.infer<typeof rememberSchema>;

export const saveKnowledgeSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  tags: z.array(z.string()).optional(),
});
export type SaveKnowledgeInput = z.infer<typeof saveKnowledgeSchema>;

// Ingestable document formats. PDF/DOCX content must be base64-encoded.
export const DOC_FORMATS = ['MD', 'TXT', 'MDX', 'JSON', 'YAML', 'PDF', 'DOCX'] as const;

export const saveDocumentSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  format: z.enum(DOC_FORMATS).default('MD'),
  content: z.string().min(1),
  source: z.string().max(500).optional(),
});
export type SaveDocumentInput = z.infer<typeof saveDocumentSchema>;

export const updateMemorySchema = z.object({
  content: z.string().min(1).optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  tags: z.array(z.string()).optional(),
});
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;

export const updateKnowledgeSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  type: z.enum(KNOWLEDGE_TYPES).optional(),
  tags: z.array(z.string()).optional(),
});
export type UpdateKnowledgeInput = z.infer<typeof updateKnowledgeSchema>;
