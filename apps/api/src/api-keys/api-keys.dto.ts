import { z } from 'zod';

export const issueApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  /** Target user; defaults to the issuing Super Admin when omitted. */
  userId: z.uuid().optional(),
  rateLimit: z.number().int().positive().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type IssueApiKeyDto = z.infer<typeof issueApiKeySchema>;
