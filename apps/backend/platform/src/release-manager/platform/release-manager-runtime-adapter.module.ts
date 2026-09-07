import { Global, Module } from '@nestjs/common';
import {
  RELEASE_MANAGER_ACTIVITY_EXECUTION,
  RELEASE_MANAGER_EXECUTION_FLOW_VALIDATION_FACADE,
  RELEASE_MANAGER_PRISMA,
  RELEASE_MANAGER_SKILL_SERVICE,
  RELEASE_MANAGER_TEMPORAL_WORKFLOW,
  RELEASE_MANAGER_TOOL_CATALOG,
} from '@ops/release-manager/release';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SkillModule, SkillService, ToolCatalogService } from '@ops/skill-registry/registry';
import { ExecutionFlowModule, ExecutionFlowValidationFacadeService } from '@ops/workflow-registry/flow-template';
import {
  TemporalWorkflowModule,
  TemporalWorkflowService,
  ActivityExecutionService,
} from '@ops/workflow-registry/temporal';

@Global()
@Module({
  imports: [PrismaModule, SkillModule, ExecutionFlowModule, TemporalWorkflowModule],
  providers: [
    {
      provide: RELEASE_MANAGER_PRISMA,
      useExisting: PrismaService,
    },
    {
      provide: RELEASE_MANAGER_SKILL_SERVICE,
      useExisting: SkillService,
    },
    {
      provide: RELEASE_MANAGER_TOOL_CATALOG,
      useExisting: ToolCatalogService,
    },
    {
      provide: RELEASE_MANAGER_TEMPORAL_WORKFLOW,
      useExisting: TemporalWorkflowService,
    },
    {
      provide: RELEASE_MANAGER_EXECUTION_FLOW_VALIDATION_FACADE,
      useExisting: ExecutionFlowValidationFacadeService,
    },
    {
      provide: RELEASE_MANAGER_ACTIVITY_EXECUTION,
      useExisting: ActivityExecutionService,
    },
  ],
  exports: [
    RELEASE_MANAGER_PRISMA,
    RELEASE_MANAGER_SKILL_SERVICE,
    RELEASE_MANAGER_TOOL_CATALOG,
    RELEASE_MANAGER_TEMPORAL_WORKFLOW,
    RELEASE_MANAGER_EXECUTION_FLOW_VALIDATION_FACADE,
    RELEASE_MANAGER_ACTIVITY_EXECUTION,
  ],
})
export class ReleaseManagerRuntimeAdapterModule {}
