import { Injectable } from '@nestjs/common';
import {
  RecognizeParamsDTO,
  RecognizeParamsResponseDTO,
  RequiredInputDTO,
} from '../../../interfaces';
import { AvailableSkillDefinition, SkillMatchResult } from '../../react-engine/interfaces';
import { ParamBilingualService } from './param-bilingual.service';
import { ParamContextMergeService } from './param-context-merge.service';
import {
  ParamPolicyService,
  WorkflowParamPolicySnapshot,
  WorkflowParamRequiredMode,
} from './param-policy.service';
import { ParamRequiredInputPresentationService } from './param-required-input-presentation.service';
import { ParamSchemaService } from './param-schema.service';
import { ParamValueService } from './param-value.service';
import { isParamEnumValueAllowed, resolveParamEnumValues } from './param-enum-constraint';

const RECOGNIZED_FIELD_LOW_CONFIDENCE_THRESHOLD = Number(
  process.env.PARAM_FIELD_LOW_CONFIDENCE_THRESHOLD || 0.7
);
const RECOGNITION_RESULT_LOW_CONFIDENCE_THRESHOLD = Number(
  process.env.PARAM_RESULT_LOW_CONFIDENCE_THRESHOLD || 0.45
);

@Injectable()
export class ParamRecognizerService {
  constructor(
    private readonly paramSchemaService: ParamSchemaService,
    private readonly paramContextMergeService: ParamContextMergeService,
    private readonly paramBilingualService: ParamBilingualService,
    private readonly paramPolicyService: ParamPolicyService,
    private readonly paramValueService: ParamValueService,
    private readonly paramRequiredInputPresentationService: ParamRequiredInputPresentationService
  ) {}

  buildRecognizerParamsSchema(
    schema: SkillMatchResult['paramsSchema'],
    context?: Record<string, unknown>
  ): NonNullable<RecognizeParamsDTO['params_schema']> {
    return this.paramSchemaService.buildRecognizerParamsSchema(schema, context);
  }

  buildRecognizerParamsSchemaProperties(
    properties: NonNullable<AvailableSkillDefinition['paramsSchema']>['properties']
  ): NonNullable<RecognizeParamsDTO['params_schema']>['properties'] {
    return this.paramSchemaService.buildRecognizerParamsSchemaProperties(properties);
  }

  resolveRecognizerFieldNamesForContext(
    properties: NonNullable<AvailableSkillDefinition['paramsSchema']>['properties'],
    context?: Record<string, unknown>
  ): string[] {
    return this.paramSchemaService.resolveRecognizerFieldNamesForContext(properties, context);
  }

  resolveRecognizerRequiredFieldsForContext(
    allRequired: string[],
    narrowedFieldNames: string[],
    context?: Record<string, unknown>
  ): string[] {
    return this.paramSchemaService.resolveRecognizerRequiredFieldsForContext(
      allRequired,
      narrowedFieldNames,
      context
    );
  }

  mergeRecognizedWithCollectedContext(
    recognized: RecognizeParamsResponseDTO,
    schema: SkillMatchResult['paramsSchema'],
    context?: Record<string, unknown>
  ): RecognizeParamsResponseDTO {
    return this.paramContextMergeService.mergeRecognizedWithCollectedContext(
      recognized,
      schema,
      context
    );
  }

  extractCollectedParamsFromContext(
    context: Record<string, unknown> | undefined,
    schema: SkillMatchResult['paramsSchema']
  ): Record<string, unknown> {
    return this.paramContextMergeService.extractCollectedParamsFromContext(context, schema);
  }

  identifyBilingualPairs(schema: SkillMatchResult['paramsSchema']): Array<{
    base: string;
    aKey: string;
    bKey: string;
    aLang: 'zh' | 'ja' | 'en';
    bLang: 'zh' | 'ja' | 'en';
  }> {
    return this.paramBilingualService.identifyBilingualPairs(schema);
  }

  async applyBilingualCompletionToRecognized(
    recognized: RecognizeParamsResponseDTO,
    schema: SkillMatchResult['paramsSchema']
  ): Promise<RecognizeParamsResponseDTO> {
    return this.paramBilingualService.applyBilingualCompletionToRecognized(recognized, schema);
  }

