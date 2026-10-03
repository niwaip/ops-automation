import { Injectable, Logger, Optional } from '@nestjs/common';
import { hasRoutingSignal, stripSystemContext } from './routing-policy.matcher';
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
    context?: { hasPreviousResult?: boolean }
  ): PlanRouteType {
    if (!userRequest || typeof userRequest !== 'string') {
      return 'single_skill';
    }

    const text = userRequest.trim();
    const policy = this.routingPolicy.getSnapshot();
    const cleanUserText = stripSystemContext(text) || text;

    // Check for explicit multi-step compound signals on clean user text
    const hasSequentialKeyword = hasRoutingSignal(cleanUserText, 'sequential', policy);
    const hasProcessingKeyword = hasRoutingSignal(cleanUserText, 'processing', policy);
    const hasGenerationKeyword = hasRoutingSignal(cleanUserText, 'generation', policy);
    const hasArtifactKeyword = hasRoutingSignal(cleanUserText, 'artifact', policy);
    const hasDocumentSourceKeyword =
      hasRoutingSignal(cleanUserText, 'documentSource', policy) ||
      /\[系统上下文：.*(?:附件|文档|文件|pdf|docx?|pptx?)/i.test(text);

    if (hasArtifactKeyword || hasProcessingKeyword || hasGenerationKeyword) {
      this.logger.log(
        `Classified request as 'deterministic_plan' (policy=${policy.version}, sequential=${hasSequentialKeyword}, processing=${hasProcessingKeyword}, generation=${hasGenerationKeyword}, artifact=${hasArtifactKeyword}, documentSource=${hasDocumentSourceKeyword}, previousResult=${context?.hasPreviousResult === true})`
      );
      return 'deterministic_plan';
    }

    this.logger.log(`Classified request as 'single_skill' (fast path)`);
    return 'single_skill';
  }

  public shouldAttemptSingleSkillContinuation(
    userRequest: string,
    context?: { hasPreviousResult?: boolean }
  ): boolean {
    if (context?.hasPreviousResult !== true || !userRequest?.trim()) return false;
    const text = userRequest.trim();
    const policy = this.routingPolicy.getSnapshot();
    const cleanUserText = stripSystemContext(text) || text;
    const hasSummarizeIntent = hasRoutingSignal(cleanUserText, 'summarize', policy);
    const hasSequentialIntent = hasRoutingSignal(cleanUserText, 'sequential', policy);
    const hasDocumentSource =
      hasRoutingSignal(cleanUserText, 'documentSource', policy) ||
      /\[系统上下文：.*(?:附件|文档|文件|pdf|docx?|pptx?)/i.test(text);
    const hasSearchIntent = hasRoutingSignal(cleanUserText, 'search', policy);
    const hasProcessingIntent = hasRoutingSignal(cleanUserText, 'processing', policy);

    // If user specifically requests summarization, route to DeterministicPlan (LLM Operation: summarize_text)
    if (hasSummarizeIntent) return false;

    // Single-step continuation is for non-summarize processing / integration skills (e.g. bark push)
    return (
      (hasProcessingIntent || hasRoutingSignal(cleanUserText, 'artifact', policy)) &&
      !hasSequentialIntent &&
      !hasDocumentSource &&
      !hasSearchIntent
    );
  }
}
