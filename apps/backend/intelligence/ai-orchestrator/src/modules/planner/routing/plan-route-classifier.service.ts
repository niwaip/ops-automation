import { Injectable, Logger, Optional } from '@nestjs/common';
import { isGuideOrInquiryRequest } from '@ops/backend-runtime-capability-contract';
import { hasRoutingSignal, stripSystemContext } from './routing-policy.matcher';
import { RoutingPolicyService } from './routing-policy.service';

export type PlanRouteType = 'single_skill' | 'deterministic_plan' | 'conversational_chat';

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

    const hasWorkSlashCommand = /^\s*\/(?:extract|doc|workspace|rag|search|pdf|email|mail|pdf-extract)\b/i.test(cleanUserText);

    // Guide, inquiry, and explicit negation requests (e.g. "如何使用知识库进行多文档对比？", "什么是...", "我只是咨询...不用审查...")
    // must not be forced into deterministic multi-step recipes or execution plans,
    // UNLESS the user explicitly initiated a work slash command (e.g. /doc, /extract).
    const isConsultationOrNegation =
      !hasWorkSlashCommand &&
      (isGuideOrInquiryRequest(cleanUserText) ||
        /(?:(?:我只是?|仅为?|作为)?(?:咨询|请问|请教)|(?:什么是|何为|怎么理解|如何理解|有哪些|通常检查|主要检查|一般检查|通常包含|主要包含|什么叫|怎样看待|需要注意哪些|怎么做|如何做))/i.test(
          cleanUserText
        ) ||
        /(?:不用|无需|不需要|不要|别)(?:审查|审核|排查|对比|比对|生成|执行|操作)/i.test(cleanUserText));

    if (isConsultationOrNegation) {
      this.logger.log(
        `User input '${cleanUserText}' classified as guide/inquiry/negation request; routing to conversational_chat.`
      );
      return 'conversational_chat';
    }

    // Check for explicit multi-step compound signals on clean user text
    const hasSequentialKeyword = hasRoutingSignal(cleanUserText, 'sequential', policy);
    const hasProcessingKeyword = hasRoutingSignal(cleanUserText, 'processing', policy);
    const hasGenerationKeyword = hasRoutingSignal(cleanUserText, 'generation', policy);
    const hasArtifactKeyword = hasRoutingSignal(cleanUserText, 'artifact', policy);
    const hasDocumentSourceKeyword =
      hasRoutingSignal(cleanUserText, 'documentSource', policy) ||
      /\[系统上下文：.*(?:附件|文档|文件|pdf|docx?|pptx?)/i.test(text);

    if (hasArtifactKeyword || hasProcessingKeyword || hasGenerationKeyword || hasWorkSlashCommand) {
      this.logger.log(
        `Classified request as 'deterministic_plan' (policy=${policy.version}, sequential=${hasSequentialKeyword}, processing=${hasProcessingKeyword}, generation=${hasGenerationKeyword}, artifact=${hasArtifactKeyword}, documentSource=${hasDocumentSourceKeyword}, workSlash=${hasWorkSlashCommand}, previousResult=${context?.hasPreviousResult === true})`
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
