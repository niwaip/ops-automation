/**
 * organization -> governance/organization
 *
 * This module remains in core/platform physically, but its logical ownership is
 * the future governance plane. New organization and ownership logic should
 * converge here instead of being mixed into release or execution services.
 */

export * from './organization.module';
export * from './organization.service';
