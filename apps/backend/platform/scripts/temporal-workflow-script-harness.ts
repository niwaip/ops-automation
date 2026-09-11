import { TemporalWorkflowActivityResolutionService } from '@ops/workflow-registry/temporal/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '@ops/workflow-registry/temporal/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '@ops/workflow-registry/temporal/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '@ops/workflow-registry/temporal/temporal-activity-codegen.service';
import { TemporalWorkflowArtifactService } from '@ops/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '@ops/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '@ops/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '@ops/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '@ops/workflow-registry/workflow-template/temporal-workflow-template.service';
import { TemporalWorkflowAiDraftService } from '@ops/workflow-registry/temporal/temporal-workflow-draft.service';
import { TemporalWorkflowNormalizationService } from '@ops/workflow-registry/temporal/temporal-workflow-normalization.service';
import { TemporalWorkflowSessionService } from '@ops/workflow-registry/temporal/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '@ops/workflow-registry/temporal/temporal-workflow-support.service';
import { BuiltinActivityRegistry } from '@ops/workflow-registry/temporal/builtin-activity.registry';
import { TemporalWorkflowService } from '@ops/workflow-registry/temporal/temporal-workflow.service';
import { TemporalWorkflowValidationFacadeService } from '@ops/workflow-registry/temporal/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '@ops/workflow-registry/temporal/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '@ops/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowDslValidationService } from '@ops/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '@ops/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';

export const createTemporalWorkflowScriptService = (): TemporalWorkflowService => {
  const prisma = {
    temporalWorkflow: {
      create: async () => null,
      update: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
    },
    chatSession: {
      create: async () => null,
      update: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
    },
    activity: {
      findUnique: async () => null,
      findFirst: async () => null,
      findMany: async () => [],
    },
    user: {
      findFirst: async () => null,
    },
    skillConfig: {
      findUnique: async () => null,
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
    workflowArtifactService
  );
  const workflowDslValidationService = new TemporalWorkflowDslValidationService(
    workflowSupportService
  );
  const workflowCodegenOrchestrationService = new TemporalWorkflowCodegenOrchestrationService(
    prisma as any,
    codegenService,
    workflowArtifactService,
    workflowSupportService
  );

  return new TemporalWorkflowService(
    workflowCodegenOrchestrationService,
    workflowArtifactService,
    workflowConfigOrchestrationService,
    workflowDraftOrchestrationService,
    workflowManagementService,
    workflowSessionOrchestrationService,
    workflowArtifactValidationService,
    workflowDslValidationService
  );
};
