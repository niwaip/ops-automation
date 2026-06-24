/**
 * strategies -> governance/identity-access
 *
 * Authentication strategies are governance assets. New identity providers
 * should extend this boundary instead of expanding generic platform code.
 */

export * from './jwt.strategy';
export * from './ldap.strategy';
