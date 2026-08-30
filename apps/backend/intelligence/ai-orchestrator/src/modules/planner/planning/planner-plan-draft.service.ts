import { Injectable } from '@nestjs/common';
import { LLMUsage, PlanDraftDTO, RecognizeParamsResponseDTO } from '../../../interfaces';
import { buildDocumentGuideContext } from '../../../common/document-guide';
import type { SkillMatchResult } from '../../react-engine/interfaces';
import { RecognizerService } from '../../recognizer/recognizer.service';
import type { PlannerCompletePlanInput } from '../facade';
import { PlanGeneratorService, PlanSemanticService } from '../plan';
import { DeterministicParamResolverService, ParamRecognizerService } from '../params';
import { projectPreviousResultIntoRecognition } from '../params/previous-result-continuation';

@Injectable()
export class PlannerPlanDraftService {
  constructor(
    private readonly recognizerService: RecognizerService,
    private readonly planSemanticService: PlanSemanticService,
    private readonly planGeneratorService: PlanGeneratorService,
    private readonly paramRecognizerService: ParamRecognizerService,
    private readonly deterministicParamResolverService: DeterministicParamResolverService
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
    const recognizerContext = this.buildRecognizerContext(input.context);
    const contractResolved = this.deterministicParamResolverService.resolve(
      objective,
      matchedSkill.paramsSchema
    );
    const deterministicBase: RecognizeParamsResponseDTO = {
      params: {
        ...(contractResolved.params || {}),
        ...(matchedSkill.collectedParams || {}),
      },
      confidence: 1,
      field_confidences: Object.fromEntries(
        Object.keys({
          ...(contractResolved.params || {}),
          ...(matchedSkill.collectedParams || {}),
        }).map((fieldName) => [fieldName, 1])
      ),
      uncertain_fields: [],
      debug: {
        notes: ['planner 已先应用确定性参数来源', ...(contractResolved.debug?.notes || [])],
      },
    };
    const mergedBase = this.paramRecognizerService.mergeRecognizedWithCollectedContext(
      deterministicBase,
      matchedSkill.paramsSchema,
      input.context
    );
    const continuationProjection = projectPreviousResultIntoRecognition(
      mergedBase,
      matchedSkill.paramsSchema,
      input.context
    );
    const recognitionFields = this.resolveRecognitionFields(
      matchedSkill,
      Object.keys(contractResolved.params || {}),
      continuationProjection.projectedFields,
      input.context
    );
    const recognized =
      recognitionFields.length > 0
        ? await this.recognizeUnresolvedFields({
            objective,
            matchedSkill,
            modelId: input.modelId,
            isDocumentSkill,
            recognizerContext,
            recognitionFields,
            deterministic: continuationProjection.recognized,
          })
        : {
            ...continuationProjection.recognized,
            debug: {
              ...continuationProjection.recognized.debug,
              notes: [
                ...(continuationProjection.recognized.debug?.notes || []),
                '所有执行参数已由上下文、上一执行结果或默认值确定，已跳过 LLM 参数识别',
              ],
            },
          };
    const enrichedRecognized =
      await this.paramRecognizerService.applyBilingualCompletionToRecognized(
        recognized,
        matchedSkill.paramsSchema
      );
    const totalUsage = this.sumUsage(matchedSkill.usage, enrichedRecognized.usage);
    const continuationFieldSet = new Set(continuationProjection.projectedFields);
    const requiredInputs = this.paramRecognizerService
      .buildRequiredInputs(matchedSkill, enrichedRecognized)
      .map((requiredInput) =>
        continuationFieldSet.has(requiredInput.name)
          ? { ...requiredInput, source: 'external' as const, confidence: 1 }
          : requiredInput
      );
    const semanticContext = this.planSemanticService.buildDocumentSemanticContext({
      matchedSkill,
      requiredInputs,
    });

    const planDraft = this.planGeneratorService.buildSkillPlan({
      objective,
      matchedSkill,
      requiredInputs: semanticContext.requiredInputs,
      semantic: semanticContext.semantic,
      usage: totalUsage,
      semanticDebug: semanticContext.debug,
      llmCalls: [...(matchedSkill.debug?.llmCalls || []), ...(recognized.debug?.llmCalls || [])],
      notes: [...(matchedSkill.debug?.notes || []), ...(recognized.debug?.notes || [])],
    });
    if (continuationProjection.projectedFields.length === 0) {
      return planDraft;
    }

    return {
      ...planDraft,
      metadata: {
        ...(planDraft.metadata || {}),
        previous_result_continuation: {
          applied: true,
          sourceExecutionId: continuationProjection.sourceExecutionId,
          projectedFields: continuationProjection.projectedFields,
        },
      },
    };
  }

