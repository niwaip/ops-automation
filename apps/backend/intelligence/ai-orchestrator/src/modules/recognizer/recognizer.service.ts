import { Injectable, Logger } from '@nestjs/common';
import {
  RecognizeParamsDTO,
  RecognizeParamsResponseDTO,
  PromptDebugLLMCall,
} from '../../interfaces';
import { isPlaceholderTextValue } from '../../common/placeholder-value';
import { ModelService } from '../model/model.service';
import { inferValueBySemanticSignal, normalizeSemanticRole } from './semantic-role.registry';
import { LLMClient } from '../../client/llm-client';
import { buildPromptAssembly } from './prompt-assembly';
import { extractUrlFromInput } from './recognizer-url-extractor';

import {
  inferFieldValueFromExplicitPatterns,
  markRequiredFields,
  escapeRegExp,
  resolveExpectedValueType,
  buildSignalText,
  normalizeDateValue,
  extractBatchValue,
  extractLocationValue,
  extractAcceptanceTypeValue,
  extractDateByKeywords,
} from './recognizer-pattern-matcher';
/**
 * Template schema interface for parameter recognition
 */
interface TemplateSchema {
  template_id: string;
  name: string;
  params_schema: {
    properties: Record<string, ParamSchemaProperty>;
    required?: string[];
  };
}

interface ParamSchemaProperty {
  type: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: Array<string | number>;
  exampleValue?: unknown;
  extractionPrompt?: string;
  semanticRole?: string;
  extractionHints?: string[];
  displayName?: string;
}

/**
 * Param Recognizer Service
 * Recognizes and extracts parameters from user input based on template schema
 * Returns confidence score for the recognition result
 */
@Injectable()
export class RecognizerService {
  private readonly logger = new Logger(RecognizerService.name);
  private templates: Map<string, TemplateSchema> = new Map();

  constructor(private readonly modelService: ModelService) {}

  /**
   * Set the default AI client for parameter recognition
   */
  setDefaultClient(_client: LLMClient): void {
    // Legacy method - no longer needed as we use ModelService
    this.logger.warn('setDefaultClient is deprecated, using ModelService instead');
  }

  /**
   * Resolve the runtime model for parameter recognition.
   * Prefer the caller-selected model, then fall back to the system default.
   */
  private async resolveModelRuntime(
    requestedModelId?: string
  ): Promise<{ modelId: string; client: LLMClient } | null> {
    if (requestedModelId) {
      const resolvedModelId = await this.modelService.resolveModelId(requestedModelId);
      if (resolvedModelId) {
        const client = this.modelService.getClient(resolvedModelId);
        if (client) {
          return {
            modelId: resolvedModelId,
            client,
          };
        }
      }
      this.logger.warn(
        `Requested recognizer model ${requestedModelId} is unavailable, falling back to default model`
      );
    }

    const defaultModel = this.modelService.getDefaultModel();
    if (!defaultModel) {
      return null;
    }

    const client = this.modelService.getClient(defaultModel.id);
    if (!client) {
      return null;
    }

    return {
      modelId: defaultModel.id,
      client,
    };
  }

  /**
   * Register a template schema for parameter recognition
   */
  registerTemplate(template: TemplateSchema): void {
    this.templates.set(template.template_id, template);
  }

