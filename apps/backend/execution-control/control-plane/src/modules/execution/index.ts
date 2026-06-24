// Control-plane owns only execution lifecycle orchestration, approval/takeover,
// input submission/resolution, and southbound runtime dispatch. Design-time
// asset definition, template editing, or capability-specific authoring should
// stay out of this module boundary.
export * from './contracts/approval-status';
export * from './contracts/execution-status';
export * from './contracts/execution-step-status';
export * from './contracts/execution-event-type';

// Execution lifecycle creation/query/state transitions.
export * from './creation/execution-create.service';
export * from './query/execution-query.service';
export * from './lifecycle/execution-lifecycle.service';
export * from './lifecycle/execution-stream.service';
export * from './state/execution.dto';
export * from './state/execution-event.service';
export * from './state/execution.mapper';
export * from './state/execution-transition-policy';
export * from './state/execution-state.service';
export * from './state/workflow-activity-progress.service';

// Human-in-the-loop control stays in control-plane.
export * from './human-control/execution-approval.service';
export * from './human-control/execution-human-control.service';
export * from './human-control/execution-submit-input.service';
export * from './human-control/execution-input-resolution.service';

// Shared orchestration hooks and runtime adapter contracts.
export * from './shared/execution-application-hooks.service';
export * from './adapters/runtime-adapter.interface';
export * from './adapters/runtime-adapter.registry';
export * from './adapters/browser-runtime.adapter';
export * from './adapters/capability-runtime.adapter';
export * from './adapters/document-runtime.adapter';
export * from './adapters/workflow-runtime.adapter';

// Step planning and southbound runtime dispatch.
export * from './step-runner/planning/execution-planning.service';
export * from './step-runner/planning/execution-plan-step.builder';
export * from './step-runner/flow/execution-flow-runner.service';
export * from './step-runner/flow/execution-start.service';
export * from './step-runner/browser/execution-browser-orchestration.service';
export * from './step-runner/browser/execution-browser-read.service';
export * from './step-runner/steps/execution-step.service';
export * from './step-runner/runtime/runtime-execution.orchestrator';
export * from './step-runner/runtime/runtime-result.interpreter';
export * from './step-runner/runtime/runtime-step-request.factory';
export * from './step-runner/runtime/execution-runtime-control.service';
export * from './step-runner/runtime/execution-runtime-hooks.service';
export * from './step-runner/runtime/execution-system-skill-result.service';
export * from './adapters/execution-runtime-session.service';

// Recovery remains execution-scoped and should not absorb design-time logic.
export * from './recovery/browser-phase-recovery.planner';
export * from './recovery/execution-failure.service';
export * from './recovery/recovery-constants';

export * from './execution.service';
export * from './execution.controller';
export * from './execution.module';
