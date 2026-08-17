import { Injectable, Logger } from '@nestjs/common';
import { PlanRouteClassifierService } from '../planner/routing/plan-route-classifier.service';
import { DeterministicPlanGeneratorService } from '../planner/deterministic/deterministic-plan-generator.service';
import { ControlPlaneClient } from '../../client/control-plane.client';

@Injectable()
export class DeterministicTaskExecutionService {
  private readonly logger = new Logger(DeterministicTaskExecutionService.name);

  constructor(
    private readonly routeClassifier: PlanRouteClassifierService,
    private readonly planGenerator: DeterministicPlanGeneratorService,
    private readonly controlPlaneClient: ControlPlaneClient,
  ) {}

  public shouldRouteToDeterministicPlan(userRequest: string): boolean {
    return this.routeClassifier.classifyRoute(userRequest) === 'deterministic_plan';
  }

  public async executeDeterministicTask(
    userRequest: string,
    userId: string,
    options?: {
      authToken?: string;
      user?: { userId: string; userRoles?: string[] };
      availableSkills?: any[];
      systemInputs?: Record<string, unknown>;
      planningRequest?: string;
    },
  ): Promise<{
    success: boolean;
    executionId?: string;
    planDraft?: any;
    errorCode?: string;
    errorMessage?: string;
  }> {
    this.logger.log(`Executing deterministic multi-step task for user ${userId}: "${userRequest}"`);

    let planDraft: any;
    try {
      planDraft = await this.planGenerator.generatePlan({
        userRequest: options?.planningRequest || userRequest,
        availableSkills: options?.availableSkills || [],
        systemInputs: options?.systemInputs,
      });
      if (options?.planningRequest && options.planningRequest !== userRequest) {
        planDraft.objective = userRequest;
        planDraft.originalRequest = userRequest;
      }
    } catch (planErr: any) {
      const errorCode = planErr.code || planErr.response?.data?.code || 'PLANNER_OUTPUT_INVALID';
      this.logger.error(`Deterministic planning failed [${errorCode}]: ${planErr.message}`);
      return {
        success: false,
        errorCode,
        errorMessage: `Task decomposition failed: ${planErr.message}`,
      };
    }

    try {
      const promptDebug = (planDraft as any)?.promptDebug;
      const executionResult = await this.controlPlaneClient.createExecution(
        {
          executionMode: 'deterministic_plan',
          input: {
            prompt: userRequest,
            ...(options?.systemInputs || {}),
            ...(promptDebug ? { __promptDebug: promptDebug } : {}),
          },
          deterministicPlan: planDraft,
        } as any,
        {
          authToken: options?.authToken,
          user: options?.user,
        },
      );

      return {
        success: true,
        executionId: executionResult.id,
        planDraft,
      };
    } catch (createErr: any) {
      const responseData = createErr.response?.data;
      const errorCode = responseData?.code || 'EXECUTION_CREATION_FAILED';
      const errorMessage = responseData?.message || createErr.message || 'Execution creation failed';

      this.logger.error(`Control plane execution creation failed: ${errorCode} - ${errorMessage}`);

      return {
        success: false,
        planDraft,
        errorCode,
        errorMessage,
      };
    }
  }
}
