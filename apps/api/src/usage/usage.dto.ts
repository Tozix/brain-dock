import { z } from 'zod';
import { paginationSchema } from '../common/pagination';

/** Query for the admin usage rollup: lookback window in days + pagination. */
export const adminUsageQuerySchema = paginationSchema.extend({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type AdminUsageQueryDto = z.infer<typeof adminUsageQuerySchema>;
