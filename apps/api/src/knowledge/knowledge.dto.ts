import { rememberSchema, saveKnowledgeSchema } from '@brain-dock/knowledge';
import type { z } from 'zod';

// projectId comes from the route path, not the body.
export const createMemorySchema = rememberSchema.omit({ projectId: true });
export type CreateMemoryDto = z.infer<typeof createMemorySchema>;

export const createKnowledgeSchema = saveKnowledgeSchema.omit({ projectId: true });
export type CreateKnowledgeDto = z.infer<typeof createKnowledgeSchema>;
