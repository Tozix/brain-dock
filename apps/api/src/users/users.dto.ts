import { Role } from '@brain-dock/shared';
import { z } from 'zod';
import { paginationSchema } from '../common/pagination';

/** Query filters for the admin user listing. */
export const listUsersQuerySchema = paginationSchema.extend({
  /** Case-insensitive substring filter on email. */
  q: z.string().min(1).max(200).optional(),
});
export type ListUsersQueryDto = z.infer<typeof listUsersQuerySchema>;

/** Admin patch of a user. Role changes are SUPER_ADMIN-only (enforced in the service). */
export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: z.enum(Role).optional(),
  })
  .refine((dto) => dto.isActive !== undefined || dto.role !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
