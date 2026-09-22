import 'reflect-metadata';
import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BridgeRecorderExportDTO } from '../../registry-release/release-manager/src/interfaces';
import { CapabilityReleaseAssistService } from '../../registry-release/release-manager/src/capability-release-assist.service';
import { CapabilityReleaseSkillDraftService } from '../../registry-release/release-manager/src/capability-release-skill-draft.service';
import { BrowserRecordingFlowNormalizerService } from '../../registry-release/release-manager/src/compiler/browser-recording-flow-normalizer.service';
import { BrowserRecordingRuntimeLoopPlannerService } from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-loop-planner.service';
import { BrowserRecordingRuntimePlannerService } from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-planner.service';
import { BrowserRecordingRuntimeStepBuilderService } from '../../registry-release/release-manager/src/compiler/browser-recording-runtime-step-builder.service';
import { CapabilityReleaseBrowserRecordingService } from '../../registry-release/release-manager/src/compiler/capability-release-browser-recording.service';
import { CapabilityReleaseBuildValidationService } from '../../registry-release/release-manager/src/compiler/capability-release-build-validation.service';
import { CapabilityReleaseRecorderBridgeCompilerService } from '../../registry-release/release-manager/src/compiler/capability-release-recorder-bridge-compiler.service';
import { CapabilityReleaseTemporalSchemaService } from '../../registry-release/release-manager/src/compiler/capability-release-temporal-schema.service';
import { BrowserRecordingActionPolicyService } from '../../registry-release/release-manager/src/validator/browser-recording-action-policy.service';
import { CapabilityReleasePublishValidatorService } from '../../registry-release/release-manager/src/validator/capability-release-publish-validator.service';
import { SchemaCompatibilityService } from '../../registry-release/release-manager/src/validator/schema-compatibility.service';
import { ContractLintService } from '../../registry-release/release-manager/src/validator/contract-lint.service';
import { CapabilityAttestationService } from '../../registry-release/release-manager/src/attestation/capability-attestation.service';
import { CapabilityFixtureService } from '../../registry-release/release-manager/src/fixture/capability-fixture.service';
import { CapabilityReleaseBrowserRuntimeExecutorService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-executor.service';
import { CapabilityReleaseBrowserRuntimeLoopExecutorService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-loop-executor.service';
import { CapabilityReleaseBrowserRuntimeResultService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-result.service';
import { CapabilityReleaseBrowserRuntimeService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime.service';
import { CapabilityReleaseBrowserRuntimeStepExecutorService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-step-executor.service';
import { CapabilityReleaseBrowserRuntimeSupportService } from '../../registry-release/release-manager/src/publisher/capability-release-browser-runtime-support.service';
import { BrowserPostStateReconcilerService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-post-state-reconciler.service';
import { BrowserRuntimeStepResultStateService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-runtime-step-result-state.service';
import { BrowserRunOutputMaterializerService } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-run-output-materializer.service';
import { BrowserLegacyOutputAdapter } from '../../registry-release/release-manager/src/publisher/browser-runtime-result/browser-legacy-output.adapter';
import { CapabilityReleaseDeploymentSmokeService } from '../../registry-release/release-manager/src/publisher/capability-release-deployment-smoke.service';
import { CapabilityReleaseDeploymentService } from '../../registry-release/release-manager/src/publisher/capability-release-deployment.service';
import { CapabilityReleaseDocumentRuntimeService } from '../../registry-release/release-manager/src/publisher/capability-release-document-runtime.service';
import { CapabilityReleasePublishService } from '../../registry-release/release-manager/src/publisher/capability-release-publish.service';
import { CapabilityReleasePublishWriterService } from '../../registry-release/release-manager/src/publisher/capability-release-publish-writer.service';
import { CapabilityReleaseRuntimeService } from '../../registry-release/release-manager/src/publisher/capability-release-runtime.service';
import { CapabilityReleaseSkillPublisherService } from '../../registry-release/release-manager/src/publisher/capability-release-skill-publisher.service';
import { ReleaseRuntimeBindingService } from '../../registry-release/release-manager/src/publisher/release-runtime-binding.service';
import {
  ReleaseAccessorBindingsService,
  ReleaseAccessorDepsService,
  ReleaseAccessorSourceService,
  ReleaseFacadeAccessorFactoryService,
  ReleaseAccessorFactoryService,
  ReleaseAuditAccessorDepsService,
  ReleaseDraftQueryBridgeService,
  ReleaseFacadeAccessorsService,
  ReleaseDraftQuerySourceService,
  ReleaseFacadeAccessorBindingsService,
  ReleaseFacadeContextService,
  ReleaseLifecycleService,
  ReleaseManagementAccessorSourceService,
  ReleaseManagementFacadeContextService,
  ReleaseManagementFacadeAccessorsService,
  ReleaseQueryService,
  ReleaseRuntimeAccessorFactoryService,
  ReleaseRuntimeAccessorSourceService,
  ReleaseRuntimeFacadeContextService,
  ReleaseRuntimeFacadeAccessorsService,
  ReleaseRuntimeAccessorBindingsService,
  ReleaseSupportAccessorDepsService,
  ReleaseSupportService,
} from '../../registry-release/release-manager/src/release';
import {
  CapabilityReleaseManifestService,
  CapabilityReleaseService,
} from '../../registry-release/release-manager/src/release';

export const createService = () => {
  const prisma = {
    $executeRawUnsafe: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  };
  const activityService = {
    executeCodeInTemporalSandbox: jest.fn(),
    executeCodeStreaming: jest.fn(),
  };
  const temporalWorkflowService = {
    getArtifact: jest.fn(),
  };
  const skillService = {
    validateSkillToolsPayload: jest.fn(),
    createSkill: jest.fn(),
    getSkillToolBindings: jest.fn(),
  };
  const toolCatalogService = {
    getCatalogItemsByNames: jest.fn(),
  };

  const temporalSchemaService = new CapabilityReleaseTemporalSchemaService();
  const browserRecordingFlowNormalizerService = new BrowserRecordingFlowNormalizerService();
  const browserRecordingRuntimeStepBuilderService = new BrowserRecordingRuntimeStepBuilderService(
    browserRecordingFlowNormalizerService
  );
  const browserRecordingRuntimeLoopPlannerService = new BrowserRecordingRuntimeLoopPlannerService();
  const browserRecordingRuntimePlannerService = new BrowserRecordingRuntimePlannerService(
    browserRecordingRuntimeStepBuilderService,
    browserRecordingRuntimeLoopPlannerService
  );
  const browserRecordingService = new CapabilityReleaseBrowserRecordingService(
    browserRecordingFlowNormalizerService,
    browserRecordingRuntimePlannerService
  );
  const executionFlowValidationFacade = { validateTemplate: jest.fn() };
  const browserRecordingActionPolicyService = new BrowserRecordingActionPolicyService();
  const browserRecordingExecutionPlanValidatorService = {
    validateForBridge: jest.fn().mockReturnValue({ valid: true }),
    validateForRuntime: jest.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
    validateForPublish: jest.fn().mockReturnValue({ valid: true }),
    normalizePayloadForCompatibility: jest.fn().mockImplementation((payload) => payload),
  };

  const skillDraftService = new CapabilityReleaseSkillDraftService(
    browserRecordingService,
    temporalSchemaService
  );
  const releaseRuntimeBindingService = new ReleaseRuntimeBindingService(
    prisma as any,
    skillService as any,
    toolCatalogService as any
  );
  const releaseQueryService = new ReleaseQueryService(prisma as any);
  const releaseSupportService = new ReleaseSupportService(
    prisma as any,
    temporalWorkflowService as any
  );
  const releaseDraftService = {
    createCapability: jest.fn(),
    updateSource: jest.fn(),
  };
  const releaseRuntimeAccessorFactoryService = new ReleaseRuntimeAccessorFactoryService();
  const releaseFacadeAccessorFactoryService = new ReleaseFacadeAccessorFactoryService();
  const releaseAccessorFactoryService = new ReleaseAccessorFactoryService(
    releaseRuntimeAccessorFactoryService,
    releaseFacadeAccessorFactoryService
  );
  const releaseLifecycleService = new ReleaseLifecycleService(prisma as any);
  const releaseDraftQueryBridgeService = new ReleaseDraftQueryBridgeService(
    releaseDraftService as any,
    releaseQueryService
  );
  const releaseRuntimeAccessorBindingsService = new ReleaseRuntimeAccessorBindingsService();
  const releaseFacadeAccessorBindingsService = new ReleaseFacadeAccessorBindingsService();
  const releaseAccessorBindingsService = new ReleaseAccessorBindingsService(
    releaseRuntimeAccessorBindingsService,
    releaseFacadeAccessorBindingsService
  );
  const releaseAuditAccessorDepsService = new ReleaseAuditAccessorDepsService({
    insertAuditEvent: jest.fn(),
  } as any);
  const releaseSupportAccessorDepsService = new ReleaseSupportAccessorDepsService(
    releaseAccessorBindingsService,
    releaseSupportService
  );
  const releaseDraftQuerySourceService = new ReleaseDraftQuerySourceService(
    releaseAuditAccessorDepsService as any,
    releaseDraftQueryBridgeService,
    releaseSupportAccessorDepsService
  );
  const releaseAccessorSourceService = new ReleaseAccessorSourceService(
    new ReleaseRuntimeAccessorSourceService(releaseSupportAccessorDepsService),
    new ReleaseManagementAccessorSourceService(
      releaseAuditAccessorDepsService as any,
      releaseDraftQuerySourceService,
      releaseSupportAccessorDepsService
    )
  );
  const releaseAccessorDepsService = new ReleaseAccessorDepsService(
    releaseSupportAccessorDepsService
  );
  const releaseFacadeAccessorsService = new ReleaseFacadeAccessorsService(
    new ReleaseRuntimeFacadeAccessorsService(
      releaseAccessorFactoryService,
      releaseAccessorDepsService
    ),
    new ReleaseManagementFacadeAccessorsService(
      releaseAccessorFactoryService,
      releaseAccessorDepsService
    )
  );
  const releaseFacadeContextService = new ReleaseFacadeContextService(
    new ReleaseRuntimeFacadeContextService(
      releaseFacadeAccessorsService,
      releaseAccessorSourceService
    ),
    new ReleaseManagementFacadeContextService(
      new ReleaseManagementFacadeAccessorsService(
        releaseAccessorFactoryService,
        releaseAccessorDepsService
      ),
      releaseAccessorSourceService
    )
  );
  const capabilityReleaseBrowserRuntimeSupportService =
    new CapabilityReleaseBrowserRuntimeSupportService();
  const browserRuntimeStepResultStateService = new BrowserRuntimeStepResultStateService();
  const capabilityReleaseBrowserRuntimeStepExecutorService =
    new CapabilityReleaseBrowserRuntimeStepExecutorService(
      browserRecordingActionPolicyService,
      capabilityReleaseBrowserRuntimeSupportService,
      new BrowserPostStateReconcilerService(),
      browserRuntimeStepResultStateService
    );
  const capabilityReleaseBrowserRuntimeLoopExecutorService =
    new CapabilityReleaseBrowserRuntimeLoopExecutorService(
      capabilityReleaseBrowserRuntimeStepExecutorService,
      capabilityReleaseBrowserRuntimeSupportService,
      browserRuntimeStepResultStateService
    );
  const capabilityReleaseBrowserRuntimeResultService =
    new CapabilityReleaseBrowserRuntimeResultService(
      new BrowserRunOutputMaterializerService(),
      new BrowserLegacyOutputAdapter()
    );
  const capabilityReleaseBrowserRuntimeExecutorService =
    new CapabilityReleaseBrowserRuntimeExecutorService(
      capabilityReleaseBrowserRuntimeStepExecutorService,
      capabilityReleaseBrowserRuntimeLoopExecutorService
    );
  const capabilityReleaseBrowserRuntimeService = new CapabilityReleaseBrowserRuntimeService(
    browserRecordingExecutionPlanValidatorService as any,
    browserRecordingService,
    capabilityReleaseBrowserRuntimeExecutorService,
    capabilityReleaseBrowserRuntimeResultService,
    capabilityReleaseBrowserRuntimeSupportService,
    {
      acquire: jest.fn().mockImplementation(async (input: { runtimeSessionId?: string }) => ({
        runtimeSessionId: input.runtimeSessionId || '11111111-1111-4111-8111-111111111111',
        ownedByRuntime: !input.runtimeSessionId,
      })),
      closeOwnedQuietly: jest.fn().mockResolvedValue(undefined),
    } as any
  );
  const runtimeService = new CapabilityReleaseRuntimeService(
    activityService as any,
    releaseRuntimeBindingService,
    new CapabilityReleaseDocumentRuntimeService(skillDraftService),
    capabilityReleaseBrowserRuntimeService
  );
  const buildValidationService = new CapabilityReleaseBuildValidationService(
    prisma as any,
    activityService as any,
    executionFlowValidationFacade as any,
    runtimeService,
    browserRecordingService,
    skillDraftService,
    temporalSchemaService,
    new ContractLintService()
  );
  const recorderBridgeCompilerService = new CapabilityReleaseRecorderBridgeCompilerService(
    browserRecordingFlowNormalizerService
  );
  const publishValidatorService = new CapabilityReleasePublishValidatorService(
    skillService as any,
    prisma as any,
    browserRecordingFlowNormalizerService,
    browserRecordingExecutionPlanValidatorService as any,
    temporalSchemaService,
    new SchemaCompatibilityService(),
    new ContractLintService()
  );
  const publishWriterService = new CapabilityReleasePublishWriterService(prisma as any);
  const skillPublisherService = new CapabilityReleaseSkillPublisherService(
    prisma as any,
    skillService as any,
    publishWriterService
  );
  const deploymentSmokeService = new CapabilityReleaseDeploymentSmokeService(
    prisma as any,
    activityService as any,
    executionFlowValidationFacade as any,
    browserRecordingService,
    temporalSchemaService
  );
  const deploymentService = new CapabilityReleaseDeploymentService(
    prisma as any,
    activityService as any,
    skillService as any,
    deploymentSmokeService
  );
  const assistService = new CapabilityReleaseAssistService(prisma as any);
  const publishService = new CapabilityReleasePublishService(
    recorderBridgeCompilerService,
    browserRecordingExecutionPlanValidatorService as any,
    publishValidatorService,
    publishWriterService,
    skillPublisherService,
    prisma as any,
    new CapabilityAttestationService(prisma as any),
    new CapabilityFixtureService(prisma as any)
  );
  const manifestService = new CapabilityReleaseManifestService();

  const service = new CapabilityReleaseService(
    buildValidationService,
    deploymentService,
    assistService,
    publishService,
    runtimeService,
    releaseDraftService as any,
    releaseFacadeContextService,
    releaseLifecycleService,
    releaseQueryService,
    manifestService,
    skillDraftService,
    temporalSchemaService,
    {} as any
  );

  return {
    service,
    prisma,
    skillService,
    toolCatalogService,
    activityService,
    temporalWorkflowService,
    releaseRuntimeBindingService,
    releaseDraftService,
    releaseQueryService,
    releaseFacadeContextService,
  };
};
