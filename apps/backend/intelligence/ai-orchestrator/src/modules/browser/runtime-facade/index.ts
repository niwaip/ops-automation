/**
 * runtime-facade -> browser-domain/runtime-facade
 *
 * These services bridge recorder planning and browser phase recovery to the
 * execution chain without turning the browser module into the global control
 * plane.
 */
export type * from '../execute/browser-execution-controller.service';
export { BrowserExecutionControllerService } from '../execute/browser-execution-controller.service';
export type * from '../execute/execution-reconcile.service';
export { ExecutionReconcileService } from '../execute/execution-reconcile.service';
export { BrowserPhaseRecoveryModule } from '../recovery/browser-phase-recovery.module';
export { BrowserPhaseRecoveryService } from '../recovery/browser-phase-recovery.service';
