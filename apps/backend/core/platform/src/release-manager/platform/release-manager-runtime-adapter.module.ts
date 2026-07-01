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
import { SkillModule } from '../../modules/skill/skill.module';
import { SkillService } from '../../modules/skill/skill.service';
import { ToolCatalogService } from '../../modules/skill/tool-catalog.service';
import { ExecutionFlowModule } from '../../modules/execution-flow/execution-flow.module';
import { ExecutionFlowValidationFacadeService } from '../../modules/execution-flow/execution-flow-validation-facade.service';
import { TemporalWorkflowModule } from '../../modules/temporal-workflow/temporal-workflow.module';
import { TemporalWorkflowService } from '../../modules/temporal-workflow/temporal-workflow.service';
import { ActivityExecutionService } from '../../modules/temporal-workflow/runtime-bridge/temporal-activity-execution.service';

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
