import { Injectable, Logger } from '@nestjs/common';
import type {
  PlanningClassV1,
  PlanningDecisionV1,
  PlanningRouteSourceV1,
} from '@ops/backend-planning-decision';
import { createHash } from 'crypto';
import { ControlPlaneClient } from '../../client/control-plane.client';
import { PlanRouteClassifierService } from '../planner/routing/plan-route-classifier.service';
import { RoutingPolicyService } from '../planner/routing/routing-policy.service';

interface ShadowRecordOptions {
  authToken?: string;
  user?: { userId: string; userRoles?: string[] };
  executionId?: string;
  routeClass?: PlanningClassV1;
  routeSource?: PlanningRouteSourceV1;
  confidence?: number;
  reasonCodes?: string[];
  candidateIds?: string[];
  selectedCapabilityIds?: string[];
}

const EMPTY_CATALOG_DIGEST = createHash('sha256')
  .update('planning-shadow:catalog-unavailable:v1')
  .digest('hex');

@Injectable()
export class PlanningDecisionShadowService {
  private readonly logger = new Logger(PlanningDecisionShadowService.name);
  private readonly enabled = process.env.PLANNING_DECISION_PERSIST_ENABLED === 'true';

  constructor(
    private readonly classifier: PlanRouteClassifierService,
    private readonly routingPolicy: RoutingPolicyService,
    private readonly controlPlaneClient: ControlPlaneClient
  ) {}

  async recordLegacyRoute(
    userRequest: string,
    context: { hasPreviousResult?: boolean },
    options: ShadowRecordOptions
  ): Promise<void> {
    if (!this.enabled || !options.user?.userId) return;
    const legacyRoute = this.classifier.classifyRoute(userRequest, context);
    await this.record(userRequest, {
      ...options,
      routeClass:
        options.routeClass ||
        (legacyRoute === 'deterministic_plan' ? 'generated_plan' : 'single_capability'),
      routeSource:
        options.routeSource ||
        (legacyRoute === 'deterministic_plan' ? 'llm_topology' : 'deterministic_match'),
      confidence: options.confidence ?? 1,
      reasonCodes: options.reasonCodes || [`legacy_route:${legacyRoute}`],
    });
  }

  async record(userRequest: string, options: ShadowRecordOptions): Promise<void> {
    if (!this.enabled || !options.user?.userId || !options.routeClass || !options.routeSource) {
      return;
    }
    const policy = this.routingPolicy.getSnapshot();
    const usesTopologyModel = options.routeClass === 'generated_plan';
    const decision: PlanningDecisionV1 = {
      schemaVersion: 'planning-decision/v1',
      routeClass: options.routeClass,
      routeSource: options.routeSource,
      confidence: options.confidence ?? 1,
      reasonCodes: options.reasonCodes || [],
      candidateIds: options.candidateIds || [],
      selectedCapabilityIds: options.selectedCapabilityIds || [],
      catalogSnapshotDigest: EMPTY_CATALOG_DIGEST,
      routingPolicyVersion: policy.version,
      routingPolicyDigest: policy.digest,
      estimatedModelCalls: usesTopologyModel ? 1 : 0,
      estimatedInputTokens: 0,
      tokenBudget: usesTopologyModel
        ? Number(process.env.PLANNING_TOPOLOGY_TOKEN_BUDGET || 4000)
        : 0,
      riskLevel: 'L0',
      requiresApproval: false,
      replayability: options.routeClass === 'replay_workflow' ? 'exact' : 'contract',
    };

    try {
      await this.controlPlaneClient.recordPlanningDecision(
        {
          requestFingerprint: createHash('sha256')
            .update(
              String(userRequest || '')
                .normalize('NFKC')
                .trim()
                .toLowerCase()
            )
            .digest('hex'),
          ...(options.executionId ? { executionId: options.executionId } : {}),
          shadow: true,
          decision,
        },
        { authToken: options.authToken, user: options.user }
      );
    } catch (error) {
      this.logger.warn(
        `Unable to persist shadow planning decision: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
