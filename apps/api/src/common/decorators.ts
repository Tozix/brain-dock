import type { Role } from '@brain-dock/shared';
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'brain-dock:isPublic';
/** Marks a route as accessible without authentication (skips JwtAccessGuard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'brain-dock:roles';
/** Restricts a route to principals whose role satisfies at least one of `roles`. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
