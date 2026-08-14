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

    const flattened = this.flattenNestedResponse(value);
    return Object.entries(flattened).reduce<Record<string, unknown>>((acc, [key, rawValue]) => {
      const resolvedKey = this.resolveSchemaPathKey(key, properties);
      if (!resolvedKey) {
        return acc;
      }
      acc[resolvedKey] = rawValue;
      return acc;
    }, {});
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
        case 'string':
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
        case 'number':
          const numberMatch = input.match(
            new RegExp(`${escapedKey}[\\s]*[=:][\\s]*(\\d+(\\.\\d+)?)`, 'i')
          );
          if (numberMatch && numberMatch[1]) {
            params[key] = parseFloat(numberMatch[1]);
            fieldConfidences[key] = 0.72;
            matchCount++;
          }
          break;
        case 'boolean':
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
    if (expectedType !== 'array') {
      return expectedType;
    }

    const signalText = this.buildSignalText(key, schema).toLowerCase();
    if (
      /(arrivaldate|installationdate|signdate|date|日期|签署日期|签订日期|到货日期|交付日期|安装完成日期|安装日期)/i.test(
        signalText
      )
    ) {
      return 'date';
    }
    if (
      /(amount|price|ratio|quantity|count|number|subtotal|total|序号|行号|数量|金额|单价|比例|月数)/i.test(
        signalText
      )
    ) {
      return 'number';
    }
    if (/(boolean|bool|flag|是否|include|包含)/i.test(signalText)) {
      return 'boolean';
    }
    return 'string';
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
    schema: ParamSchemaProperty,
    userInput: string
  ): unknown {
    const aliases = this.buildFieldAliases(key, schema);
    const isLineItemArrayField = this.isEnumeratedLineItemArrayField(key, schema, aliases);
    const isDeliveryArrayField = this.isDeliveryScopedArrayField(key, schema, aliases);
    const isPaymentArrayField = this.isPaymentClauseArrayField(key, schema, aliases);
    if (key.includes('[]')) {
      if (isLineItemArrayField && this.hasAliasKeyword(aliases, ['行号', '序号'])) {
        return this.extractItemSequenceNumbers(userInput);
      }
      if (isLineItemArrayField && this.hasAliasKeyword(aliases, ['名称'])) {
        return this.extractEnumeratedItemNames(userInput);
      }
      if (isLineItemArrayField) {
        const expectedType = this.resolveExpectedValueType(key, schema.type, schema);
        const itemValues = this.extractEnumeratedItemFieldValues(
          userInput,
          aliases,
          expectedType === 'date' ? 'date' : expectedType === 'number' ? 'number' : 'string'
        );
        if (itemValues && itemValues.length > 0) {
          return itemValues;
        }
      }
      if (isDeliveryArrayField) {
        const expectedType = this.resolveExpectedValueType(key, schema.type, schema);
        if (this.hasExactAliasKeyword(aliases, ['批次'])) {
          return this.extractBatchValues(userInput);
        }
        if (this.hasExactAliasKeyword(aliases, ['地点', '地址'])) {
          const locations = this.extractDeliveryLocations(userInput);
          if (locations.length > 0) {
            return locations;
          }
          const location = this.extractLocationValue(userInput);
          if (location) {
            return [location];
          }
        }
        if (expectedType === 'date') {
          const explicitDates = this.extractDateValuesByAliases(userInput, aliases);
          if (explicitDates && explicitDates.length > 0) {
            return explicitDates;
          }
        }
        if (expectedType === 'date' || this.hasAliasKeyword(aliases, ['验收方式', '验收类型'])) {
          const deliveryValues = this.extractBatchScopedFieldValues(
            userInput,
            aliases,
            expectedType === 'date' ? 'date' : 'string'
          );
          if (deliveryValues && deliveryValues.length > 0) {
            return deliveryValues;
          }
        }
      }
      if (this.hasAliasKeyword(aliases, ['应付金额', '付款金额'])) {
        return this.extractPaymentAmounts(userInput);
      }
      if (this.hasAliasKeyword(aliases, ['付款阶段', '阶段标识'])) {
        return this.extractPaymentStages(userInput);
      }
      if (this.hasAliasKeyword(aliases, ['付款前置条件', '付款条件', '支付条件'])) {
        return this.extractPaymentConditions(userInput);
      }
      if (this.hasAliasKeyword(aliases, ['付款比例', '支付比例', '比例'])) {
        return this.extractPaymentRatios(userInput);
      }
      if (isPaymentArrayField) {
        return undefined;
      }

      const expectedType = this.resolveExpectedValueType(key, schema.type, schema);
      if (expectedType === 'date') {
        return this.extractAllLabeledValues(userInput, aliases, 'date');
      }
      if (expectedType === 'number') {
        return this.extractAllLabeledValues(userInput, aliases, 'number');
      }
      if (this.hasAliasKeyword(aliases, ['验收方式', '验收类型'])) {
        const explicitAcceptanceValues = this.extractAllLabeledValues(userInput, aliases, 'string');
        if (Array.isArray(explicitAcceptanceValues) && explicitAcceptanceValues.length > 0) {
          return explicitAcceptanceValues;
        }
        const normalizedAcceptance = this.extractAcceptanceTypeValue(userInput);
        if (normalizedAcceptance) {
          return [normalizedAcceptance];
        }
      }
      const explicitValues = this.extractAllLabeledValues(userInput, aliases, 'string');
      if (Array.isArray(explicitValues) && explicitValues.length > 0) {
        return explicitValues;
      }

      return undefined;
    }

    const expectedType = this.resolveExpectedValueType(key, schema.type, schema);
    if (this.isBooleanLikeField(aliases)) {
      const booleanValue = this.extractBooleanLikeValue(userInput, aliases);
      if (booleanValue !== undefined) {
        return booleanValue;
      }
    }

    if (
      this.hasAliasKeyword(aliases, [
        'query',
        'keyword',
        'keywords',
        'search',
        'searchterm',
        'querytext',
        'searchquery',
        '搜索',
        '检索',
        '查询',
        '关键词',
      ])
    ) {
      const searchMatch = userInput.match(/(?:检索|搜索|查找|查询|搜|找)\s*(.+)/i);
      if (searchMatch?.[1]?.trim()) {
        return searchMatch[1].trim();
      }
    }

    if (expectedType === 'number') {
      const explicitNumber = this.extractFirstLabeledValue(userInput, aliases, 'number');
      if (explicitNumber !== undefined) {
        return explicitNumber;
      }
    }

    if (expectedType === 'date') {
      return this.extractFirstLabeledValue(userInput, aliases, 'date');
    }
    if (expectedType === 'string' && this.shouldSkipBroadScalarAliasExtraction(aliases)) {
      return undefined;
    }

    return this.extractFirstLabeledValue(userInput, aliases, 'string');
  }



  private isDeliveryScopedArrayField(
    key: string,
    schema: ParamSchemaProperty,
    aliases: string[]
  ): boolean {
    if (key.startsWith('deliveryItems[]')) {
      return true;
    }

    const semanticRole = normalizeSemanticRole(schema.semanticRole);
    if (
      semanticRole &&
      [
        'delivery_batch',
        'delivery_location',
        'acceptance_type',
        'arrival_date',
        'installation_date',
      ].includes(semanticRole)
    ) {
      return true;
    }

    return (
      this.hasAliasKeyword(aliases, ['批次', '地点', '地址', '验收方式', '验收类型']) ||
      this.hasDateLikeAlias(aliases)
    );
  }

  private isEnumeratedLineItemArrayField(
    key: string,
    schema: ParamSchemaProperty,
    aliases: string[]
  ): boolean {
    const signalText = this.buildSignalText(key, schema);
    const hasLineItemContext =
      /(item|line|row|detail|material|product|sku|物料|设备|明细|标的|清单)/i.test(signalText);
    const hasLineItemFieldAlias = this.hasAliasKeyword(aliases, [
      '行号',
      '序号',
      '名称',
      '编码',
      '型号',
      '规格',
      '单位',
      '数量',
      '单价',
      '金额',
      '小计',
    ]);

    return hasLineItemContext && hasLineItemFieldAlias;
  }

  private isPaymentClauseArrayField(
    key: string,
    schema: ParamSchemaProperty,
    aliases: string[]
  ): boolean {
    if (key.startsWith('paymentSchedule[]')) {
      return true;
    }

    const signalText = this.buildSignalText(key, schema);
    if (/(付款|支付|payment)/i.test(signalText)) {
      return true;
    }

    return aliases.some((alias) => /(付款|支付)/.test(alias));
  }

  private hasDateLikeAlias(aliases: string[]): boolean {
    return aliases.some((alias) => /日期|date/i.test(alias));
  }

  private buildSignalText(key: string, schema?: ParamSchemaProperty): string {
    return [
      key,
      schema?.displayName,
      schema?.description,
      schema?.extractionPrompt,
      ...(Array.isArray(schema?.extractionHints) ? schema!.extractionHints : []),
    ]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' ');
  }

  private buildFieldAliases(key: string, schema?: ParamSchemaProperty): string[] {
    const candidates = new Set<string>();
    const sources = [
      schema?.displayName,
      schema?.description,
      schema?.extractionPrompt,
      ...(Array.isArray(schema?.extractionHints) ? schema!.extractionHints : []),
      this.extractKeyLeafLabel(key),
    ];

    for (const source of sources) {
      if (typeof source !== 'string' || !source.trim()) {
        continue;
      }
      this.collectAliasVariants(candidates, source);
      const firstClause = source.split(/[，,；;。]/)[0]?.trim();
      if (firstClause && firstClause !== source.trim()) {
        this.collectAliasVariants(candidates, firstClause);
      }
    }

    return [...candidates]
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .sort((left, right) => right.length - left.length);
  }

  private collectAliasVariants(aliases: Set<string>, raw: string): void {
    const value = raw.trim();
    if (!value) {
      return;
    }

    const variants = new Set<string>([
      value,
      value.replace(/\s+/g, ''),
      value.replace(/[（(][^()（）]+[）)]/g, '').trim(),
      value.replace(/^是否/, '').trim(),
      value.replace(/^是否(?:包含|需要|支持|有)/, '').trim(),
      value.replace(/唯一标识/g, '').trim(),
      value.replace(/期限月数/g, '期').trim(),
    ]);

    const parentheticalMatches = [...value.matchAll(/[（(]([^()（）]+)[）)]/g)];
    for (const match of parentheticalMatches) {
      if (match[1]) {
        variants.add(match[1].trim());
      }
    }

    for (const variant of variants) {
      const normalized = variant.trim();
      if (!normalized || normalized.length < 2) {
        continue;
      }
      aliases.add(normalized);
      this.addMeaningfulSuffixAliases(aliases, normalized);
    }
  }

  private addMeaningfulSuffixAliases(aliases: Set<string>, value: string): void {
    const exactSuffixes = ['小计', '小计金额', '规格型号'];
    const standaloneHeadBlacklist = new Set(['名称', '日期', '期']);
    for (const suffix of exactSuffixes) {
      if (value.length > suffix.length && value.endsWith(suffix)) {
        aliases.add(suffix);
      }
    }

    const suffixHeads = [
      '名称',
      '编号',
      '币种',
      '期限',
      '期',
      '行号',
      '序号',
      '编码',
      '型号',
      '单位',
      '数量',
      '单价',
      '金额',
      '批次',
      '地点',
      '地址',
      '日期',
      '方式',
      '类型',
      '条件',
      '比例',
      '阶段',
      '范围',
      '标的',
      '条款',
      '约定',
    ];
    for (const head of suffixHeads) {
      const match = value.match(new RegExp(`([\\u4e00-\\u9fff]{0,6}${head})$`));
      if (match?.[1]) {
        if (!standaloneHeadBlacklist.has(head)) {
          aliases.add(head);
        }
        if (match[1] !== value) {
          aliases.add(match[1]);
        }

        const prefix = value
          .slice(0, -head.length)
          .replace(/[的之]/g, '')
          .trim();
        if (prefix.length >= 2) {
          const shortPrefix = prefix.slice(-Math.min(2, prefix.length));
          if (shortPrefix.length >= 2) {
            aliases.add(`${shortPrefix}${head}`);
          }
          if (head === '名称') {
            aliases.add(shortPrefix);
          }
        }
      }
    }
    if (value.includes('小计')) {
      aliases.add('小计');
    }
  }

  private extractKeyLeafLabel(key: string): string | undefined {
    const leaf = key.split('.').pop()?.replace(/\[\]/g, '').trim();
    if (!leaf) {
      return undefined;
    }
    return leaf.replace(/_/g, ' ');
  }

  private hasAliasKeyword(aliases: string[], keywords: string[]): boolean {
    return aliases.some((alias) => keywords.some((keyword) => alias.includes(keyword)));
  }

  private hasExactAliasKeyword(aliases: string[], keywords: string[]): boolean {
    return aliases.some((alias) => {
      const normalized = alias.trim();
      return keywords.some((keyword) => normalized === keyword || normalized.endsWith(keyword));
    });
  }

  private isBooleanLikeField(aliases: string[]): boolean {
    return aliases.some((alias) => /^是否/.test(alias) || /(true|false|yes|no)/i.test(alias));
  }

  private extractBooleanLikeValue(input: string, aliases: string[]): '是' | '否' | undefined {
    const sortedAliases = [...aliases].sort((left, right) => right.length - left.length);
    for (const alias of sortedAliases) {
      const explicitPattern = new RegExp(
        `${this.escapeRegExp(alias)}\\s*(?:为|是|[:：=])\\s*(是|否|true|false|yes|no|有|无|包含|不包含|需要|不需要)`,
        'i'
      );
      const explicitMatch = input.match(explicitPattern);
      if (explicitMatch?.[1]) {
        return this.normalizeBooleanLikeValue(explicitMatch[1]);
      }

      const coreAlias = alias
        .replace(/^是否(?:包含|需要|支持|有)?/, '')
        .replace(/^是否/, '')
        .trim();
      if (!coreAlias || coreAlias.length < 2) {
        continue;
      }

      if (
        new RegExp(`(?:不含|不包含|无需|无|不需要).{0,4}${this.escapeRegExp(coreAlias)}`).test(
          input
        )
      ) {
        return '否';
      }
      if (new RegExp(`(?:含|包含|有|需要).{0,4}${this.escapeRegExp(coreAlias)}`).test(input)) {
        return '是';
      }
    }

    return undefined;
  }

  private normalizeBooleanLikeValue(value: string): '是' | '否' | undefined {
    const normalized = value.trim().toLowerCase();
    if (['是', 'true', 'yes', '有', '包含', '需要'].includes(normalized)) {
      return '是';
    }
    if (['否', 'false', 'no', '无', '不包含', '不需要'].includes(normalized)) {
      return '否';
    }
    return undefined;
  }

  private shouldSkipBroadScalarAliasExtraction(aliases: string[]): boolean {
    const meaningfulAliases = aliases.filter((alias) => /[\u4e00-\u9fff]/.test(alias));
    if (meaningfulAliases.some((alias) => alias.length >= 4)) {
      return false;
    }
    return meaningfulAliases.every((alias) => ['备注', '说明', '内容', '信息'].includes(alias));
  }

  private extractFirstLabeledValue(
    input: string,
    labels: string[],
    valueType: 'string' | 'number' | 'date'
  ): string | number | undefined {
    const values = this.extractAllLabeledValues(input, labels, valueType);
    return Array.isArray(values) && values.length > 0 ? values[0] : undefined;
  }

  private extractAllLabeledValues(
    input: string,
    labels: string[],
    valueType: 'string' | 'number' | 'date'
  ): Array<string | number> | undefined {
    const matches: Array<{ index: number; end: number; value: string | number }> = [];
    const occupiedRanges: Array<{ start: number; end: number }> = [];
    const sortedLabels = [...labels].sort((left, right) => right.length - left.length);
    for (const label of sortedLabels) {
      const pattern = new RegExp(
        `${this.escapeRegExp(label)}\\s*(?:为|是|[:：=])?\\s*([^，。；;\\n]+)`,
        'gi'
      );
      for (const match of input.matchAll(pattern)) {
        const normalized = this.normalizeExtractedMatch(match[1], valueType);
        const start = match.index ?? -1;
        if (normalized !== undefined && start >= 0) {
          const end = start + match[0].length;
          const overlapped = occupiedRanges.some((range) => start < range.end && end > range.start);
          if (!overlapped) {
            matches.push({ index: start, end, value: normalized });
            occupiedRanges.push({ start, end });
          }
        }
      }
    }
    if (matches.length === 0) {
      return undefined;
    }
    return matches.sort((left, right) => left.index - right.index).map((item) => item.value);
  }

  private normalizeExtractedMatch(
    value: string | undefined,
    valueType: 'string' | 'number' | 'date'
  ): string | number | undefined {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return undefined;
    }
    if (valueType === 'number') {
      const numberMatch = trimmed.match(/-?\d+(?:\.\d+)?/);
      return numberMatch?.[0] ? Number(numberMatch[0]) : undefined;
    }
    if (valueType === 'date') {
      return this.normalizeDateValue(trimmed);
    }
    return trimmed.replace(/^(?:为|是)\s*/, '').trim();
  }

  private extractAllMatches(
    input: string,
    pattern: RegExp,
    valueType: 'string' | 'number' | 'date' = 'string'
  ): Array<string | number> {
    const values: Array<string | number> = [];
    for (const match of input.matchAll(pattern)) {
      const candidate = match[1] || match[0];
      const normalized = this.normalizeExtractedMatch(candidate, valueType);
      if (normalized !== undefined) {
        values.push(normalized);
      }
    }
    return values;
  }

  private extractDateValuesByAliases(input: string, aliases: string[]): string[] | undefined {
    const dateAliases = aliases
      .filter((alias) => /日期|date/i.test(alias))
      .sort((left, right) => right.length - left.length);
    if (dateAliases.length === 0) {
      return undefined;
    }

    const alternation = dateAliases.map((alias) => this.escapeRegExp(alias)).join('|');
    const pattern = new RegExp(
      `(?:${alternation})\\s*(?:为|是|[:：=])?\\s*(\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}|\\d{4}年\\d{1,2}月\\d{1,2}日?)`,
      'g'
    );
    const values = this.extractAllMatches(input, pattern, 'date') as string[];
    return values.length > 0 ? values : undefined;
  }

  private extractItemSequenceNumbers(input: string): number[] | undefined {
    const values = this.extractAllMatches(input, /(?:^|[：:；;\n])\s*(\d+)\s*[\.、]/gm, 'number');
    return values.length > 0 ? (values as number[]) : undefined;
  }

  private extractEnumeratedItemNames(input: string): string[] | undefined {
    const names = this.extractAllMatches(
      input,
      /(?:^|[：:；;\n])\s*\d+\s*[\.、]\s*([^，。；;\n]+)/gm,
      'string'
    );
    return names.length > 0 ? (names as string[]) : undefined;
  }

  private extractEnumeratedItemFieldValues(
    input: string,
    labels: string[],
    valueType: 'string' | 'number' | 'date'
  ): Array<string | number> | undefined {
    const blocks = this.extractEnumeratedItemBlocks(input);
    if (blocks.length === 0) {
      return undefined;
    }

    const values = blocks
      .map((block) => this.extractFirstLabeledValue(block, labels, valueType))
      .filter((item): item is string | number => item !== undefined);

    return values.length > 0 ? values : undefined;
  }

  private extractEnumeratedItemBlocks(input: string): string[] {
    const pattern =
      /(?:^|[：:；;\n])\s*\d+\s*[\.、]\s*([\s\S]*?)(?=(?:^|[：:；;\n])\s*\d+\s*[\.、]\s*|$)/gm;
    const blocks: string[] = [];
    for (const match of input.matchAll(pattern)) {
      const content = String(match[1] || '').trim();
      if (content) {
        blocks.push(content);
      }
    }
    return blocks;
  }

  private extractBatchScopedFieldValues(
    input: string,
    labels: string[],
    valueType: 'string' | 'number' | 'date'
  ): Array<string | number> | undefined {
    const blocks = this.extractBatchBlocks(input);
    if (blocks.length === 0) {
      return undefined;
    }

    const values = blocks
      .map((block) => this.extractFirstLabeledValue(block, labels, valueType))
      .filter((item): item is string | number => item !== undefined);

    return values.length > 0 ? values : undefined;
  }

  private extractBatchBlocks(input: string): string[] {
    const pattern =
      /(首批|第[一二三四五六七八九十百千万0-9]+批)[\s\S]*?(?=(首批|第[一二三四五六七八九十百千万0-9]+批)|$)/g;
    const blocks: string[] = [];
    for (const match of input.matchAll(pattern)) {
      const content = String(match[0] || '').trim();
      if (content) {
        blocks.push(content);
      }
    }
    return blocks;
  }

  private extractBatchValues(input: string): string[] | undefined {
    const values = this.extractAllMatches(
      input,
      /(首批|第[一二三四五六七八九十百千万0-9]+批)(?=在|，计划到货日期|，安装完成日期|，验收方式)/g,
      'string'
    ) as string[];
    return values.length > 0 ? values : undefined;
  }

  private extractDeliveryLocations(input: string): string[] {
    return this.extractAllMatches(
      input,
      /(?:首批|第[一二三四五六七八九十百千万0-9]+批)[^，。；;\n]*?在\s*([^，。；;\n]+?)(?=，(?:计划到货日期|安装完成日期|验收方式)|；|\n|。)/g,
      'string'
    ) as string[];
  }

  private extractPaymentConditions(input: string): string[] | undefined {
    return this.extractPaymentClauseValues(input, (clause, stage) => {
      const normalizedClause = clause.startsWith(stage)
        ? clause.slice(stage.length).trim()
        : clause;
      const match = normalizedClause.match(/^([^，。；;\n]+?)\s*支付\s*\d+(?:\.\d+)?%/);
      return match?.[1]?.trim();
    });
  }

  private extractPaymentStages(input: string): string[] | undefined {
    const clauses = this.extractPaymentClauses(input);
    const values = clauses.map((item) => item.stage);
    return values.length > 0 ? values : undefined;
  }

  private extractPaymentRatios(input: string): number[] | undefined {
    return this.extractPaymentClauseValues(input, (clause) => {
      const match = clause.match(/支付\s*(\d+(?:\.\d+)?)%/);
      return match?.[1] ? Number(match[1]) : undefined;
    });
  }

  private extractPaymentAmounts(input: string): number[] | undefined {
    return this.extractPaymentClauseValues(input, (clause) => {
      const match = clause.match(/金额\s*(\d+(?:\.\d+)?)/);
      return match?.[1] ? Number(match[1]) : undefined;
    });
  }

  private extractPaymentClauseValues<T extends string | number>(
    input: string,
    mapper: (clause: string, stage: string) => T | undefined
  ): T[] | undefined {
    const clauses = this.extractPaymentClauses(input);
    const values = clauses
      .map((item) => mapper(item.clause, item.stage))
      .filter((item): item is T => item !== undefined);
    return values.length > 0 ? values : undefined;
  }

  private extractPaymentClauses(input: string): Array<{ stage: string; clause: string }> {
    const pattern =
      /(?:^|[：:；;\n])\s*([^，。；;\n]{2,20})[，,]([^；;\n。]*?(?:支付\s*\d+(?:\.\d+)?%|金额\s*\d+(?:\.\d+)?)[^；;\n。]*)/g;
    const clauses: Array<{ stage: string; clause: string }> = [];
    for (const match of input.matchAll(pattern)) {
      const stage = match[1]?.trim();
      const clause = `${stage || ''}${match[2] || ''}`.trim();
      if (stage && clause) {
        clauses.push({ stage, clause });
      }
    }
    return clauses;
  }

  private extractBatchValue(input: string): string | undefined {
    const match = input.match(/(首批|第[一二三四五六七八九十百千0-9]+批)/);
    return match?.[1];
  }

  private extractLocationValue(input: string): string | undefined {
    const patterns = [
      /(?:交付地点|交货地点|收货地址|交付地址|到货地点|送达地点|城市名称|查询城市|城市)[为是:：]?\s*([^，。；\n]+)/,
      /(?:地点为|地址为|城市为)[：: ]?\s*([^，。；\n]+)/,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    const cityMatch = input.match(
      /(?:上海|北京|广州|深圳|成都|武汉|南京|杭州|西安|重庆|天津|苏州|无锡|宁波|青岛|大连|厦门|福州|长沙|郑州|沈阳|哈尔滨|长春|济南|合肥|南昌|昆明|贵阳|海口|拉萨|乌鲁木齐|银川|西宁|呼和浩特|兰州|香港|澳门|台北|三亚|桂林|扬州|徐州|常州|南通|绍兴|嘉兴|金华|台州|温州|佛山|东莞|中山|珠海|惠州|江门|汕头|湛江|肇庆|清远|韶关|河源|梅州|潮州|揭阳|云浮)/
    );
    if (cityMatch?.[0]) {
      return cityMatch[0];
    }

    const suffixMatch = input.match(/[\u4e00-\u9fa5]{2,8}(?:省|市|区|县)/);
    if (suffixMatch?.[0]) {
      return suffixMatch[0];
    }

    const trimmed = input.trim();
    if (trimmed.length >= 2 && trimmed.length <= 20 && /^[\u4e00-\u9fa5]+$/.test(trimmed)) {
      return trimmed;
    }

    return undefined;
  }


  private extractAcceptanceTypeValue(input: string): string | undefined {
    const normalized = input.replace(/\s+/g, '');
    const hasArrivalAcceptance = /(到货|交付|收货).{0,12}验收/.test(normalized);
    const hasInstallationAcceptance = /(安装|调试|联调).{0,12}验收/.test(normalized);

    if (hasArrivalAcceptance && hasInstallationAcceptance) {
      return '到货+安装验收';
    }
    if (hasArrivalAcceptance) {
      return '到货验收';
    }
    if (hasInstallationAcceptance) {
      return '安装验收';
    }

    const explicit = input.match(/(?:验收方式|验收类型)[为是:：]?\s*([^，。；\n]+)/);
    return explicit?.[1]?.trim();
  }

  private extractDateByKeywords(input: string, keywords: string[]): string | undefined {
    const dateRegex = /\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日?/g;
    for (const match of input.matchAll(dateRegex)) {
      const rawDate = match[0];
      const index = match.index ?? 0;
      const clauseText = this.extractDateClause(input, index, rawDate.length);
      if (keywords.some((keyword) => clauseText.includes(keyword))) {
        return this.normalizeDateValue(rawDate);
      }
    }
    return undefined;
  }

  private extractDateClause(input: string, index: number, length: number): string {
    const delimiters = /[，,。；;\n]/;
    let start = index;
    while (start > 0) {
      const prevChar = input[start - 1];
      if (!prevChar || delimiters.test(prevChar)) {
        break;
      }
      start -= 1;
    }

    let end = index + length;
    while (end < input.length) {
      const nextChar = input[end];
      if (!nextChar || delimiters.test(nextChar)) {
        break;
      }
      end += 1;
    }

    return input.slice(start, end);
  }

  private normalizeDateValue(value: string): string | undefined {
    const normalized = value.trim();
    const isoMatch = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      if (year && month && day) {
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    const zhMatch = normalized.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
    if (zhMatch) {
      const [, year, month, day] = zhMatch;
      if (year && month && day) {
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    return undefined;
  }

  private markRequiredFields(
    properties: Record<string, ParamSchemaProperty>,
    requiredFields?: string[]
  ): Record<string, ParamSchemaProperty> {
    const requiredSet = new Set(requiredFields || []);
    return Object.entries(properties).reduce<Record<string, ParamSchemaProperty>>(
      (acc, [name, schema]) => {
        acc[name] = {
          ...schema,
          required: schema.required === true || requiredSet.has(name),
        };
        return acc;
      },
      {}
    );
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Batch parameter recognition for multiple inputs
   */
  async batchRecognizeParams(inputs: RecognizeParamsDTO[]): Promise<RecognizeParamsResponseDTO[]> {
    return Promise.all(inputs.map((input) => this.recognizeParams(input)));
  }
}