  async batchTranslate(
    data: Record<string, string>,
    sourceLang: 'zh' | 'ja' | 'en',
    targetLang: 'zh' | 'ja' | 'en'
  ): Promise<Record<string, string>> {
    return this.paramBilingualService.batchTranslate(data, sourceLang, targetLang);
  }

  buildRequiredInputs(
    matchedSkill: SkillMatchResult,
    recognized: RecognizeParamsResponseDTO
  ): RequiredInputDTO[] {
    const workflowParamPolicies = this.resolveWorkflowParamPolicies(matchedSkill);
    const recognizedParams = recognized.params || {};
    const uncertainFields = new Set(recognized.uncertain_fields || []);
    const fieldConfidences = recognized.field_confidences || {};
    const overallLowConfidence =
      (recognized.confidence || 0) < RECOGNITION_RESULT_LOW_CONFIDENCE_THRESHOLD;
    const allowSchemaStrategyFallback =
      !this.hasWorkflowPolicyStrategySource(workflowParamPolicies);
    const arrayGroupTargetCounts = this.buildArrayGroupTargetCounts(
      matchedSkill.paramsSchema?.properties || {},
      recognizedParams
    );

    return Object.entries(matchedSkill.paramsSchema?.properties || {}).reduce<RequiredInputDTO[]>(
      (acc, [name, schema]) => {
        const schemaMeta = schema as unknown as Record<string, unknown>;
        const workflowPolicy = workflowParamPolicies?.[name];
        if (workflowPolicy?.enabled === false) {
          return acc;
        }
        const requiredMode = this.resolveWorkflowRequiredMode(
          workflowPolicy,
          Boolean(schema.required || matchedSkill.paramsSchema.required?.includes(name)),
          allowSchemaStrategyFallback
        );
        const required = requiredMode === 'always' || requiredMode === 'system_required';
        const rawHasValue = Object.prototype.hasOwnProperty.call(recognizedParams, name);
        const rawValue = rawHasValue ? recognizedParams[name] : undefined;
        const normalizedRawValue = rawHasValue
          ? this.normalizeMeaningfulInputValue(rawValue)
          : undefined;

        // 旧发布版本可能只把枚举写在 description/extractionPrompt 中。
        // 运行时必须确定性校验，不能依赖模型是否遵守提示词。
        const schemaEnum = resolveParamEnumValues(schemaMeta);
        const rawValuePassesEnum = isParamEnumValueAllowed(normalizedRawValue, schemaEnum);
        const effectiveHasValue = rawHasValue && rawValuePassesEnum;
        const effectiveNormalizedRawValue = effectiveHasValue ? normalizedRawValue : undefined;

        const hasValue = this.hasMeaningfulRequiredInputValue(effectiveNormalizedRawValue);

        const normalizedWorkflowDefaultValue =
          !required && workflowPolicy?.defaultValue !== undefined
            ? this.normalizeOptionalDefaultValue(workflowPolicy.defaultValue, schema.type)
            : undefined;
        const normalizedSchemaDefaultValue =
          allowSchemaStrategyFallback && !required && normalizedWorkflowDefaultValue === undefined
            ? this.normalizeOptionalDefaultValue(schema.default, schema.type)
            : undefined;
        const candidateDefaultValue =
          normalizedWorkflowDefaultValue !== undefined
            ? normalizedWorkflowDefaultValue
            : normalizedSchemaDefaultValue;
        const normalizedDefaultValue = isParamEnumValueAllowed(candidateDefaultValue, schemaEnum)
          ? candidateDefaultValue
          : undefined;
        const canUseDefault = !required && !hasValue && normalizedDefaultValue !== undefined;
        const value = hasValue
          ? effectiveNormalizedRawValue
          : canUseDefault
            ? normalizedDefaultValue
            : undefined;

        const arrayGroupKey = this.extractArrayGroupKey(name, schema.type);
        const groupTargetCount = arrayGroupKey ? arrayGroupTargetCounts[arrayGroupKey] || 0 : 0;
        const valueItemCount = this.countMeaningfulRequiredInputItems(value);
        const hasPartialArrayGroupValue = Boolean(
          required &&
          arrayGroupKey &&
          groupTargetCount > 1 &&
          valueItemCount > 0 &&
          valueItemCount < groupTargetCount
        );
        const fieldConfidence =
          typeof fieldConfidences[name] === 'number'
            ? Math.max(0, Math.min(1, fieldConfidences[name] as number))
            : undefined;
        const confirmationThreshold =
          typeof workflowPolicy?.confirmationThreshold === 'number' &&
          Number.isFinite(workflowPolicy.confirmationThreshold)
            ? Math.max(0, Math.min(1, workflowPolicy.confirmationThreshold))
            : allowSchemaStrategyFallback &&
                typeof schemaMeta.confirmationThreshold === 'number' &&
                Number.isFinite(schemaMeta.confirmationThreshold)
              ? Math.max(0, Math.min(1, schemaMeta.confirmationThreshold))
              : RECOGNIZED_FIELD_LOW_CONFIDENCE_THRESHOLD;
        const previewBlocking =
          typeof workflowPolicy?.previewBlocking === 'boolean'
            ? workflowPolicy.previewBlocking
            : allowSchemaStrategyFallback && typeof schemaMeta.previewBlocking === 'boolean'
              ? Boolean(schemaMeta.previewBlocking)
              : undefined;
        const shouldBlockOnConfirmation = required || previewBlocking === true;
        const collectedParams = matchedSkill.collectedParams || {};
        const isCollectedParam =
          Object.prototype.hasOwnProperty.call(collectedParams, name) &&
          this.hasMeaningfulRequiredInputValue(collectedParams[name]);

        const needsConfidenceConfirmation =
          hasValue &&
          shouldBlockOnConfirmation &&
          !isCollectedParam &&
          (uncertainFields.has(name) ||
            (fieldConfidence !== undefined && fieldConfidence < confirmationThreshold) ||
            (fieldConfidence === undefined && required && overallLowConfidence));

        const needsPartialGroupConfirmation =
          hasPartialArrayGroupValue && shouldBlockOnConfirmation;
        const needsConfirmation = needsConfidenceConfirmation || needsPartialGroupConfirmation;
        const isValueMissing = !this.hasMeaningfulRequiredInputValue(value);
        const isBlockingMissing = (required && isValueMissing) || needsConfirmation;
        const missingReason =
          isBlockingMissing && needsConfidenceConfirmation
            ? fieldConfidence === undefined && overallLowConfidence
              ? ('overall_low_confidence' as const)
              : ('low_confidence' as const)
            : isBlockingMissing && needsPartialGroupConfirmation
              ? ('partial_group' as const)
              : isBlockingMissing && required && isValueMissing
                ? ('missing' as const)
                : undefined;
        const description = this.decorateRequiredInputDescription(
          this.decorateArrayGroupCompletenessDescription(
            schema.description,
            valueItemCount,
            groupTargetCount,
            hasPartialArrayGroupValue
          ),
          value,
          missingReason,
          fieldConfidence
        );
        const displayName = this.resolveRequiredInputDisplayName(
          name,
          typeof schemaMeta.displayName === 'string' ? schemaMeta.displayName : undefined,
          schema.description
        );

        acc.push({
          name,
          type: schema.type,
          description,
          ...(displayName ? { display_name: displayName } : {}),
          ...(typeof schemaMeta.groupLabel === 'string'
            ? { group_label: String(schemaMeta.groupLabel) }
            : {}),
          ...this.resolveRenderPath(schemaMeta),
          ...(Array.isArray(schemaEnum) && schemaEnum.length > 0 ? { enum: schemaEnum } : {}),
          ...(typeof workflowPolicy?.templateBinding === 'string'
            ? { template_binding: workflowPolicy.templateBinding.trim() }
            : {}),
          required,
          required_mode: requiredMode,
          value,
          missing: isBlockingMissing,
          source: hasValue
            ? 'user_input'
            : canUseDefault && value !== undefined
              ? normalizedWorkflowDefaultValue !== undefined
                ? 'workflow_default'
                : 'default'
              : 'unresolved',
          ...(Array.isArray(workflowPolicy?.valueSourcePriority) &&
          workflowPolicy.valueSourcePriority.length > 0
            ? { source_priority: workflowPolicy.valueSourcePriority }
            : {}),
          confidence: fieldConfidence,
          needs_confirmation: needsConfirmation,
          confirmation_threshold: confirmationThreshold,
          ...(typeof previewBlocking === 'boolean' ? { preview_blocking: previewBlocking } : {}),
          ...(missingReason ? { missing_reason: missingReason } : {}),
        });
        return acc;
      },
      []
    );
  }

