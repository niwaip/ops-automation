/**
 * user -> governance
 *
 * User identity-management logic now routes to governance/identity-access.
 * The remaining module here is only an HTTP compatibility shell; organization
 * ownership logic has already converged in modules/organization.
 * New user-management logic should still be treated as governance scope.
 */

export * from './user.module';
export * from './user.service';
export * from './user.controller';
