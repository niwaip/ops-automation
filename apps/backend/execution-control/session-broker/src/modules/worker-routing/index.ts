// Worker routing stays inside session-broker only as a runtime adapter for
// browser/session handoff. It must not grow into a second control-plane.
export { ExecutionModule as WorkerRoutingModule } from '../execution/execution.module';
export {
  CdpExecutor,
  type ExecuteStepsOptions,
  type ExecutionResult,
  type TemplateLoopDraft,
  type TemplateStep,
} from '../execution/cdp.executor';
