import { z } from 'zod';

/** Optional list pagination — defaults keep existing clients working (arrays stay arrays). */
export const paginationSchema = z.object({
  take: z.coerce.number().int().min(1).max(200).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});
export type PaginationDto = z.infer<typeof paginationSchema>;
