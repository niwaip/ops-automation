import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExecutionFlowModule } from '../execution-flow/execution-flow.module';
import { TemporalWorkflowModule } from '../temporal-workflow/temporal-workflow.module';
import { SkillModule } from '../skill/skill.module';
import { CapabilityReleaseBrowserRecordingService } from './capability-release-browser-recording.service';
import { BrowserRecordingActionPolicyService } from './browser-recording-action-policy.service';
import { BrowserRecordingExecutionPlanValidatorService } from './browser-recording-execution-plan-validator.service';
import { CapabilityReleaseAssistService } from './capability-release-assist.service';
import { CapabilityReleaseBuildValidationService } from './capability-release-build-validation.service';
import { CapabilityReleaseDeploymentSmokeService } from './capability-release-deployment-smoke.service';
import { CapabilityReleaseDeploymentService } from './capability-release-deployment.service';
import { CapabilityReleasePublishService } from './capability-release-publish.service';
import { CapabilityReleaseRuntimeService } from './capability-release-runtime.service';
import { CapabilityReleaseSkillDraftService } from './capability-release-skill-draft.service';
import { CapabilityReleaseTemporalSchemaService } from './capability-release-temporal-schema.service';
import { CapabilityReleaseController } from './capability-release.controller';
import { CapabilityReleaseService } from './capability-release.service';

@Module({
  imports: [
    PrismaModule,
    ExecutionFlowModule,
    TemporalWorkflowModule,
    SkillModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [CapabilityReleaseController],
  providers: [
    CapabilityReleaseService,
    CapabilityReleaseTemporalSchemaService,
    CapabilityReleaseBrowserRecordingService,
    BrowserRecordingActionPolicyService,
    BrowserRecordingExecutionPlanValidatorService,
    CapabilityReleaseAssistService,
    CapabilityReleaseBuildValidationService,
    CapabilityReleaseDeploymentSmokeService,
    CapabilityReleaseDeploymentService,
    CapabilityReleasePublishService,
    CapabilityReleaseRuntimeService,
    CapabilityReleaseSkillDraftService,
  ],
  exports: [CapabilityReleaseService],
})
export class CapabilityReleaseModule {}