  /**
   * Get registered template
   */
  getTemplate(templateId: string): TemplateSchema | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Recognize parameters from user input
   * Uses AI to extract parameters matching the template schema
   */
  async recognizeParams(dto: RecognizeParamsDTO): Promise<RecognizeParamsResponseDTO> {
    // 优先使用请求中传入的 params_schema
    let properties: Record<string, ParamSchemaProperty> = {};
    let templateName = dto.template_id;

    if (dto.params_schema?.properties) {
      properties = dto.params_schema.properties;
    } else {
      // 如果没有传入 params_schema，尝试从注册的模版中获取
      const template = this.templates.get(dto.template_id);
      if (!template) {
        // Return empty params with low confidence if template not found
        return {
          params: {},
          confidence: 0,
        };
      }
      properties = template.params_schema.properties;
      templateName = template.name;
    }

    // 如果没有可用的参数 schema，返回空结果
    if (Object.keys(properties).length === 0) {
      return {
        params: {},
        confidence: 0,
      };
    }

    const propertiesWithRequired = this.markRequiredFields(properties, dto.params_schema?.required);
    const promptAssembly = buildPromptAssembly({
      templateName,
      properties: propertiesWithRequired,
      dto,
      guideContext: dto.guide_context,
      normalizePromptDefaultValue: (value) => this.normalizePromptDefaultValue(value),
    });

    // Prefer the caller-selected model so planner/debug traces match the chat UI choice.
    const runtime = await this.resolveModelRuntime(dto.modelId);
    if (!runtime) {
      if (dto.fallbackMode === 'none') {
        this.logger.warn('No AI client available and deterministic fallback is disabled');
        return {
          params: {},
          confidence: 0,
          debug: { notes: ['recognizer 未找到可用模型，且调用方禁止固定规则回退。'] },
        };
      }
      this.logger.warn('No AI client available, using basic pattern matching');
      return {
        ...this.basicPatternMatching(dto.user_input, properties),
        debug: {
          notes: ['recognizer 未找到可用模型，已回退到基础模式匹配。'],
        },
      };
    }

    try {
      const response = await runtime.client.chatCompletion({
        assembly: promptAssembly,
        responseFormat: 'json_object',
        promptCaching: this.modelService.getPromptCachingConfig(runtime.modelId),
      });
      const llmCalls: PromptDebugLLMCall[] = [
        {
          stage: 'recognizer',
          label: '参数识别',
          modelId: runtime.modelId,
          requestMessages: [
            {
              role: 'system',
              content: [promptAssembly.staticSystem, promptAssembly.skillContext]
                .filter(Boolean)
                .join('\n\n'),
            },
            {
              role: 'user',
              content: promptAssembly.dynamicUser,
            },
          ],
          responseText: response.content,
        },
      ];
      const result = this.parseAIResponse(
        response.content,
        propertiesWithRequired,
        dto.user_input,
        dto.postProcessMode !== 'schema_only'
      );
      return {
        ...result,
        usage: response.usage,
        debug: {
          llmCalls,
        },
      };
    } catch (error) {
      this.logger.error(`AI call failed: ${error}`);
      if (dto.fallbackMode === 'none') {
        return {
          params: {},
          confidence: 0,
          debug: {
            notes: [
              `recognizer 模型调用失败，且调用方禁止固定规则回退: ${error instanceof Error ? error.message : String(error)}`,
            ],
          },
        };
      }
      // Fallback to basic pattern matching on AI failures
      return {
        ...this.basicPatternMatching(dto.user_input, propertiesWithRequired),
        debug: {
          notes: [
            `recognizer 模型调用失败，已回退到基础模式匹配: ${error instanceof Error ? error.message : String(error)}`,
          ],
        },
      };
    }
  }

