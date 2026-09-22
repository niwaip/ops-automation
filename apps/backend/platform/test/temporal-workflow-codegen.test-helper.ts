import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '@ops/workflow-registry/temporal/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '@ops/workflow-registry/temporal/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '@ops/workflow-registry/temporal/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '@ops/workflow-registry/temporal/temporal-activity-codegen.service';
import { TemporalWorkflowService } from '@ops/workflow-registry/temporal/temporal-workflow.service';
import { TemporalWorkflowArtifactService } from '@ops/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '@ops/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '@ops/workflow-registry/workflow-template/temporal-workflow-template.service';
import { buildDeterministicWorkflowCodeForWorkflow } from '@ops/workflow-registry/temporal/temporal-workflow-deterministic-builder';
import { TemporalWorkflowAiDraftService } from '@ops/workflow-registry/temporal/temporal-workflow-draft.service';
import {
  buildGenericAiDraftSampleValue,
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '@ops/workflow-registry/temporal/temporal-workflow-draft.normalizers';
import { repairCommonDraftPlanIssues } from '@ops/workflow-registry/temporal/temporal-workflow-draft-plan.helpers';
import { TemporalWorkflowNormalizationService } from '@ops/workflow-registry/temporal/temporal-workflow-normalization.service';
import { pickFirstNonEmptyString } from '@ops/workflow-registry/temporal/temporal-workflow-json.utils';
import { TemporalWorkflowSessionService } from '@ops/workflow-registry/temporal/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '@ops/workflow-registry/temporal/temporal-workflow-support.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '@ops/workflow-registry/temporal/temporal-workflow-template.helpers';
import { TemporalWorkflowValidationFacadeService } from '@ops/workflow-registry/temporal/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '@ops/workflow-registry/temporal/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '@ops/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowValidationContractService } from '@ops/workflow-registry/validation/temporal-workflow-validation-contract.service';
import { TemporalWorkflowDslValidationService } from '@ops/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '@ops/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import { BuiltinActivityRegistry } from '@ops/workflow-registry/temporal/builtin-activity.registry';
import { WorkflowSkeletonCompiler } from '@ops/workflow-registry/temporal/workflow-skeleton-compiler';

export const createService = () => {
  const prisma = {
    temporalWorkflow: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    chatSession: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    activity: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    skillConfig: {
      findUnique: jest.fn(),
    },
  };

  const builtinRegistry = new BuiltinActivityRegistry();
  const workflowNormalizationService = new TemporalWorkflowNormalizationService(
    prisma as any,
    builtinRegistry
  );
  const aiDraftService = new TemporalWorkflowAiDraftService(prisma as any, builtinRegistry);
  const browserDraftService = new TemporalWorkflowBrowserDraftService();
  const codegenService = new TemporalWorkflowCodegenService();
  const sessionService = new TemporalWorkflowSessionService(
    prisma as any,
    workflowNormalizationService
  );
  const validationService = new TemporalWorkflowValidationService();
  const activityResolutionService = new TemporalWorkflowActivityResolutionService(
    prisma as any,
    builtinRegistry
  );
  const workflowConfigService = new TemporalWorkflowConfigService();
  const workflowTemplateService = new TemporalWorkflowTemplateService();
  const workflowArtifactService = new TemporalWorkflowArtifactService(prisma as any);
  const workflowConfigOrchestrationService = new TemporalWorkflowConfigOrchestrationService(
    workflowConfigService
  );
  const workflowManagementService = new TemporalWorkflowManagementService(
    prisma as any,
    workflowNormalizationService,
    workflowArtifactService
  );
  const activityCodegenService = new ActivityCodegenService();
  const workflowSupportService = new TemporalWorkflowSupportService(
    builtinRegistry,
    aiDraftService,
    activityResolutionService,
    workflowConfigService,
    workflowNormalizationService,
    activityCodegenService
  );
  const workflowDraftOrchestrationService = new TemporalWorkflowDraftOrchestrationService(
    aiDraftService,
    browserDraftService,
    workflowSupportService,
    workflowTemplateService
  );
  const workflowSessionSupportFactoryService = new TemporalWorkflowSessionSupportFactoryService(
    workflowSupportService
  );
  const workflowSessionOrchestrationService = new TemporalWorkflowSessionOrchestrationService(
    sessionService,
    workflowSessionSupportFactoryService
  );
  const validationFacade = new TemporalWorkflowValidationFacadeService(validationService);
  const workflowArtifactValidationService = new TemporalWorkflowArtifactValidationService(
    prisma as any,
    validationFacade,
    workflowArtifactService,
    new TemporalWorkflowValidationContractService()
  );
  const workflowDslValidationService = new TemporalWorkflowDslValidationService(
    workflowSupportService
  );
  const workflowCodegenOrchestrationService = new TemporalWorkflowCodegenOrchestrationService(
    prisma as any,
    codegenService,
    workflowArtifactService,
    workflowSupportService,
    workflowNormalizationService
  );
  const service = new TemporalWorkflowService(
    workflowCodegenOrchestrationService,
    workflowArtifactService,
    workflowConfigOrchestrationService,
    workflowDraftOrchestrationService,
    workflowManagementService,
    workflowSessionOrchestrationService,
    workflowArtifactValidationService,
    workflowDslValidationService
  );

  return {
    service,
    prisma,
    builtinRegistry,
    aiDraftService,
    browserDraftService,
    codegenService,
    sessionService,
    validationService,
    activityResolutionService,
    workflowConfigService,
    workflowNormalizationService,
    workflowTemplateService,
    workflowArtifactService,
    workflowSupportService,
    activityCodegenService,
  };
};
