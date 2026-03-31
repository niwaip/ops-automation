/**
 * Portal Service - Placeholder
 *
 * This service provides the main web portal interface for the Browser Control Plane.
 */

export const SERVICE_NAME = 'portal';

export function init(): void {
  console.info(`[${SERVICE_NAME}] Service initialized`);
}

export default { SERVICE_NAME, init };