  private hasMeaningfulRequiredInputValue(value: unknown): boolean {
    return this.paramValueService.hasMeaningfulRequiredInputValue(value);
  }

  private normalizeMeaningfulInputValue(value: unknown): unknown {
    return this.paramValueService.normalizeMeaningfulInputValue(value);
  }

  private resolveWorkflowParamPolicies(
    matchedSkill: SkillMatchResult
  ): Record<string, WorkflowParamPolicySnapshot> | undefined {
    return this.paramPolicyService.resolveWorkflowParamPolicies(matchedSkill);
  }

  private resolveWorkflowRequiredMode(
    workflowPolicy: WorkflowParamPolicySnapshot | undefined,
    schemaRequired: boolean,
    allowSchemaStrategyFallback: boolean
  ): WorkflowParamRequiredMode {
    return this.paramPolicyService.resolveWorkflowRequiredMode(
      workflowPolicy,
      schemaRequired,
      allowSchemaStrategyFallback
    );
  }

  private hasWorkflowPolicyStrategySource(
    workflowParamPolicies?: Record<string, WorkflowParamPolicySnapshot>
  ): boolean {
    return this.paramPolicyService.hasWorkflowPolicyStrategySource(workflowParamPolicies);
  }

  private buildArrayGroupTargetCounts(
    properties: Record<string, { type: string }>,
    recognizedParams: Record<string, unknown>
  ): Record<string, number> {
    return this.paramValueService.buildArrayGroupTargetCounts(properties, recognizedParams);
  }

