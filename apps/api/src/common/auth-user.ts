import type { Role } from '@brain-dock/shared';

/** The authenticated principal attached to the request by JwtAccessGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

/** Shape of the signed JWT access-token payload. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}
