import { describe, expect, it } from 'bun:test';
import { Role, roleSatisfies } from './roles';

describe('roleSatisfies', () => {
  it('grants access when the role outranks or equals the requirement', () => {
    expect(roleSatisfies(Role.SUPER_ADMIN, Role.USER)).toBe(true);
    expect(roleSatisfies(Role.ADMIN, Role.ADMIN)).toBe(true);
    expect(roleSatisfies(Role.SUPER_ADMIN, Role.ADMIN)).toBe(true);
  });

  it('denies access when the role is below the requirement', () => {
    expect(roleSatisfies(Role.USER, Role.ADMIN)).toBe(false);
    expect(roleSatisfies(Role.ADMIN, Role.SUPER_ADMIN)).toBe(false);
  });
});
