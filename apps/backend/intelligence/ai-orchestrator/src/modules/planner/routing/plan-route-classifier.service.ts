import { Injectable, Logger, Optional } from '@nestjs/common';
import { hasRoutingSignal } from './routing-policy.matcher';
import { RoutingPolicyService } from './routing-policy.service';

export type PlanRouteType = 'single_skill' | 'deterministic_plan';

@Injectable()
export class PlanRouteClassifierService {
  private readonly logger = new Logger(PlanRouteClassifierService.name);
  private readonly routingPolicy: RoutingPolicyService;

  constructor(@Optional() routingPolicy?: RoutingPolicyService) {
    this.routingPolicy = routingPolicy || new RoutingPolicyService();
  }

  public classifyRoute(
    userRequest: string,
    context?: { hasPreviousResult?: boolean },
  ): PlanRouteType {
    if (!userRequest || typeof userRequest !== 'string') {
      return 'single_skill';
    }

    const text = userRequest.trim();
    const policy = this.routingPolicy.getSnapshot();

    // Check for explicit multi-step compound signals
    const hasSequentialKeyword = hasRoutingSignal(text, 'sequential', policy);
    const hasProcessingKeyword = hasRoutingSignal(text, 'processing', policy);
    const hasArtifactKeyword = hasRoutingSignal(text, 'artifact', policy);
    const hasDocumentSourceKeyword = hasRoutingSignal(text, 'documentSource', policy);

    if (hasArtifactKeyword || hasProcessingKeyword) {
      this.logger.log(`Classified request as 'deterministic_plan' (policy=${policy.version}, sequential=${hasSequentialKeyword}, processing=${hasProcessingKeyword}, artifact=${hasArtifactKeyword}, documentSource=${hasDocumentSourceKeyword}, previousResult=${context?.hasPreviousResult === true})`);
      return 'deterministic_plan';
    }

    this.logger.log(`Classified request as 'single_skill' (fast path)`);
    return 'single_skill';
  }

  public shouldAttemptSingleSkillContinuation(
    userRequest: string,
    context?: { hasPreviousResult?: boolean },
  ): boolean {
    if (context?.hasPreviousResult !== true || !userRequest?.trim()) return false;
    const text = userRequest.trim();
    const policy = this.routingPolicy.getSnapshot();
    const hasProcessingIntent = hasRoutingSignal(text, 'processing', policy);
    const hasSequentialIntent = hasRoutingSignal(text, 'sequential', policy);
    const hasArtifactIntent = hasRoutingSignal(text, 'artifact', policy);
    const hasDocumentSource = hasRoutingSignal(text, 'documentSource', policy);

    return (
      hasProcessingIntent &&
      !hasSequentialIntent &&
      !hasArtifactIntent &&
      !hasDocumentSource
    );
  }
}
