import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentGuideContext,
  RecognizeParamsDTO,
  RecognizeParamsResponseDTO,
  ChatMessage,
  PromptDebugLLMCall,
} from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';
import { isPlaceholderTextValue } from '../../common/placeholder-value';
import { ModelService } from '../model/model.service';
import { inferValueBySemanticSignal } from './semantic-role.registry';

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
  extractionPrompt?: string;
  semanticRole?: string;
  extractionHints?: string[];
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
  setDefaultClient(_client: OpenAICompatibleClient): void {
    // Legacy method - no longer needed as we use ModelService
    this.logger.warn('setDefaultClient is deprecated, using ModelService instead');
  }

  /**
   * Resolve the runtime model for parameter recognition.
   * Prefer the caller-selected model, then fall back to the system default.
   */
  private async resolveModelRuntime(
    requestedModelId?: string,
  ): Promise<{ modelId: string; client: OpenAICompatibleClient } | null> {
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
      this.logger.warn(`Requested recognizer model ${requestedModelId} is unavailable, falling back to default model`);
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

    // Build system prompt for parameter extraction
    const systemPrompt = this.buildSystemPromptFromSchema(
      templateName,
      properties,
      dto.guide_context,
    );

    // Build messages for the AI
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildUserPrompt(dto, properties) },
    ];

    // Prefer the caller-selected model so planner/debug traces match the chat UI choice.
    const runtime = await this.resolveModelRuntime(dto.modelId);
    if (!runtime) {
      this.logger.warn('No AI client available, using basic pattern matching');
      return {
        ...this.basicPatternMatching(dto.user_input, properties),
        debug: {
          notes: ['recognizer 未找到可用模型，已回退到基础模式匹配。'],
        },
      };
    }

    try {
      const response = await runtime.client.chatCompletion(messages);
      const llmCalls: PromptDebugLLMCall[] = [
        {
          stage: 'recognizer',
          label: '参数识别',
          modelId: runtime.modelId,
          requestMessages: messages.map((message) => ({
            role: message.role,
            content: String(message.content || ''),
          })),
          responseText: response.content,
        },
      ];
      const result = this.parseAIResponse(response.content, properties, dto.user_input);
      return {
        ...result,
        usage: response.usage,
        debug: {
          llmCalls,
        },
      };
    } catch (error) {
      this.logger.error(`AI call failed: ${error}`);
      // Fallback to basic pattern matching on AI failures
      return {
        ...this.basicPatternMatching(dto.user_input, properties),
        debug: {
          notes: [
            `recognizer 模型调用失败，已回退到基础模式匹配: ${error instanceof Error ? error.message : String(error)}`,
          ],
        },
      };
    }
  }

  /**
   * Build system prompt for parameter extraction from schema
   */
  private buildSystemPromptFromSchema(
    templateName: string,
    properties: Record<string, ParamSchemaProperty>,
    guideContext?: DocumentGuideContext,
  ): string {
    const params = Object.entries(properties)
      .map(([name, schema]) => {
        const normalizedDefaultValue = this.normalizePromptDefaultValue(schema.default);
        const defaultStr = normalizedDefaultValue !== undefined ? ` (默认值: ${normalizedDefaultValue})` : '';
        const hintStr = schema.extractionPrompt ? `；提取提示：${schema.extractionPrompt}` : '';
        const semanticRoleStr = schema.semanticRole ? `；语义角色：${schema.semanticRole}` : '';
        const semanticHintsStr = Array.isArray(schema.extractionHints) && schema.extractionHints.length > 0
          ? `；语义提示：${schema.extractionHints.join('、')}`
          : '';
        return `- ${name}: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}${defaultStr}${hintStr}${semanticRoleStr}${semanticHintsStr}`;
      })
      .join('\n');

    const isDocumentGuide = guideContext?.mode === 'document_skill';
    const guideSections = isDocumentGuide
      ? [
          guideContext?.templateOverview
            ? `文档概述：\n${guideContext.templateOverview}`
            : undefined,
          guideContext?.paramCollectionGuidance
            ? `参数识别指导：\n${guideContext.paramCollectionGuidance}`
            : undefined,
          guideContext?.guideMarkdown
            ? `完整模板指南：\n${guideContext.guideMarkdown}`
            : undefined,
          guideContext?.validationRules
            ? `校验规则：\n${guideContext.validationRules}`
            : undefined,
          Array.isArray(guideContext?.extractionHints) && guideContext.extractionHints.length > 0
            ? `补充提示：\n${guideContext.extractionHints.map((item) => `- ${item}`).join('\n')}`
            : undefined,
          guideContext?.outputExample
            ? `最终 JSON 示例（仅用于理解业务结构，不是本轮直接输出格式）：\n${JSON.stringify(guideContext.outputExample, null, 2)}`
            : undefined,
        ].filter(Boolean).join('\n\n')
      : '';

    const arrayOutputRule = Object.keys(properties).some((name) => name.includes('[]'))
      ? '\n对于数组字段（例如 items[].code、paymentSchedule[].amount），请按字段路径返回数组值，例如 `"items[].code": ["A001", "A002"]`，并保持同一行的数组索引顺序一致。若用户只提供了一组数组信息，也必须返回单元素数组；同一数组组允许只返回当前能确定的列，不要求一次补齐所有字段。'
      : '';

    return `你是一个参数提取助手。根据用户的输入，为模版"${templateName}"提取以下参数：
${params}

${guideSections ? `${guideSections}\n\n` : ''}请返回提取的参数作为 JSON 对象。如果你不能确定某个参数的值，请省略它。
只提取用户当前输入中明确提供、或能从当前输入直接定位到依据的值。禁止根据常见业务惯例、行业默认值、模板示例、历史经验或“通常应该如此”来脑补任何参数。
如果上面的文档指南里出现了最终渲染用的嵌套 JSON，本轮也不要直接输出该嵌套结构，而是必须返回当前参数列表中的扁平字段键名。${arrayOutputRule}
同时返回整体置信度分数（0-1）、字段级置信度，以及需要用户确认的不确定字段列表。

响应格式：
{
  "params": { ... 提取的参数 ... },
  "confidence": <整体置信度分数 0-1>,
  "field_confidences": {
    "<字段名>": <字段置信度 0-1>
  },
  "uncertain_fields": ["<需要确认的字段名>"]
}`;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(
    dto: RecognizeParamsDTO,
    properties: Record<string, ParamSchemaProperty>,
  ): string {
    let prompt = `User input: "${dto.user_input}"`;

    if (dto.context) {
      prompt += `\n\nAdditional context: ${JSON.stringify(dto.context)}`;
    }

    prompt += `\n\nExtract the following parameters: ${Object.keys(properties).join(', ')}`;
    if (dto.guide_context?.mode === 'document_skill') {
      prompt += '\n\n注意：如果是文档模板，请结合文档概述、参数用途和示例结构理解业务语义，但最终返回仍必须使用上面列出的扁平字段键名。';
    }

    return prompt;
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
  ): RecognizeParamsResponseDTO {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { params: {}, confidence: 0 };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const params = parsed.params || parsed;
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
      const parsedFieldConfidences = this.normalizeFieldConfidences(parsed.field_confidences, properties);
      const uncertainFields = this.normalizeUncertainFields(parsed.uncertain_fields, properties);

      // Validate and filter params against schema
      const validatedParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        if (properties[key]) {
          // Type validation
          const expectedType = properties[key].type;
          if (this.validateRecognizedValue(key, value, expectedType)) {
            validatedParams[key] = value;
          }
        }
      }

      const postProcessed = this.postProcessRecognizedParams(
        validatedParams,
        properties,
        userInput,
      );

      return {
        params: postProcessed.params,
        confidence: Math.max(0, Math.min(1, confidence)),
        field_confidences: this.completeFieldConfidences(
          postProcessed.params,
          parsedFieldConfidences,
          postProcessed.supplementedFields,
        ),
        uncertain_fields: uncertainFields.filter((field) => this.hasRecognizedFieldValue(field, postProcessed.params[field])),
      };
    } catch {
      return { params: {}, confidence: 0 };
    }
  }

  /**
   * Basic pattern matching fallback when AI is unavailable
   */
  private basicPatternMatching(
    input: string,
    properties: Record<string, ParamSchemaProperty>,
  ): RecognizeParamsResponseDTO {
    const params: Record<string, unknown> = {};
    const fieldConfidences: Record<string, number> = {};
    let matchCount = 0;

    for (const [key, schema] of Object.entries(properties)) {
      switch (schema.type) {
        case 'string':
          // Look for quoted strings or common patterns
          const stringMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*["']?([^"'\n,]+)["']?`, 'i'));
          if (stringMatch && stringMatch[1]) {
            params[key] = stringMatch[1].trim();
            fieldConfidences[key] = 0.72;
            matchCount++;
          }
          break;
        case 'number':
          const numberMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*(\\d+(\\.\\d+)?)`, 'i'));
          if (numberMatch && numberMatch[1]) {
            params[key] = parseFloat(numberMatch[1]);
            fieldConfidences[key] = 0.72;
            matchCount++;
          }
          break;
        case 'boolean':
          const boolMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*(true|false|yes|no)`, 'i'));
          if (boolMatch && boolMatch[1]) {
            params[key] = boolMatch[1].toLowerCase() === 'true' || boolMatch[1].toLowerCase() === 'yes';
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
        postProcessed.supplementedFields,
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
  ): boolean {
    if (key.includes('[]') && Array.isArray(value)) {
      return value.length > 0 && value.every((item) => item !== null && item !== undefined && this.validateType(item, expectedType));
    }
    if (value === null || value === undefined) {
      return false;
    }
    return this.validateType(value, expectedType);
  }

  private postProcessRecognizedParams(
    params: Record<string, unknown>,
    properties: Record<string, ParamSchemaProperty>,
    userInput: string,
  ): { params: Record<string, unknown>; supplementedFields: Set<string> } {
    const normalizedParams: Record<string, unknown> = {};
    const supplementedFields = new Set<string>();

    for (const [key, value] of Object.entries(params)) {
      if (!properties[key]) {
        continue;
      }

      const normalizedValue = this.normalizeRecognizedValue(key, value, properties[key].type);
      if (normalizedValue === undefined) {
        continue;
      }
      const schemaCompatibleValue = this.normalizeSchemaCompatibleValue(
        key,
        normalizedValue,
        properties[key],
      );
      if (schemaCompatibleValue === undefined) {
        continue;
      }
      if (this.validateRecognizedValue(key, schemaCompatibleValue, properties[key].type)) {
        normalizedParams[key] = schemaCompatibleValue;
      }
    }

    this.supplementMissingSemanticParams(normalizedParams, properties, userInput, supplementedFields);
    return {
      params: normalizedParams,
      supplementedFields,
    };
  }

  private normalizeFieldConfidences(
    value: unknown,
    properties: Record<string, ParamSchemaProperty>,
  ): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, score]) => {
      if (!properties[key] || typeof score !== 'number' || Number.isNaN(score)) {
        return acc;
      }
      acc[key] = Math.max(0, Math.min(1, score));
      return acc;
    }, {});
  }

  private normalizeUncertainFields(
    value: unknown,
    properties: Record<string, ParamSchemaProperty>,
  ): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string' && Boolean(properties[item]))
      .filter((item, index, array) => array.indexOf(item) === index);
  }

  private completeFieldConfidences(
    params: Record<string, unknown>,
    base: Record<string, number>,
    supplementedFields: Set<string> = new Set(),
  ): Record<string, number> {
    return Object.keys(params).reduce<Record<string, number>>((acc, key) => {
      if (typeof base[key] === 'number') {
        acc[key] = base[key];
        return acc;
      }
      if (supplementedFields.has(key)) {
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
  ): unknown {
    if (key.includes('[]') && !Array.isArray(value) && this.validateType(value, expectedType)) {
      return [value];
    }

    if (Array.isArray(value)) {
      const normalizedArray = value
        .map((item) => this.normalizeScalarValue(item, expectedType))
        .filter((item) => item !== undefined);
      return normalizedArray.length > 0 ? normalizedArray : undefined;
    }

    return this.normalizeScalarValue(value, expectedType);
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
    schema: ParamSchemaProperty,
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

    return /验收/.test(normalized) && (
      /(到货|收货|安装|调试|性能)/.test(normalized)
      || /(先|后|再|\+)/.test(normalized)
    );
  }

  private isPlaceholderTextValue(value: string): boolean {
    return isPlaceholderTextValue(value);
  }

  private supplementMissingSemanticParams(
    params: Record<string, unknown>,
    properties: Record<string, ParamSchemaProperty>,
    userInput: string,
    supplementedFields: Set<string>,
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

      const inferred = this.inferFieldValueFromText(key, schema, userInput);
      if (inferred === undefined) {
        continue;
      }

      const normalized = this.normalizeRecognizedValue(key, inferred, schema.type);
      if (normalized !== undefined && this.validateRecognizedValue(key, normalized, schema.type)) {
        params[key] = normalized;
        supplementedFields.add(key);
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

  private inferFieldValueFromText(
    key: string,
    schema: ParamSchemaProperty,
    userInput: string,
  ): string | undefined {
    const extractionHints = Array.isArray(schema.extractionHints) ? schema.extractionHints.join(' ') : '';
    const hintText = `${key} ${schema.description || ''} ${schema.extractionPrompt || ''} ${extractionHints}`;

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

  private extractBatchValue(input: string): string | undefined {
    const match = input.match(/(首批|第[一二三四五六七八九十百千0-9]+批)/);
    return match?.[1];
  }

  private extractLocationValue(input: string): string | undefined {
    const patterns = [
      /(?:交付地点|交货地点|收货地址|交付地址|到货地点|送达地点)[为是:：]?\s*([^，。；\n]+)/,
      /(?:地点为|地址为)[：: ]?\s*([^，。；\n]+)/,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
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

  /**
   * Batch parameter recognition for multiple inputs
   */
  async batchRecognizeParams(
    inputs: RecognizeParamsDTO[],
  ): Promise<RecognizeParamsResponseDTO[]> {
    return Promise.all(inputs.map((input) => this.recognizeParams(input)));
  }
}
