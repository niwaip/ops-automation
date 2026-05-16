import { Module } from '@nestjs/common';
import { BrowserPhaseRecoveryPlanner } from './browser-phase-recovery.planner';
import { BrowserPhaseExecutor } from './browser-phase.executor';
import { BrowserRuntimeAdapter } from './browser-runtime.adapter';
import { CapabilityRuntimeAdapter } from './capability-runtime.adapter';
import { DocumentRuntimeAdapter } from './document-runtime.adapter';
import { ExecutionController } from './execution.controller';
import { ExecutionEventService } from './execution-event.service';
import { ExecutionPhaseService } from './execution-phase.service';
import { ExecutionStateService } from './execution-state.service';
import { ExecutionStepService } from './execution-step.service';
import { ExecutionService } from './execution.service';
import { RuntimeAdapterRegistry } from './runtime-adapter.registry';
import { RuntimeExecutionOrchestrator } from './runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './runtime-step-request.factory';
import { WorkflowRuntimeAdapter } from './workflow-runtime.adapter';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ExecutionController],
  providers: [
    BrowserPhaseRecoveryPlanner,
    BrowserRuntimeAdapter,
    BrowserPhaseExecutor,
    CapabilityRuntimeAdapter,
    DocumentRuntimeAdapter,
    WorkflowRuntimeAdapter,
    ExecutionService,
    ExecutionEventService,
    ExecutionPhaseService,
    ExecutionStateService,
    ExecutionStepService,
    RuntimeAdapterRegistry,
    RuntimeExecutionOrchestrator,
    RuntimeResultInterpreter,
    RuntimeStepRequestFactory,
  ],
  exports: [
    BrowserPhaseRecoveryPlanner,
    BrowserRuntimeAdapter,
    BrowserPhaseExecutor,
    CapabilityRuntimeAdapter,
    DocumentRuntimeAdapter,
    WorkflowRuntimeAdapter,
    ExecutionService,
    ExecutionEventService,
    ExecutionPhaseService,
    ExecutionStateService,
    ExecutionStepService,
    RuntimeAdapterRegistry,
    RuntimeExecutionOrchestrator,
    RuntimeResultInterpreter,
    RuntimeStepRequestFactory,
  ],
})
export class ExecutionModule {}
