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

/** Pinned project profile ("core memory") — full replacement; empty string clears it. */
export const updateProjectProfileSchema = z.object({
  profile: z.string().max(4096, 'profile must be at most 4096 characters'),
});
export type UpdateProjectProfileDto = z.infer<typeof updateProjectProfileSchema>;
