export const BROWSER_EXECUTION_RECONCILER = Symbol('BROWSER_EXECUTION_RECONCILER');
export const BROWSER_PHASE_RECOVERY = Symbol('BROWSER_PHASE_RECOVERY');

export interface BrowserExecutionReconcilerPort {
  reconcile(input: any): Promise<any>;
}

export interface BrowserPhaseRecoveryPort {
  recover(input: any): Promise<any>;
}
