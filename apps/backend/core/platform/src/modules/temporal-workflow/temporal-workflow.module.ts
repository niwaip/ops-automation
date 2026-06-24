import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TemporalWorkflowController } from './temporal-workflow.controller';
import { TemporalWorkflowService } from './temporal-workflow.service';
import { TemporalWorkflowBrowserDraftService } from './temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from './temporal-workflow-codegen.service';
import { TemporalWorkflowSessionService } from './temporal-workflow-session.service';
import { TemporalWorkflowValidationHttpService } from './temporal-workflow-validation-http.service';
import { TemporalWorkflowValidationService } from './temporal-workflow-validation.service';
import { TemporalWorkflowValidationFacadeService } from './temporal-workflow-validation-facade.service';
import { TemporalWorkflowActivityResolutionService } from './temporal-workflow-activity-resolution.service';
import { TemporalWorkflowConfigService } from './temporal-workflow-config.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import { TemporalWorkflowSupportService } from './temporal-workflow-support.service';
import { TemporalWorkflowTemplateService } from './temporal-workflow-template.service';
import { TemporalWorkflowAiDraftService } from './temporal-workflow-draft.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './temporal-activity.service';
import { ActivityCrudService } from './temporal-activity-crud.service';
import { TemporalActivityValidationHttpService } from './temporal-activity-validation-http.service';
import { ActivityValidationService } from './temporal-activity-validation.service';
import { TemporalActivityValidationFacadeService } from './temporal-activity-validation-facade.service';
import { ActivityCodegenService } from './temporal-activity-codegen.service';
import { ActivityExecutionService } from './temporal-activity-execution.service';
import { BuiltinActivityRegistry } from './builtin-activity.registry';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [TemporalWorkflowController, ActivityController],
  providers: [
    TemporalWorkflowService,
    TemporalWorkflowBrowserDraftService,
    TemporalWorkflowCodegenService,
    TemporalWorkflowSessionService,
    TemporalWorkflowValidationHttpService,
    TemporalWorkflowValidationService,
    TemporalWorkflowValidationFacadeService,
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
    TemporalWorkflowBrowserDraftService,
    TemporalWorkflowCodegenService,
    TemporalWorkflowSessionService,
    TemporalWorkflowValidationHttpService,
    TemporalWorkflowValidationService,
    TemporalWorkflowValidationFacadeService,
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
