/**
 * auth -> governance/identity-access
 *
 * This module remains in core/platform physically, but its logical ownership is
 * the future governance plane. New authentication and access-control logic
 * should be designed against identity-access rather than a generic platform bag.
 */

export * from './auth.module';
export * from './auth.service';
export * from './auth.controller';
