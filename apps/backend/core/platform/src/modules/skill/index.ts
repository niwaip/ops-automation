/**
 * skill -> skill-registry
 *
 * This module remains in core/platform physically, but its logical ownership is
 * the future skill-registry under registry-release. New registration logic
 * should enter the grouped boundaries below instead of expanding release or
 * workflow responsibilities here.
 */

export * from './interfaces';
export * from './skill.module';
export * from './registry';
export * from './binding';
export * from './access';
export * from './matching';
export * from './enrichment';
export * from './validation';
