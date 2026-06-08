/**
 * RBAC roles. Ordered by privilege (ascending). SUPER_ADMIN is the only role
 * allowed to issue API keys (see Claude.md "AUTH" / "API KEYS").
 */
export const Role = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

const RANK: Record<Role, number> = {
  [Role.USER]: 0,
  [Role.ADMIN]: 1,
  [Role.SUPER_ADMIN]: 2,
};

/** True when `role` is at least as privileged as `required`. */
export function roleSatisfies(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}
