import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import { unwrapStoredStepOutput } from './stored-step-output';

export interface FinalOutputCheckResult {
  satisfied: boolean;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: any[];
}

@Injectable()
export class DeterministicFinalOutputService {
  private readonly logger = new Logger(DeterministicFinalOutputService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asserts that final output requirements are fully satisfied by completed step outputs & generated artifacts.
   */
  public async assertSatisfied(
    executionId: string,
    frozenPlan: DeterministicPlanDraftV1,
  ): Promise<FinalOutputCheckResult> {
    if (!frozenPlan.finalOutputs || frozenPlan.finalOutputs.length === 0) {
      return { satisfied: true };
    }

    const steps = await this.prisma.executionStep.findMany({
      where: { executionId, status: 'succeeded' },
    });

    const stepMap = new Map<string, any>();
    for (const step of steps) {
      if (step.planNodeId) {
        stepMap.set(step.planNodeId, step);
      }
    }

    const artifacts = await this.prisma.executionArtifact.findMany({
      where: { executionId },
    });

    for (const req of frozenPlan.finalOutputs) {
      const step = stepMap.get(req.fromNodeId);
      if (!step) {
        return {
          satisfied: false,
          errorCode: 'FINAL_OUTPUT_MISSING',
          errorMessage: `Producer node '${req.fromNodeId}' did not succeed or step record is missing`,
        };
      }

      const outputData = unwrapStoredStepOutput(step.outputJson);
      if (!outputData || outputData[req.fromNodeOutput] === undefined) {
        return {
          satisfied: false,
          errorCode: 'FINAL_OUTPUT_MISSING',
          errorMessage: `Producer node '${req.fromNodeId}' did not produce expected output '${req.fromNodeOutput}'`,
        };
      }

      if (req.isArtifact || req.expectedType === 'artifact_ref') {
        const matchingArtifact = artifacts.find(
          (art) => art.producerNodeId === req.fromNodeId || art.producerStepId === step.id,
        );
        if (!matchingArtifact) {
          return {
            satisfied: false,
            errorCode: 'FINAL_OUTPUT_MISSING',
            errorMessage: `Producer node '${req.fromNodeId}' did not generate required artifact for field '${req.targetField}'`,
          };
        }
      }
    }

    return {
      satisfied: true,
      artifacts,
    };
  }
}
