import { Logger, Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmOperationController } from './llm-operation.controller';
import { LlmOperationCatalogController } from './llm-operation-catalog.controller';
import { LlmOperationService } from './llm-operation.service';
import { LlmOperationCatalogProjector } from './llm-operation-catalog.projector';
import { LLM_OPERATION_REPOSITORY } from './registry/llm-operation.repository';
import { PrismaLlmOperationRepository } from './registry/prisma-llm-operation.repository';
import { OperationVersionPolicyService } from './registry/operation-version-policy.service';
import { OperationDigestRecomputeService } from './registry/operation-digest-recompute.service';
import { OperationActivationService } from './registry/operation-activation.service';
import { LlmOperationRegistryService } from './registry/llm-operation-registry.service';
import { OperationAdminController } from './admin/operation-admin.controller';
import { OperationAdminService } from './admin/operation-admin.service';
import { PromptRendererService } from './runtime/prompt-renderer.service';
import { InputValidatorService } from './runtime/input-validator.service';
import { ToolCallGuardService } from './runtime/tool-call-guard.service';
import { OutputValidatorService } from './runtime/output-validator.service';
import { BudgetEnforcerService } from './runtime/budget-enforcer.service';
import { LlmOperationV2RuntimeService } from './runtime/llm-operation-v2-runtime.service';
import { LlmOperationModelCallerService } from './runtime/llm-operation-model-caller.service';
import { FixtureRunnerService } from './eval/fixture-runner.service';
import { EvalRunnerService } from './eval/eval-runner.service';
import { RegressionComparatorService } from './eval/regression-comparator.service';
import { GateEvaluatorService } from './eval/gate-evaluator.service';
import { AttestationService } from './eval/attestation.service';
import { AttestationController } from './eval/attestation.controller';
import { LlmOperationAuditService } from './audit/llm-operation-audit.service';
import { LlmOperationV2Controller } from './llm-operation-v2.controller';
import { OperationManifestValidatorService } from './eval/operation-manifest-validator.service';
import { OperationValidationOrchestratorService } from './eval/operation-validation-orchestrator.service';
import { SystemOperationBootstrapService } from './seed/system-operation-bootstrap.service';

@Module({
  imports: [PrismaModule, ModelModule],
  controllers: [
    LlmOperationController,
    LlmOperationCatalogController,
    OperationAdminController,
    AttestationController,
    LlmOperationV2Controller,
  ],
  providers: [
    {
      provide: LLM_OPERATION_REPOSITORY,
      useExisting: PrismaLlmOperationRepository,
    },
    Logger,
    LlmOperationService,
    LlmOperationCatalogProjector,
    PrismaLlmOperationRepository,
    OperationVersionPolicyService,
    OperationDigestRecomputeService,
    OperationActivationService,
    LlmOperationRegistryService,
    OperationAdminService,
    FixtureRunnerService,
    EvalRunnerService,
    RegressionComparatorService,
    GateEvaluatorService,
    AttestationService,
    PromptRendererService,
    InputValidatorService,
    ToolCallGuardService,
    OutputValidatorService,
    BudgetEnforcerService,
    LlmOperationModelCallerService,
    LlmOperationV2RuntimeService,
    LlmOperationAuditService,
    OperationManifestValidatorService,
    OperationValidationOrchestratorService,
    SystemOperationBootstrapService,
  ],
  exports: [
    LlmOperationService,
    LlmOperationCatalogProjector,
    LlmOperationRegistryService,
    OperationActivationService,
    OperationAdminService,
    AttestationService,
    GateEvaluatorService,
    LlmOperationV2RuntimeService,
    LlmOperationAuditService,
  ],
})
export class LlmOperationModule {}
