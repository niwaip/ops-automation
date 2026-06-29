import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TemporalWorkflowArtifactService } from '../../workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '../../workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '../../workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '../../workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '../../workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '../../workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '../../workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowBrowserDraftService } from './browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowController } from './temporal-workflow.controller';
import { TemporalWorkflowService } from './temporal-workflow.service';
import { TemporalWorkflowCodegenService } from './temporal-workflow-codegen.service';
import { TemporalWorkflowCodegenOrchestrationService } from '../../workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import { TemporalWorkflowSessionService } from './temporal-workflow-session.service';
import { TemporalWorkflowValidationHttpService } from './temporal-workflow-validation-http.service';
import { TemporalWorkflowValidationService } from './temporal-workflow-validation.service';
import { TemporalWorkflowValidationFacadeService } from './temporal-workflow-validation-facade.service';
import { TemporalWorkflowArtifactValidationService } from '../../workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowDslValidationService } from '../../workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowActivityResolutionService } from './temporal-workflow-activity-resolution.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import { TemporalWorkflowSupportService } from './temporal-workflow-support.service';
import { TemporalWorkflowTemplateService } from '../../workflow-registry/workflow-template/temporal-workflow-template.service';
import { TemporalWorkflowAiDraftService } from './temporal-workflow-draft.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './temporal-activity.service';
import { ActivityCrudService } from './temporal-activity-crud.service';
import { TemporalActivityValidationHttpService } from './temporal-activity-validation-http.service';
import { ActivityValidationService } from './temporal-activity-validation.service';
import { TemporalActivityValidationFacadeService } from './temporal-activity-validation-facade.service';
import { ActivityCodegenService } from './temporal-activity-codegen.service';
import { ActivityExecutionService } from './runtime-bridge/temporal-activity-execution.service';
import { ActivityRuntimeController } from './runtime-bridge/activity-runtime.controller';
import { BuiltinActivityRegistry } from './builtin-activity.registry';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [TemporalWorkflowController, ActivityController, ActivityRuntimeController],
  providers: [
    TemporalWorkflowService,
    TemporalWorkflowArtifactService,
    TemporalWorkflowDraftOrchestrationService,
    TemporalWorkflowManagementService,
    TemporalWorkflowBrowserDraftService,
    TemporalWorkflowCodegenService,
    TemporalWorkflowCodegenOrchestrationService,
    TemporalWorkflowSessionService,
    TemporalWorkflowSessionOrchestrationService,
    TemporalWorkflowSessionSupportFactoryService,
    TemporalWorkflowConfigOrchestrationService,
    TemporalWorkflowValidationHttpService,
    TemporalWorkflowValidationService,
    TemporalWorkflowValidationFacadeService,
    TemporalWorkflowArtifactValidationService,
    TemporalWorkflowDslValidationService,
    TemporalWorkflowActivityResolutionService,
    TemporalWorkflowConfigService,
    TemporalWorkflowNormalizationService,
    TemporalWorkflowSupportService,
    TemporalWorkflowTemplateService,
    TemporalWorkflowAiDraftService,
    ActivityCrudService,
    TemporalActivityValidationHttpService,
    ActivityValidationService,
    TemporalActivityValidationFacadeService,
    ActivityCodegenService,
    ActivityExecutionService,
    ActivityService,
    BuiltinActivityRegistry,
  ],
  exports: [
    TemporalWorkflowService,
    TemporalWorkflowArtifactService,
    TemporalWorkflowDraftOrchestrationService,
    TemporalWorkflowManagementService,
    TemporalWorkflowBrowserDraftService,
    TemporalWorkflowCodegenService,
    TemporalWorkflowCodegenOrchestrationService,
    TemporalWorkflowSessionService,
    TemporalWorkflowSessionOrchestrationService,
    TemporalWorkflowSessionSupportFactoryService,
    TemporalWorkflowConfigOrchestrationService,
    TemporalWorkflowValidationHttpService,
    TemporalWorkflowValidationService,
    TemporalWorkflowValidationFacadeService,
    TemporalWorkflowArtifactValidationService,
    TemporalWorkflowDslValidationService,
    TemporalWorkflowActivityResolutionService,
    TemporalWorkflowConfigService,
    TemporalWorkflowNormalizationService,
    TemporalWorkflowSupportService,
    TemporalWorkflowTemplateService,
    TemporalWorkflowAiDraftService,
    ActivityCrudService,
    TemporalActivityValidationHttpService,
    ActivityValidationService,
    TemporalActivityValidationFacadeService,
    ActivityCodegenService,
    ActivityExecutionService,
    ActivityService,
    BuiltinActivityRegistry,
  ],
})
export class TemporalWorkflowModule {}