  private countMeaningfulRequiredInputItems(value: unknown): number {
    return this.paramValueService.countMeaningfulRequiredInputItems(value);
  }

  private normalizeOptionalDefaultValue(value: unknown, expectedType?: string): unknown {
    return this.paramValueService.normalizeOptionalDefaultValue(value, expectedType);
  }

  private decorateArrayGroupCompletenessDescription(
    description: string | undefined,
    currentCount: number,
    targetCount: number,
    incomplete: boolean
  ): string | undefined {
    return this.paramRequiredInputPresentationService.decorateArrayGroupCompletenessDescription(
      description,
      currentCount,
      targetCount,
      incomplete
    );
  }

  private resolveRequiredInputDisplayName(
    name: string,
    displayName?: string,
    description?: string
  ): string | undefined {
    return this.paramRequiredInputPresentationService.resolveRequiredInputDisplayName(
      name,
      displayName,
      description
    );
  }

  private decorateRequiredInputDescription(
    description: string | undefined,
    value: unknown,
    missingReason: RequiredInputDTO['missing_reason'],
    confidence?: number
  ): string | undefined {
    return this.paramRequiredInputPresentationService.decorateRequiredInputDescription(
      description,
      value,
      missingReason,
      confidence
    );
  }

  private summarizeInputValue(value: unknown): string {
    return this.paramRequiredInputPresentationService.summarizeInputValue(value);
  }

  private resolveRenderPath(
    schemaMeta: Record<string, unknown>
  ): Partial<Pick<RequiredInputDTO, 'render_path'>> {
    return this.paramRequiredInputPresentationService.resolveRenderPath(schemaMeta);
  }

  private extractArrayGroupKey(name: string, type?: string): string | undefined {
    return this.paramValueService.extractArrayGroupKey(name, type);
  }
}
