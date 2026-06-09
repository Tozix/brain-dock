import { z } from 'zod';

export const createRepositorySchema = z.object({
  name: z.string().min(1).max(100),
  alias: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'alias must be lowercase alphanumeric with dashes'),
  root: z.string().min(1).max(1000),
  defaultBranch: z.string().max(200).optional(),
});
export type CreateRepositoryDto = z.infer<typeof createRepositorySchema>;

// `alias` is immutable: changing it would orphan vectors already filtered by the old alias.
export const updateRepositorySchema = z
  .object({
    name: z.string().min(1).max(100),
    root: z.string().min(1).max(1000),
    defaultBranch: z.string().max(200).nullable(),
  })
  .partial();
export type UpdateRepositoryDto = z.infer<typeof updateRepositorySchema>;