  private resolveRecognitionFields(
    matchedSkill: SkillMatchResult,
    contractResolvedFields: string[],
    projectedPreviousResultFields: string[],
    context?: Record<string, unknown>
  ): string[] {
    if (context?.mode === 'waiting_input_resume') {
      return this.paramRecognizerService.resolveRecognizerFieldNamesForContext(
        matchedSkill.paramsSchema?.properties || {},
        context
      );
    }

    const schemaFields = Object.keys(matchedSkill.paramsSchema?.properties || {});
    const authoritativeFieldSet = new Set([
      ...contractResolvedFields,
      ...projectedPreviousResultFields,
    ]);
    const fullyResolvedByAuthoritativeSources =
      schemaFields.length > 0 &&
      schemaFields.every((fieldName) => authoritativeFieldSet.has(fieldName));

    // Only declared contract aliases and explicit previous-result projections are
    // authoritative enough to suppress semantic extraction. Collected/default
    // values must not hide optional fields present in the current user request.
    return fullyResolvedByAuthoritativeSources ? [] : schemaFields;
  }

  private async recognizeUnresolvedFields(input: {
    objective: string;
    matchedSkill: SkillMatchResult;
    modelId?: string;
    isDocumentSkill: boolean;
    recognizerContext?: Record<string, unknown>;
    recognitionFields: string[];
    deterministic: RecognizeParamsResponseDTO;
  }): Promise<RecognizeParamsResponseDTO> {
    const fieldSet = new Set(input.recognitionFields);
    const narrowedProperties = Object.fromEntries(
      Object.entries(input.matchedSkill.paramsSchema.properties || {}).filter(([name]) =>
        fieldSet.has(name)
      )
    );
    const resumeSchema =
      input.recognizerContext?.mode === 'waiting_input_resume'
        ? this.paramRecognizerService.buildRecognizerParamsSchema(
            input.matchedSkill.paramsSchema,
            input.recognizerContext
          )
        : undefined;
    const aiRecognized = await this.recognizerService.recognizeParams({
      template_id: input.matchedSkill.skillId,
      user_input: input.objective,
      modelId: input.modelId,
      fallbackMode: 'none',
      postProcessMode: input.isDocumentSkill ? 'semantic_augmentation' : 'schema_only',
      context: input.recognizerContext,
      guide_context: buildDocumentGuideContext({
        enabled: input.isDocumentSkill,
        skillName: input.matchedSkill.skillName,
        description: input.matchedSkill.matchReason || input.matchedSkill.skillName,
        goal: input.matchedSkill.goal,
        expectedResult: input.matchedSkill.expectedResult,
        outputParams: input.matchedSkill.outputParams,
        paramsSchema: input.matchedSkill.paramsSchema,
        runtimeMetadata: input.matchedSkill.apiEndpoints?.runtimeMetadata,
      }),
      params_schema: {
        properties:
          resumeSchema?.properties ||
          this.paramRecognizerService.buildRecognizerParamsSchemaProperties(narrowedProperties),
        required:
          resumeSchema?.required ||
          (input.matchedSkill.paramsSchema.required || []).filter((name) => fieldSet.has(name)),
      },
    });

    // During waiting_input resume, the user's latest answer is authoritative for
    // the fields the previous turn explicitly asked them to supply. Without this
    // final overlay, stale `already_collected` values win below and can downgrade
    // newly recognized arrays/objects back to the lossy strings captured by the
    // earlier fallback extractor.
    const preferredRecognizedFields = new Set(
      Array.isArray(input.recognizerContext?.missing_inputs)
        ? input.recognizerContext.missing_inputs.filter(
            (fieldName): fieldName is string => typeof fieldName === 'string'
          )
        : []
    );
    const preferredRecognizedParams = Object.fromEntries(
      [...preferredRecognizedFields]
        .filter((fieldName) =>
          Object.prototype.hasOwnProperty.call(aiRecognized.params || {}, fieldName)
        )
        .map((fieldName) => [fieldName, aiRecognized.params?.[fieldName]])
    );
    const preferredFieldConfidences = Object.fromEntries(
      [...preferredRecognizedFields]
        .filter((fieldName) =>
          Object.prototype.hasOwnProperty.call(aiRecognized.field_confidences || {}, fieldName)
        )
        .map((fieldName) => [fieldName, aiRecognized.field_confidences?.[fieldName] as number])
    );

    return {
      ...aiRecognized,
      params: {
        ...(aiRecognized.params || {}),
        ...(input.deterministic.params || {}),
        ...preferredRecognizedParams,
      },
      field_confidences: {
        ...(aiRecognized.field_confidences || {}),
        ...(input.deterministic.field_confidences || {}),
        ...preferredFieldConfidences,
      },
      uncertain_fields: (aiRecognized.uncertain_fields || []).filter(
        (fieldName) =>
          preferredRecognizedFields.has(fieldName) ||
          !Object.prototype.hasOwnProperty.call(input.deterministic.params, fieldName)
      ),
      debug: {
        llmCalls: aiRecognized.debug?.llmCalls,
        notes: [
          ...(input.deterministic.debug?.notes || []),
          ...(aiRecognized.debug?.notes || []),
          `LLM 参数识别仅披露未解析字段: ${input.recognitionFields.join(', ')}`,
          ...(Object.keys(preferredRecognizedParams).length > 0
            ? [
                `waiting_input 最新回答已覆盖待补充字段: ${Object.keys(preferredRecognizedParams).join(', ')}`,
              ]
            : []),
        ],
      },
    };
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

  private buildRecognizerContext(
    context?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (context?.mode !== 'single_step_continuation') return context;
    return Object.fromEntries(
      Object.entries(context).filter(([key]) => key !== 'previous_result' && key !== 'history')
    );
  }
}
