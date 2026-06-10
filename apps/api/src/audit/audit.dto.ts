import { z } from 'zod';
import { paginationSchema } from '../common/pagination';

/** Query filters for the audit log listing (ADMIN+). */
export const auditQuerySchema = paginationSchema.extend({
  actor: z.uuid().optional(),
  action: z.string().min(1).max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type AuditQueryDto = z.infer<typeof auditQuerySchema>;
