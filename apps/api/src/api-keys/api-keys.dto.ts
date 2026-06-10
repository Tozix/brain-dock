import { z } from 'zod';
import { paginationSchema } from '../common/pagination';

export const issueApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  /** Target user — ADMIN+ only; everyone else may issue keys only for themselves. */
  userId: z.uuid().optional(),
  /** Per-key rate limit override — ADMIN+ only. */
  rateLimit: z.number().int().positive().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type IssueApiKeyDto = z.infer<typeof issueApiKeySchema>;

export const listApiKeysQuerySchema = paginationSchema.extend({
  /** `all=true` (ADMIN+) lists every key on the platform with its owner's email. */
  all: z.stringbool().default(false),
});
export type ListApiKeysQueryDto = z.infer<typeof listApiKeysQuerySchema>;
