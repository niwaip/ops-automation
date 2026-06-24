import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { SkillModule } from '../../skill-registry/registry';
import { ExecutionFlowModule } from '../../workflow-registry/flow-template';
import { TemporalWorkflowModule } from '../../workflow-registry/workflow-template';
import {
  CapabilityReleaseBrowserRecordingService,
  CapabilityReleaseBuildValidationService,
  CapabilityReleaseTemporalSchemaService,
} from './compiler';
import {
  BrowserRecordingActionPolicyService,
  BrowserRecordingExecutionPlanValidatorService,
} from './validator';
import { CapabilityReleaseAssistService } from './capability-release-assist.service';
import {
  CapabilityReleaseDeploymentSmokeService,
  CapabilityReleaseDeploymentService,
  CapabilityReleasePublishService,
  CapabilityReleaseRuntimeService,
} from './publisher';
import { CapabilityReleaseSkillDraftService } from './capability-release-skill-draft.service';
import { CapabilityReleaseController } from './capability-release.controller';
import { CapabilityReleaseManifestService } from './capability-release-manifest.service';
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
    CapabilityReleaseManifestService,
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
  exports: [CapabilityReleaseService, CapabilityReleaseManifestService],
})
export class CapabilityReleaseModule {}
