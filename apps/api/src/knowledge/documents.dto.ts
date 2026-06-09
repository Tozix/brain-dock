import { saveDocumentSchema, updateDocumentSchema } from '@brain-dock/knowledge';
import type { z } from 'zod';

// projectId comes from the route path.
export const createDocumentSchema = saveDocumentSchema.omit({ projectId: true });
export type CreateDocumentDto = z.infer<typeof createDocumentSchema>;

export { updateDocumentSchema };
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>;
