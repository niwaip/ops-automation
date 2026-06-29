import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReleaseAccessorBindingsService } from './release-accessor-bindings.service';
import { ReleaseAccessorDepsService } from './release-accessor-deps.service';
import { ReleaseAccessorFactoryService } from './release-accessor-factory.service';
import { ReleaseAccessorSourceService } from './release-accessor-source.service';
import { ReleaseAuditAccessorDepsService } from './release-audit-accessor-deps.service';
import { ReleaseDraftService } from './release-draft.service';
import { ReleaseDraftQueryBridgeService } from './release-draft-query-bridge.service';
import { ReleaseDraftQuerySourceService } from './release-draft-query-source.service';
import { ReleaseFacadeAccessorsService } from './release-facade-accessors.service';
import { ReleaseFacadeAccessorFactoryService } from './release-facade-accessor-factory.service';
import { ReleaseFacadeAccessorBindingsService } from './release-facade-accessor-bindings.service';
import { ReleaseFacadeContextService } from './release-facade-context.service';
import { ReleaseLifecycleService } from './release-lifecycle.service';
import { ReleaseManagementAccessorSourceService } from './release-management-accessor-source.service';
import { ReleaseManagementFacadeContextService } from './release-management-facade-context.service';
import { ReleaseManagementFacadeAccessorsService } from './release-management-facade-accessors.service';
import { ReleaseQueryService } from './release-query.service';
import { ReleaseRuntimeAccessorFactoryService } from './release-runtime-accessor-factory.service';
import { ReleaseRuntimeAccessorSourceService } from './release-runtime-accessor-source.service';
import { ReleaseRuntimeFacadeContextService } from './release-runtime-facade-context.service';
import { ReleaseRuntimeFacadeAccessorsService } from './release-runtime-facade-accessors.service';
import { ReleaseRuntimeAccessorBindingsService } from './release-runtime-accessor-bindings.service';
import { ReleaseSupportAccessorDepsService } from './release-support-accessor-deps.service';
import { ReleaseSupportService } from './release-support.service';
import { BrowserRecordingFlowNormalizerService } from '../compiler/browser-recording-flow-normalizer.service';
import { BrowserRecordingRuntimeLoopPlannerService } from '../compiler/browser-recording-runtime-loop-planner.service';
import { BrowserRecordingRuntimePlannerService } from '../compiler/browser-recording-runtime-planner.service';
import { BrowserRecordingRuntimeStepBuilderService } from '../compiler/browser-recording-runtime-step-builder.service';
import { CapabilityReleaseBrowserRecordingService } from '../compiler/capability-release-browser-recording.service';
import { CapabilityReleaseBuildValidationService } from '../compiler/capability-release-build-validation.service';
import { CapabilityReleaseRecorderBridgeCompilerService } from '../compiler/capability-release-recorder-bridge-compiler.service';
import { CapabilityReleaseTemporalSchemaService } from '../compiler/capability-release-temporal-schema.service';
import { BrowserRecordingActionPolicyService } from '../validator/browser-recording-action-policy.service';
import { BrowserRecordingExecutionPlanValidatorService } from '../validator/browser-recording-execution-plan-validator.service';
import { CapabilityReleasePublishValidatorService } from '../validator/capability-release-publish-validator.service';
import { CapabilityReleaseAssistService } from '../capability-release-assist.service';
import { CapabilityReleaseAuditService } from '../audit/capability-release-audit.service';
import { CapabilityReleaseBrowserRuntimeExecutorService } from '../publisher/capability-release-browser-runtime-executor.service';
import { CapabilityReleaseBrowserRuntimeLoopExecutorService } from '../publisher/capability-release-browser-runtime-loop-executor.service';
import { CapabilityReleaseBrowserRuntimeResultService } from '../publisher/capability-release-browser-runtime-result.service';
import { CapabilityReleaseBrowserRuntimeService } from '../publisher/capability-release-browser-runtime.service';
import { CapabilityReleaseBrowserRuntimeStepExecutorService } from '../publisher/capability-release-browser-runtime-step-executor.service';
import { CapabilityReleaseBrowserRuntimeSupportService } from '../publisher/capability-release-browser-runtime-support.service';
import { CapabilityReleaseDeploymentSmokeService } from '../publisher/capability-release-deployment-smoke.service';
import { CapabilityReleaseDeploymentService } from '../publisher/capability-release-deployment.service';
import { CapabilityReleaseDocumentRuntimeService } from '../publisher/capability-release-document-runtime.service';
import { CapabilityReleasePublishService } from '../publisher/capability-release-publish.service';
import { CapabilityReleaseSkillPublisherService } from '../publisher/capability-release-skill-publisher.service';
import { CapabilityReleasePublishWriterService } from '../publisher/capability-release-publish-writer.service';
import { CapabilityReleaseRuntimeService } from '../publisher/capability-release-runtime.service';
import { ReleaseRuntimeBindingService } from '../publisher/release-runtime-binding.service';
import { CapabilityReleaseSkillDraftService } from '../capability-release-skill-draft.service';
import { CapabilityReleaseController } from './capability-release.controller';
import { CapabilityReleaseManifestService } from './capability-release.manifest.service';
import { CapabilityReleaseService } from './capability-release.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [CapabilityReleaseController],
  providers: [
    ReleaseDraftService,
    ReleaseRuntimeAccessorBindingsService,
    ReleaseFacadeAccessorBindingsService,
    ReleaseAccessorBindingsService,
    ReleaseAuditAccessorDepsService,
    ReleaseDraftQueryBridgeService,
    ReleaseDraftQuerySourceService,
    ReleaseSupportAccessorDepsService,
    ReleaseRuntimeAccessorSourceService,
    ReleaseManagementAccessorSourceService,
    ReleaseAccessorSourceService,
    ReleaseAccessorDepsService,
    ReleaseRuntimeAccessorFactoryService,
    ReleaseFacadeAccessorFactoryService,
    ReleaseRuntimeFacadeAccessorsService,
    ReleaseManagementFacadeAccessorsService,
    ReleaseAccessorFactoryService,
    ReleaseFacadeAccessorsService,
    ReleaseRuntimeFacadeContextService,
    ReleaseManagementFacadeContextService,
    ReleaseFacadeContextService,
    ReleaseLifecycleService,
    ReleaseQueryService,
    ReleaseSupportService,
    CapabilityReleaseService,
    CapabilityReleaseManifestService,
    CapabilityReleaseTemporalSchemaService,
    BrowserRecordingFlowNormalizerService,
    BrowserRecordingRuntimeStepBuilderService,
    BrowserRecordingRuntimeLoopPlannerService,
    BrowserRecordingRuntimePlannerService,
    CapabilityReleaseBrowserRecordingService,
    CapabilityReleaseRecorderBridgeCompilerService,
    BrowserRecordingActionPolicyService,
    BrowserRecordingExecutionPlanValidatorService,
    CapabilityReleasePublishValidatorService,
    CapabilityReleaseAssistService,
    CapabilityReleaseAuditService,
    CapabilityReleaseBuildValidationService,
    CapabilityReleaseDeploymentSmokeService,
    CapabilityReleaseDeploymentService,
    CapabilityReleaseBrowserRuntimeSupportService,
    CapabilityReleaseBrowserRuntimeStepExecutorService,
    CapabilityReleaseBrowserRuntimeLoopExecutorService,
    CapabilityReleaseBrowserRuntimeExecutorService,
    CapabilityReleaseBrowserRuntimeResultService,
    CapabilityReleaseBrowserRuntimeService,
    CapabilityReleaseDocumentRuntimeService,
    CapabilityReleasePublishService,
    CapabilityReleaseSkillPublisherService,
    CapabilityReleasePublishWriterService,
    ReleaseRuntimeBindingService,
    CapabilityReleaseRuntimeService,
    CapabilityReleaseSkillDraftService,
  ],
  exports: [CapabilityReleaseService, CapabilityReleaseManifestService],
})
export class CapabilityReleaseModule {}
