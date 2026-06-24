/**
 * decorators -> governance/identity-access
 *
 * Permission and role decorators belong to governance concerns and should stay
 * aligned with guards and auth strategies rather than release modules.
 */

export { Public, SkipRbac, RequirePermissions, RequireAdmin, Roles, ROLES_KEY } from '@ops/identity-access';
