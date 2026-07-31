import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DeterministicPlanDraftV1,
  computePlanHash,
} from '@ops/backend-deterministic-plan';
import { DeterministicPlanValidatorService } from './deterministic-plan-validator.service';
import { ERROR_CODES } from '@ops/backend-error-codes';

@Injectable()
export class DeterministicPlanFreezeService {
  private readonly logger = new Logger(DeterministicPlanFreezeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: DeterministicPlanValidatorService,
  ) {}

  /**
   * Freezes a plan draft, validates it, computes its planHash, and saves ExecutionPlan + ExecutionSteps in a single DB transaction.
   */
  public async freezeAndPersistPlan(
    executionId: string,
    planDraft: DeterministicPlanDraftV1,
    txPrisma?: any,
  ): Promise<{ planId: string; planHash: string }> {
    const validationResult = this.validator.validatePlan(planDraft);
    if (!validationResult.valid) {
      this.logger.error(`Plan validation failed for execution ${executionId}:`, validationResult.errors);
      throw new BadRequestException({
        code: validationResult.errors[0]?.code || ERROR_CODES.PLAN_SCHEMA_INVALID,
        message: `Deterministic plan validation failed: ${validationResult.errors[0]?.message}`,
        details: validationResult.errors,
      });
    }

    const planHash = computePlanHash(planDraft);
    const frozenAt = new Date();

    const planData = {
      executionId,
      schemaVersion: planDraft.schemaVersion,
      plannerVersion: planDraft.plannerVersion || 'v1',
      catalogVersion: planDraft.catalogVersion || 'v1',
      planType: planDraft.planType,
      status: 'frozen',
      objective: planDraft.objective,
      planJson: planDraft as any,
      validationJson: validationResult as any,
      planHash,
      frozenAt,
    };

    const client = txPrisma || this.prisma;

    // Create execution_plan record
    const createdPlan = await client.executionPlan.create({
      data: planData,
    });

    // Create execution_steps records for each node in the frozen plan
    for (const node of planDraft.nodes) {
      await client.executionStep.create({
        data: {
          executionId,
          stepIndex: node.sequence,
          name: node.title || node.nodeId,
          type: node.kind === 'skill' ? 'system' : 'system',
          status: 'pending',
          action: node.kind === 'skill' ? (node as any).runtimeType : (node as any).operationId,
          planNodeId: node.nodeId,
          nodeKind: node.kind,
          capabilityId: node.kind === 'skill' ? (node as any).skillId : (node as any).operationId,
          capabilityVersion: node.kind === 'skill' ? (node as any).skillVersion : (node as any).promptTemplateVersion,
          dependsOnJson: node.dependsOn as any,
          inputBindingsJson: ((node.inputBindings as any) || {}) as any,
          outputContractJson: {
            ...(node.outputContract || {}),
            ...(node.kind === 'llm_operation'
              ? {
                  promptTemplateId: (node as any).promptTemplateId,
                  promptTemplateVersion: (node as any).promptTemplateVersion,
                  modelPolicyId: (node as any).modelPolicyId,
                  temperature: (node as any).temperature,
                  maxInputTokens: (node as any).maxInputTokens,
                  maxOutputTokens: (node as any).maxOutputTokens,
                }
              : {}),
          } as any,
          idempotencyKey: `${executionId}:${node.nodeId}:${node.kind}`,
        },
      });
    }

    this.logger.log(`Plan frozen & persisted for execution ${executionId} (planHash: ${planHash})`);

    return {
      planId: createdPlan.id,
      planHash,
    };
  }
}
