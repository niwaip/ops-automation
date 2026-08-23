import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { PlanRouteClassifierService } from '../planner/routing/plan-route-classifier.service';
import { DeterministicPlanGeneratorService } from '../planner/deterministic/deterministic-plan-generator.service';
import { ControlPlaneClient } from '../../client/control-plane.client';
import { RoutingPolicyService } from '../planner/routing/routing-policy.service';
import {
  matchSavedWorkflow,
  rankSavedWorkflows,
  type SavedWorkflowCandidate,
} from './saved-workflow-matcher';

@Injectable()
export class DeterministicTaskExecutionService {
  private readonly logger = new Logger(DeterministicTaskExecutionService.name);
  private readonly routingPolicy: RoutingPolicyService;

  constructor(
    private readonly routeClassifier: PlanRouteClassifierService,
    private readonly planGenerator: DeterministicPlanGeneratorService,
    private readonly controlPlaneClient: ControlPlaneClient,
    @Optional() routingPolicy?: RoutingPolicyService,
  ) {
    this.routingPolicy = routingPolicy || new RoutingPolicyService();
  }

  public shouldRouteToDeterministicPlan(
    userRequest: string,
    context?: { hasPreviousResult?: boolean },
  ): boolean {
    return this.routeClassifier.classifyRoute(userRequest, context) === 'deterministic_plan';
  }

  public shouldAttemptSingleSkillContinuation(
    userRequest: string,
    context?: { hasPreviousResult?: boolean },
  ): boolean {
    return this.routeClassifier.shouldAttemptSingleSkillContinuation(userRequest, context);
  }

  public async executeMatchedSavedWorkflow(
    userRequest: string,
    options?: {
      authToken?: string;
      user?: { userId: string; userRoles?: string[] };
    },
  ): Promise<{
    matched: boolean;
    success: boolean;
    executionId?: string;
    workflow?: SavedWorkflowCandidate;
    score?: number;
    matchMethod?: 'name' | 'alias' | 'habit' | 'lexical';
    candidateCount?: number;
    errorCode?: string;
    errorMessage?: string;
  }> {
    let response: { skills?: SavedWorkflowCandidate[] };
    try {
      response = await this.controlPlaneClient.listSavedSkills(options);
    } catch (error: any) {
      this.logger.warn(`Unable to load saved workflows: ${error.message}`);
      return { matched: false, success: false };
    }

    const candidates = response.skills || [];
    const policy = this.routingPolicy.getSnapshot();
    const ranking = rankSavedWorkflows(userRequest, candidates, 5, policy);
    const match = matchSavedWorkflow(userRequest, candidates, policy);
    if (!match) {
      await this.recordRoutingObservation(userRequest, options, {
        routeSource: 'full_planner',
        candidateCount: ranking.eligibleCount,
        plannerInvoked: true,
        matchMethod: ranking.ambiguous ? 'ambiguous' : 'below_threshold',
      });
      return {
        matched: false,
        success: false,
        candidateCount: ranking.eligibleCount,
      };
    }

    try {
      const execution = await this.controlPlaneClient.createExecution<{ id: string }>(
        {
          skillId: match.workflow.id,
          capabilityId: match.workflow.id,
          skillVersion: match.workflow.version,
          capabilityVersion: match.workflow.version,
          input: {},
        },
        options,
      );
      this.logger.log(
        `Matched private saved workflow ${match.workflow.id} at score ${match.score.toFixed(3)} using routing policy ${policy.version}`,
      );
      await this.recordRoutingObservation(userRequest, options, {
        routeSource: 'saved_workflow',
        matchMethod: match.matchMethod,
        selectedSourceId: match.workflow.id,
        selectedVersion: match.workflow.version,
        candidateCount: ranking.eligibleCount,
        matchScore: match.score,
        plannerInvoked: false,
        contractStatus: 'accepted',
      });
      return {
        matched: true,
        success: true,
        executionId: execution.id,
        workflow: match.workflow,
        score: match.score,
        matchMethod: match.matchMethod,
        candidateCount: ranking.eligibleCount,
      };
    } catch (error: any) {
      const responseData = error.response?.data;
      await this.recordRoutingObservation(userRequest, options, {
        routeSource: 'saved_workflow',
        matchMethod: match.matchMethod,
        selectedSourceId: match.workflow.id,
        selectedVersion: match.workflow.version,
        candidateCount: ranking.eligibleCount,
        matchScore: match.score,
        plannerInvoked: false,
        contractStatus: 'rejected',
        errorCode: responseData?.code || 'SAVED_WORKFLOW_EXECUTION_FAILED',
      });
      return {
        matched: true,
        success: false,
        workflow: match.workflow,
        score: match.score,
        matchMethod: match.matchMethod,
        candidateCount: ranking.eligibleCount,
        errorCode: responseData?.code || 'SAVED_WORKFLOW_EXECUTION_FAILED',
        errorMessage: responseData?.message || error.message || 'Saved workflow execution failed',
      };
    }
  }

  private async recordRoutingObservation(
    userRequest: string,
    options: { authToken?: string; user?: { userId: string; userRoles?: string[] } } | undefined,
    observation: Record<string, unknown>,
  ): Promise<void> {
    if (!options?.user?.userId) return;
    try {
      const policy = this.routingPolicy.getSnapshot();
      await this.controlPlaneClient.recordRoutingObservation(
        {
          requestFingerprint: createHash('sha256')
            .update(String(userRequest || '').normalize('NFKC').trim().toLowerCase())
            .digest('hex'),
          routingPolicyVersion: policy.version,
          routingPolicyDigest: policy.digest,
          ...observation,
        },
        options,
      );
    } catch (error: any) {
      this.logger.warn(`Unable to persist routing observation: ${error.message}`);
    }
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
      const promptDebug = (planDraft)?.promptDebug;
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
