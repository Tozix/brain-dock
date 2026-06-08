import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});
export type CredentialsDto = z.infer<typeof credentialsSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshDto = z.infer<typeof refreshSchema>;
