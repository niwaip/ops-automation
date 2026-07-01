// Session-broker owns only session state, worker/resource allocation,
// leases/locks, freeze control, and runtime-session lifecycle. Execution state
// progression and approval/takeover remain in control-plane.
export * from './main';
export * from './app.module';
export * from './interfaces/session.interface';
export * from './dto/session.dto';

// Resource coordination and lease boundaries.
export * from './modules/lock/redis.service';
export * from './modules/lock/lock.service';
export * from './modules/lock/lock.module';
export * from './modules/allocation/allocation.service';
export * from './modules/allocation/allocation.controller';
export * from './modules/allocation/allocation.module';
export * from './modules/freeze/freeze.service';
export * from './modules/freeze/freeze.module';

// Session and runtime-session lifecycle boundaries.
export * from './modules/session/session.service';
export * from './modules/session/session.controller';
export * from './modules/session/session.module';
export * from './modules/runtime-session/runtime-session.dto';
export * from './modules/runtime-session/runtime-session.service';
export * from './modules/runtime-session/runtime-session.controller';
export * from './modules/runtime-session/runtime-session.module';

// Runtime worker routing stays inside session-broker as an adapter boundary.
export { ExecutionModule as WorkerRoutingModule } from './modules/execution/execution.module';
export {
  CdpExecutor,
  type ExecuteStepsOptions,
  type ExecutionResult,
  type TemplateLoopDraft,
  type TemplateStep,
} from './modules/execution/cdp.executor';
