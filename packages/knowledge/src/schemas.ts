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
