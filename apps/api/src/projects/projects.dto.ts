import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  description: z.string().max(1000).optional(),
});
export type CreateProjectDto = z.infer<typeof createProjectSchema>;
