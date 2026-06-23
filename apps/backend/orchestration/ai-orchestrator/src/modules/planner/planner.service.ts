import { Injectable } from '@nestjs/common';
import {
  GeneratePlanDTO,
  PlanDraftDTO,
  PlanSemanticDTO,
  RequiredInputDTO,
  LLMUsage,
} from '../../interfaces';
import { buildDocumentGuideContext } from '../../common/document-guide';
import { RecognizerService } from '../recognizer/recognizer.service';
import { PlanGeneratorService, PlanSemanticService } from './plan';
import { ParamRecognizerService } from './params';
import { AvailableSkillDefinition, SkillMatchResult } from '../react-engine/interfaces';
import { SkillCacheService, SkillMatcherService } from './skill';

export interface PlannerMatchPhaseResult {
  objective: string;
  matchedSkill: SkillMatchResult | null;
  hasVisibleSkills: boolean;
}

@Injectable()
export class PlannerService {
  constructor(
    private readonly recognizerService: RecognizerService,
    private readonly skillCacheService: SkillCacheService,
    private readonly skillMatcherService: SkillMatcherService,
    private readonly planSemanticService: PlanSemanticService,
    private readonly planGeneratorService: PlanGeneratorService,
    private readonly paramRecognizerService: ParamRecognizerService
  ) {}

  async generatePlan(input: {
    request: GeneratePlanDTO;
    userId?: string;
    authToken?: string;
    traceId?: string;
  }): Promise<PlanDraftDTO> {
    const matchPhase = await this.matchSkillPhase(input);
    return this.completePlanFromMatchPhase({
      ...input,
      matchPhase,
    });
  }

  async matchSkillPhase(input: {
    request: GeneratePlanDTO;
    userId?: string;
    authToken?: string;
    traceId?: string;
  }): Promise<PlannerMatchPhaseResult> {
    const objective = input.request.user_input.trim();
    const targetSkillId =
      typeof input.request.context?.target_skill_id === 'string'
        ? input.request.context.target_skill_id.trim()
        : '';
    const availableSkills = await this.loadAvailableSkills(
      input.authToken,
      input.traceId,
      targetSkillId || undefined
    );
    const matchedSkill = await this.matchSkill(
      objective,
      input.userId || input.request.user_id,
      input.authToken,
      input.traceId,
      availableSkills,
      input.request.context
    );

    return {
      objective,
      matchedSkill,
      hasVisibleSkills: availableSkills.length > 0,
    };
  }

  async completePlanFromMatchPhase(input: {
    request: GeneratePlanDTO;
    userId?: string;
    authToken?: string;
    traceId?: string;
    matchPhase: PlannerMatchPhaseResult;
  }): Promise<PlanDraftDTO> {
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
    const isDocumentSkill = this.isDocumentTask(matchedSkill);
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

    // 累积消耗
    const totalUsage = this.sumUsage(matchedSkill.usage, enrichedRecognized.usage);
    const semanticContext = this.buildDocumentSemanticContext(
      matchedSkill,
      this.paramRecognizerService.buildRequiredInputs(matchedSkill, enrichedRecognized)
    );
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

  private async loadAvailableSkills(
    authToken?: string,
    traceId?: string,
    targetSkillId?: string
  ): Promise<AvailableSkillDefinition[]> {
    return this.skillCacheService.loadAvailableSkills(authToken, traceId, targetSkillId);
  }

  private async matchSkill(
    userInput: string,
    userId: string | undefined,
    authToken: string | undefined,
    traceId: string | undefined,
    availableSkills: AvailableSkillDefinition[],
    context?: Record<string, unknown>
  ): Promise<SkillMatchResult | null> {
    return this.skillMatcherService.matchSkill({
      userInput,
      userId,
      authToken,
      traceId,
      availableSkills,
      context,
    });
  }

  private sumUsage(...usages: (LLMUsage | undefined)[]): LLMUsage | undefined {
    const validUsages = usages.filter((u): u is LLMUsage => !!u);
    if (validUsages.length === 0) return undefined;

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

  private buildDocumentSemanticContext(
    matchedSkill: SkillMatchResult,
    requiredInputs: RequiredInputDTO[]
  ): {
    requiredInputs: RequiredInputDTO[];
    semantic?: PlanSemanticDTO;
    debug: Record<string, unknown>;
  } {
    return this.planSemanticService.buildDocumentSemanticContext({
      matchedSkill,
      requiredInputs,
    });
  }

  private isDocumentTask(matchedSkill: SkillMatchResult): boolean {
    return this.planSemanticService.isDocumentTask(matchedSkill);
  }
}
