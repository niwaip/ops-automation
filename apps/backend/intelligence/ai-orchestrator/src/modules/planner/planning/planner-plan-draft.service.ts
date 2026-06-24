import { Injectable } from '@nestjs/common';
import { LLMUsage, PlanDraftDTO } from '../../../interfaces';
import { buildDocumentGuideContext } from '../../../common/document-guide';
import type { SkillMatchResult } from '../../react-engine/interfaces';
import { RecognizerService } from '../../recognizer/recognizer.service';
import type { PlannerCompletePlanInput } from '../facade';
import { PlanGeneratorService, PlanSemanticService } from '../plan';
import { ParamRecognizerService } from '../params';

@Injectable()
export class PlannerPlanDraftService {
  constructor(
    private readonly recognizerService: RecognizerService,
    private readonly planSemanticService: PlanSemanticService,
    private readonly planGeneratorService: PlanGeneratorService,
    private readonly paramRecognizerService: ParamRecognizerService
  ) {}

  async completePlanFromMatchPhase(input: PlannerCompletePlanInput): Promise<PlanDraftDTO> {
    const { objective, matchedSkill, hasVisibleSkills } = input.matchPhase;

    if (!matchedSkill) {
      return this.planGeneratorService.buildFallbackPlan(objective, hasVisibleSkills);
    }

    return this.buildSkillPlan({
      objective,
      matchedSkill,
      modelId: input.request.modelId,
      context: input.request.context,
    });
  }

  private async buildSkillPlan(input: {
    objective: string;
    matchedSkill: SkillMatchResult;
    modelId?: string;
    context?: Record<string, unknown>;
  }): Promise<PlanDraftDTO> {
    const { objective, matchedSkill } = input;
    const isDocumentSkill = this.planSemanticService.isDocumentTask(matchedSkill);
    const recognized = await this.recognizerService.recognizeParams({
      template_id: matchedSkill.skillId,
      user_input: objective,
      modelId: input.modelId,
      context: input.context,
      guide_context: buildDocumentGuideContext({
        enabled: isDocumentSkill,
        skillName: matchedSkill.skillName,
        description: matchedSkill.matchReason || matchedSkill.skillName,
        goal: matchedSkill.goal,
        expectedResult: matchedSkill.expectedResult,
        outputParams: matchedSkill.outputParams,
        paramsSchema: matchedSkill.paramsSchema,
        runtimeMetadata: matchedSkill.apiEndpoints?.runtimeMetadata,
      }),
      params_schema: this.paramRecognizerService.buildRecognizerParamsSchema(
        matchedSkill.paramsSchema,
        input.context
      ),
    });
    const mergedRecognized = this.paramRecognizerService.mergeRecognizedWithCollectedContext(
      recognized,
      matchedSkill.paramsSchema,
      input.context
    );
    const enrichedRecognized = await this.paramRecognizerService.applyBilingualCompletionToRecognized(
      mergedRecognized,
      matchedSkill.paramsSchema
    );
    const totalUsage = this.sumUsage(matchedSkill.usage, enrichedRecognized.usage);
    const semanticContext = this.planSemanticService.buildDocumentSemanticContext({
      matchedSkill,
      requiredInputs: this.paramRecognizerService.buildRequiredInputs(
        matchedSkill,
        enrichedRecognized
      ),
    });

    return this.planGeneratorService.buildSkillPlan({
      objective,
      matchedSkill,
      requiredInputs: semanticContext.requiredInputs,
      semantic: semanticContext.semantic,
      usage: totalUsage,
      semanticDebug: semanticContext.debug,
      llmCalls: [...(matchedSkill.debug?.llmCalls || []), ...(recognized.debug?.llmCalls || [])],
      notes: [...(matchedSkill.debug?.notes || []), ...(mergedRecognized.debug?.notes || [])],
    });
  }

  private sumUsage(...usages: Array<LLMUsage | undefined>): LLMUsage | undefined {
    const validUsages = usages.filter((usage): usage is LLMUsage => !!usage);
    if (validUsages.length === 0) {
      return undefined;
    }

    const result: LLMUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    for (const usage of validUsages) {
      result.prompt_tokens += usage.prompt_tokens;
      result.completion_tokens += usage.completion_tokens;
      result.total_tokens += usage.total_tokens;
      if (usage.completion_tokens_details?.reasoning_tokens) {
        if (!result.completion_tokens_details) {
          result.completion_tokens_details = { reasoning_tokens: 0 };
        }
        result.completion_tokens_details.reasoning_tokens =
          (result.completion_tokens_details.reasoning_tokens || 0) +
          usage.completion_tokens_details.reasoning_tokens;
      }
    }

    return result;
  }
}
