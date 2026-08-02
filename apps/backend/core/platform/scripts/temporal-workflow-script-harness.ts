import { TemporalWorkflowActivityResolutionService } from '../src/modules/temporal-workflow/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '../src/modules/temporal-workflow/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '../src/modules/temporal-workflow/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '../src/modules/temporal-workflow/temporal-activity-codegen.service';
import { TemporalWorkflowArtifactService } from '../src/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '../src/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '../src/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '../src/workflow-registry/workflow-template/temporal-workflow-template.service';
import { TemporalWorkflowAiDraftService } from '../src/modules/temporal-workflow/temporal-workflow-draft.service';
import { TemporalWorkflowNormalizationService } from '../src/modules/temporal-workflow/temporal-workflow-normalization.service';
import { TemporalWorkflowSessionService } from '../src/modules/temporal-workflow/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '../src/modules/temporal-workflow/temporal-workflow-support.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';
import { TemporalWorkflowService } from '../src/modules/temporal-workflow/temporal-workflow.service';
import { TemporalWorkflowValidationFacadeService } from '../src/modules/temporal-workflow/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '../src/modules/temporal-workflow/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '../src/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowDslValidationService } from '../src/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '../src/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';

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
