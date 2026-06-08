import { type Role, roleSatisfies } from '@brain-dock/shared';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../common/auth-user';
import { ROLES_KEY } from '../common/decorators';

/** Enforces @Roles(...) using the role hierarchy from @brain-dock/shared. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    if (!required.some((role) => roleSatisfies(user.role, role))) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