  private normalizePromptDefaultValue(value: unknown): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0 ? value : undefined;
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value : undefined;
    }
    if (typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).length > 0 ? value : undefined;
    }
    return value;
  }

  /**
   * Parse AI response and validate against schema
   */
  private parseAIResponse(
    response: string,
    properties: Record<string, ParamSchemaProperty>,
    userInput: string,
    enableSemanticAugmentation: boolean
  ): RecognizeParamsResponseDTO {
    try {
      const jsonCandidate = this.extractJsonCandidate(response);
      if (!jsonCandidate) {
        return this.buildPostProcessedEmptyResponse(
          properties,
          userInput,
          enableSemanticAugmentation
        );
      }

      const parsed = JSON.parse(jsonCandidate);
      const params = parsed.params || parsed;
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
      const normalizedParams = this.normalizeSchemaCompatibleParams(params, properties);
      const parsedFieldConfidences = this.normalizeFieldConfidences(
        parsed.field_confidences,
        properties
      );
      const uncertainFields = this.normalizeUncertainFields(parsed.uncertain_fields, properties);

      // Validate and filter params against schema
      const validatedParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(normalizedParams)) {
        if (properties[key]) {
          // Type validation
          const expectedType = properties[key].type;
          if (this.validateRecognizedValue(key, value, expectedType, properties[key])) {
            validatedParams[key] = value;
          }
        }
      }

      const postProcessed = this.postProcessRecognizedParams(
        validatedParams,
        properties,
        userInput,
        enableSemanticAugmentation
      );

      return {
        params: postProcessed.params,
        confidence: Math.max(0, Math.min(1, confidence)),
        field_confidences: this.completeFieldConfidences(
          postProcessed.params,
          parsedFieldConfidences,
          postProcessed.supplementedFieldSources
        ),
        uncertain_fields: uncertainFields.filter((field) =>
          this.hasRecognizedFieldValue(field, postProcessed.params[field])
        ),
      };
    } catch {
      return this.buildPostProcessedEmptyResponse(
        properties,
        userInput,
        enableSemanticAugmentation
      );
    }
  }

  private normalizeSchemaCompatibleParams(
    value: unknown,
    properties: Record<string, ParamSchemaProperty>
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const directContainerValues = Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((acc, [key, rawValue]) => {
      const expectedType = String(properties[key]?.type || '').toLowerCase();
      if (expectedType === 'array' && Array.isArray(rawValue)) {
        acc[key] = rawValue;
      } else if (
        expectedType === 'object' &&
        this.isPlainRecord(rawValue)
      ) {
        acc[key] = rawValue;
      }
      return acc;
    }, {});
    const flattened = this.flattenNestedResponse(value);
    const flattenedValues = Object.entries(flattened).reduce<Record<string, unknown>>(
      (acc, [key, rawValue]) => {
      const resolvedKey = this.resolveSchemaPathKey(key, properties);
      if (!resolvedKey) {
        return acc;
      }
      acc[resolvedKey] = rawValue;
      return acc;
      },
      {}
    );

    // A schema may intentionally expose one array/object parameter (for example
    // PDF content blocks). Preserve that container verbatim; flattening is only
    // for schemas that expose dotted or `[]` leaf fields.
    return { ...flattenedValues, ...directContainerValues };
  }

  private flattenNestedResponse(
    value: unknown,
    prefix = '',
    acc: Record<string, unknown> = {}
  ): Record<string, unknown> {
    if (value === null || value === undefined) {
      return acc;
    }

    if (Array.isArray(value)) {
      if (!prefix) {
        return acc;
      }

      const objectItems = value.filter((item): item is Record<string, unknown> =>
        this.isPlainRecord(item)
      );
      if (objectItems.length === value.length) {
        for (const item of objectItems) {
          this.flattenNestedResponse(item, `${prefix}[]`, acc);
        }
        return acc;
      }

      this.mergeFlattenedValue(acc, prefix, value);
      return acc;
    }

    if (this.isPlainRecord(value)) {
      for (const [key, nestedValue] of Object.entries(value)) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        this.flattenNestedResponse(nestedValue, nextPrefix, acc);
      }
      return acc;
    }

    if (prefix) {
      this.mergeFlattenedValue(acc, prefix, value);
    }

    return acc;
  }

  private mergeFlattenedValue(acc: Record<string, unknown>, key: string, value: unknown): void {
    if (value === null || value === undefined) {
      return;
    }

    if (key.includes('[]')) {
      const nextValues = Array.isArray(value) ? value : [value];
      const normalizedValues = nextValues.filter((item) => item !== null && item !== undefined);
      if (normalizedValues.length === 0) {
        return;
      }
      const existing = acc[key];
      if (Array.isArray(existing)) {
        acc[key] = [...existing, ...normalizedValues];
        return;
      }
      if (existing !== undefined) {
        acc[key] = [existing, ...normalizedValues];
        return;
      }
      acc[key] = normalizedValues;
      return;
    }

    if (acc[key] === undefined) {
      acc[key] = value;
    }
  }

  private resolveSchemaPathKey(
    candidate: string,
    properties: Record<string, ParamSchemaProperty>
  ): string | undefined {
    const normalizedCandidates = [
      candidate,
      candidate.replace(/\[(\d+)\]/g, '[]'),
      candidate.replace(/\.(\d+)(?=\.|$)/g, '[]'),
    ];

    return normalizedCandidates.find(
      (item, index) => normalizedCandidates.indexOf(item) === index && Boolean(properties[item])
    );
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private extractJsonCandidate(response: string): string | undefined {
    const fencedMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]?.trim()) {
      const fenced = fencedMatch[1].trim();
      try {
        JSON.parse(fenced);
        return fenced;
      } catch {
        // Continue with balanced-object scanning. Some providers include
        // reasoning or multiple objects around an otherwise valid JSON body.
      }
    }

    const candidates: string[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < response.length; index += 1) {
      const char = response[index]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') {
        if (depth === 0) start = index;
        depth += 1;
        continue;
      }
      if (char === '}' && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const candidate = response.slice(start, index + 1);
          try {
            JSON.parse(candidate);
            candidates.push(candidate);
          } catch {
            // Ignore malformed candidates and continue scanning later objects.
          }
          start = -1;
        }
      }
    }

    return candidates.at(-1);
  }

  private buildPostProcessedEmptyResponse(
    properties: Record<string, ParamSchemaProperty>,
    userInput: string,
    enableSemanticAugmentation = true
  ): RecognizeParamsResponseDTO {
    const postProcessed = this.postProcessRecognizedParams(
      {},
      properties,
      userInput,
      enableSemanticAugmentation
    );
    return {
      params: postProcessed.params,
      confidence: 0,
      field_confidences: this.completeFieldConfidences(
        postProcessed.params,
        {},
        postProcessed.supplementedFieldSources
      ),
      uncertain_fields: [],
    };
  }

  /**
   * Basic pattern matching fallback when AI is unavailable
   */
  private basicPatternMatching(
    input: string,
    properties: Record<string, ParamSchemaProperty>
  ): RecognizeParamsResponseDTO {
    const params: Record<string, unknown> = {};
    const fieldConfidences: Record<string, number> = {};
    let matchCount = 0;

    for (const [key, schema] of Object.entries(properties)) {
      const escapedKey = this.escapeRegExp(key);
      switch (schema.type) {
        case 'string': {
          // Look for quoted strings or common patterns
          const stringMatch = input.match(
            new RegExp(`${escapedKey}[\\s]*[=:][\\s]*["']?([^"'\n,]+)["']?`, 'i')
          );
          if (stringMatch && stringMatch[1]) {
            params[key] = stringMatch[1].trim();
            fieldConfidences[key] = 0.72;
            matchCount++;
          }
          break;
        }
        case 'number': {
          const numberMatch = input.match(
            new RegExp(`${escapedKey}[\\s]*[=:][\\s]*(\\d+(\\.\\d+)?)`, 'i')
          );
          if (numberMatch && numberMatch[1]) {
            params[key] = parseFloat(numberMatch[1]);
            fieldConfidences[key] = 0.72;
            matchCount++;
          }
          break;
        }
        case 'boolean': {
          const boolMatch = input.match(
            new RegExp(`${escapedKey}[\\s]*[=:][\\s]*(true|false|yes|no)`, 'i')
          );
          if (boolMatch && boolMatch[1]) {
            params[key] =
              boolMatch[1].toLowerCase() === 'true' || boolMatch[1].toLowerCase() === 'yes';
            fieldConfidences[key] = 0.68;
            matchCount++;
          }
          break;
        }
      }
    }

    const totalParams = Object.keys(properties).length;
    const confidence = totalParams > 0 ? matchCount / totalParams : 0;

    const postProcessed = this.postProcessRecognizedParams(params, properties, input);
    return {
      params: postProcessed.params,
      confidence,
      field_confidences: this.completeFieldConfidences(
        postProcessed.params,
        fieldConfidences,
        postProcessed.supplementedFieldSources
      ),
      uncertain_fields: [],
    };
  }

  /**
   * Validate value type against expected schema type
   */
  private validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return typeof value === 'string' && Boolean(this.normalizeDateValue(value.trim()));
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  private validateRecognizedValue(
    key: string,
    value: unknown,
    expectedType: string,
    schema?: ParamSchemaProperty
  ): boolean {
    const normalizedExpectedType = this.resolveExpectedValueType(key, expectedType, schema);
    if (key.includes('[]') && Array.isArray(value)) {
      return (
        value.length > 0 &&
        value.every(
          (item) =>
            item !== null && item !== undefined && this.validateType(item, normalizedExpectedType)
        )
      );
    }
    if (value === null || value === undefined) {
      return false;
    }
    const isValidType = this.validateType(value, normalizedExpectedType);
    if (!isValidType) {
      return false;
    }
    if (schema?.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum.includes(value as any);
    }
    return true;
  }

  private postProcessRecognizedParams(
    params: Record<string, unknown>,
    properties: Record<string, ParamSchemaProperty>,
    userInput: string,
    enableSemanticAugmentation = true
  ): {
    params: Record<string, unknown>;
    supplementedFieldSources: Map<string, 'explicit' | 'semantic'>;
  } {
    const normalizedParams: Record<string, unknown> = {};
    const supplementedFieldSources = new Map<string, 'explicit' | 'semantic'>();

    for (const [key, value] of Object.entries(params)) {
      if (!properties[key]) {
        continue;
      }

      const normalizedValue = this.normalizeRecognizedValue(
        key,
        value,
        properties[key].type,
        properties[key]
      );
      if (normalizedValue === undefined) {
        continue;
      }
      const schemaCompatibleValue = this.normalizeSchemaCompatibleValue(
        key,
        normalizedValue,
        properties[key]
      );
      if (schemaCompatibleValue === undefined) {
        continue;
      }
      if (
        this.validateRecognizedValue(
          key,
          schemaCompatibleValue,
          properties[key].type,
          properties[key]
        )
      ) {
        normalizedParams[key] = schemaCompatibleValue;
      }
    }

    if (enableSemanticAugmentation) {
      this.reconcileExplicitPatternParams(
        normalizedParams,
        properties,
        userInput,
        supplementedFieldSources
      );
      this.supplementMissingSemanticParams(
        normalizedParams,
        properties,
        userInput,
        supplementedFieldSources
      );
    }
    return {
      params: normalizedParams,
      supplementedFieldSources,
    };
  }

  private normalizeFieldConfidences(
    value: unknown,
    properties: Record<string, ParamSchemaProperty>
  ): Record<string, number> {
    const normalized = this.normalizeSchemaCompatibleParams(value, properties);
    return Object.entries(normalized).reduce<Record<string, number>>((acc, [key, score]) => {
      const normalizedScore = this.normalizeConfidenceScore(score);
      if (normalizedScore === undefined) {
        return acc;
      }
      acc[key] = normalizedScore;
      return acc;
    }, {});
  }

  private normalizeUncertainFields(
    value: unknown,
    properties: Record<string, ParamSchemaProperty>
  ): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) =>
        typeof item === 'string' ? this.resolveSchemaPathKey(item, properties) : undefined
      )
      .filter((item): item is string => typeof item === 'string')
      .filter((item, index, array) => array.indexOf(item) === index);
  }

  private normalizeConfidenceScore(value: unknown): number | undefined {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return Math.max(0, Math.min(1, value));
    }
    if (Array.isArray(value)) {
      const firstNumeric = value.find(
        (item): item is number => typeof item === 'number' && !Number.isNaN(item)
      );
      if (typeof firstNumeric === 'number') {
        return Math.max(0, Math.min(1, firstNumeric));
      }
    }
    return undefined;
  }

  private completeFieldConfidences(
    params: Record<string, unknown>,
    base: Record<string, number>,
    supplementedFieldSources: Map<string, 'explicit' | 'semantic'> = new Map()
  ): Record<string, number> {
    return Object.keys(params).reduce<Record<string, number>>((acc, key) => {
      if (typeof base[key] === 'number') {
        acc[key] = base[key];
        return acc;
      }
      const supplementedSource = supplementedFieldSources.get(key);
      if (supplementedSource === 'explicit') {
        acc[key] = key.includes('[]') ? 0.86 : 0.88;
        return acc;
      }
      if (supplementedSource === 'semantic') {
        acc[key] = key.includes('[]') ? 0.58 : 0.62;
        return acc;
      }
      acc[key] = key.includes('[]') ? 0.76 : 0.8;
      return acc;
    }, {});
  }

  private normalizeRecognizedValue(
    key: string,
    value: unknown,
    expectedType: string,
    schema?: ParamSchemaProperty
  ): unknown {
    const normalizedExpectedType = this.resolveExpectedValueType(key, expectedType, schema);
    if (
      key.includes('[]') &&
      !Array.isArray(value) &&
      this.validateType(value, normalizedExpectedType)
    ) {
      const normalizedScalar = this.normalizeScalarValue(value, normalizedExpectedType);
      return normalizedScalar !== undefined ? [normalizedScalar] : undefined;
    }

    if (Array.isArray(value)) {
      const normalizedArray = value
        .map((item) => this.normalizeScalarValue(item, normalizedExpectedType))
        .filter((item) => item !== undefined);
      return normalizedArray.length > 0 ? normalizedArray : undefined;
    }

    return this.normalizeScalarValue(value, normalizedExpectedType);
  }

  private resolveExpectedValueType(
    key: string,
    expectedType: string,
    schema?: ParamSchemaProperty
  ): string {
    return resolveExpectedValueType(key, expectedType, schema);
  }

  private normalizeScalarValue(value: unknown, expectedType: string): unknown {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      if (expectedType === 'string' && this.isPlaceholderTextValue(trimmed)) {
        return undefined;
      }
      if (expectedType === 'string') {
        return trimmed;
      }
      if (expectedType === 'date') {
        return this.normalizeDateValue(trimmed) || trimmed;
      }
      return value;
    }
    return value;
  }

  private normalizeSchemaCompatibleValue(
    key: string,
    value: unknown,
    schema: ParamSchemaProperty
  ): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.normalizeSchemaCompatibleValue(key, item, schema))
        .filter((item) => item !== undefined);
      return normalized.length > 0 ? normalized : undefined;
    }
    if (typeof value !== 'string') {
      return value;
    }

    const signalText = `${key} ${schema.description || ''} ${schema.extractionPrompt || ''}`;
    if (this.looksLikeStageField(signalText) && Boolean(this.normalizeDateValue(value))) {
      return undefined;
    }
    if (this.looksLikeStandardField(signalText) && this.looksLikeAcceptanceModeValue(value)) {
      return undefined;
    }

    return value;
  }

  private looksLikeStageField(value: string): boolean {
    return /(阶段|stage|phase)/i.test(value);
  }

  private looksLikeStandardField(value: string): boolean {
    return /(标准|standard|criteria|criterion|规范)/i.test(value);
  }

  private looksLikeAcceptanceModeValue(value: string): boolean {
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }

    return (
      /验收/.test(normalized) &&
      (/(到货|收货|安装|调试|性能)/.test(normalized) || /(先|后|再|\+)/.test(normalized))
    );
  }

  private isPlaceholderTextValue(value: string): boolean {
    return isPlaceholderTextValue(value);
  }

  private supplementMissingSemanticParams(
    params: Record<string, unknown>,
    properties: Record<string, ParamSchemaProperty>,
    userInput: string,
    supplementedFieldSources: Map<string, 'explicit' | 'semantic'>
  ): void {
    const propertyEntries = Object.entries(properties);
    if (propertyEntries.length === 0) {
      return;
    }

    for (const [key, schema] of propertyEntries) {
      const currentValue = params[key];
      if (this.hasRecognizedFieldValue(key, currentValue)) {
        continue;
      }

      const inferred = this.inferFieldValueFromSemanticSignal(key, schema, userInput);
      if (inferred === undefined) {
        continue;
      }

      const normalized = this.normalizeRecognizedValue(key, inferred, schema.type, schema);
      if (
        normalized !== undefined &&
        this.validateRecognizedValue(key, normalized, schema.type, schema)
      ) {
        params[key] = normalized;
        supplementedFieldSources.set(key, 'semantic');
      }
    }
  }

  private hasRecognizedFieldValue(key: string, value: unknown): boolean {
    if (key.includes('[]')) {
      return Array.isArray(value) && value.length > 0;
    }
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return true;
  }

  private inferFieldValueFromSemanticSignal(
    key: string,
    schema: ParamSchemaProperty,
    userInput: string
  ): unknown {
    const extractionHints = Array.isArray(schema.extractionHints)
      ? schema.extractionHints.join(' ')
      : '';
    const hintText = `${this.buildSignalText(key, schema)} ${schema.extractionPrompt || ''} ${extractionHints}`;

    return inferValueBySemanticSignal({
      role: schema.semanticRole,
      hintText,
      userInput,
      context: {
        extractBatchValue: (input) => this.extractBatchValue(input),
        extractLocationValue: (input) => this.extractLocationValue(input),
        extractAcceptanceTypeValue: (input) => this.extractAcceptanceTypeValue(input),
        extractDateByKeywords: (input, keywords) => this.extractDateByKeywords(input, keywords),
      },
    });
  }

  private reconcileExplicitPatternParams(
    params: Record<string, unknown>,
    properties: Record<string, ParamSchemaProperty>,
    userInput: string,
    supplementedFieldSources: Map<string, 'explicit' | 'semantic'>
  ): void {
    for (const [key, schema] of Object.entries(properties)) {
      const explicit = this.inferFieldValueFromExplicitPatterns(key, schema, userInput);
      if (explicit === undefined) {
        continue;
      }

      const normalized = this.normalizeRecognizedValue(key, explicit, schema.type, schema);
      if (
        normalized === undefined ||
        !this.validateRecognizedValue(key, normalized, schema.type, schema)
      ) {
        continue;
      }

      if (this.areFieldValuesEquivalent(params[key], normalized)) {
        continue;
      }

      params[key] = normalized;
      supplementedFieldSources.set(key, 'explicit');
    }
  }

  private areFieldValuesEquivalent(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private inferFieldValueFromExplicitPatterns(
    key: string,
    input: string,
    schema?: ParamSchemaProperty
  ): unknown {
    return inferFieldValueFromExplicitPatterns(key, input, schema);
  }

  private markRequiredFields(
    properties: Record<string, ParamSchemaProperty>,
    required?: string[]
  ): Record<string, ParamSchemaProperty> {
    return markRequiredFields(properties, required);
  }

  private escapeRegExp(value: string): string {
    return escapeRegExp(value);
  }

  private buildSignalText(key: string, schema?: ParamSchemaProperty): string {
    return buildSignalText(key, schema);
  }

  private normalizeDateValue(value: string): string | undefined {
    return normalizeDateValue(value);
  }

  private extractBatchValue(input: string): string | undefined {
    return extractBatchValue(input);
  }

  private extractLocationValue(input: string): string | undefined {
    return extractLocationValue(input);
  }

  private extractAcceptanceTypeValue(input: string): string | undefined {
    return extractAcceptanceTypeValue(input);
  }

  private extractDateByKeywords(input: string, keywords: string[]): string | undefined {
    return extractDateByKeywords(input, keywords);
  }



  async batchRecognizeParams(inputs: RecognizeParamsDTO[]): Promise<RecognizeParamsResponseDTO[]> {
    return Promise.all(inputs.map((input) => this.recognizeParams(input)));
  }
}
