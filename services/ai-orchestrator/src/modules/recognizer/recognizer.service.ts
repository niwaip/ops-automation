import { Injectable, Logger } from '@nestjs/common';
import { RecognizeParamsDTO, RecognizeParamsResponseDTO, ChatMessage } from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';
import { ModelService } from '../model/model.service';

/**
 * Template schema interface for parameter recognition
 */
interface TemplateSchema {
  template_id: string;
  name: string;
  params_schema: {
    properties: Record<string, {
      type: string;
      description?: string;
      required?: boolean;
    }>;
    required?: string[];
  };
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
  setDefaultClient(client: OpenAICompatibleClient): void {
    // Legacy method - no longer needed as we use ModelService
    this.logger.warn('setDefaultClient is deprecated, using ModelService instead');
  }

  /**
   * Get the default AI client from ModelService
   */
  private async getDefaultClient(): Promise<OpenAICompatibleClient | null> {
    // Get the first available active model's client
    const models = await this.modelService.listModels();
    const activeModels = models.filter(m => m.status === 'active');
    if (activeModels.length === 0) {
      return null;
    }
    // Use the first active model's client
    return this.modelService.getClient(activeModels[0].id);
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
    let properties: Record<string, { type: string; description?: string }> = {};
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
    const systemPrompt = this.buildSystemPromptFromSchema(templateName, properties);

    // Build messages for the AI
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildUserPrompt(dto, properties) },
    ];

    // Get the default AI client from ModelService
    const client = await this.getDefaultClient();
    if (!client) {
      this.logger.warn('No AI client available, using basic pattern matching');
      return this.basicPatternMatching(dto.user_input, properties);
    }

    try {
      const response = await client.chatCompletion(messages);
      return this.parseAIResponse(response, properties);
    } catch (error) {
      this.logger.error(`AI call failed: ${error}`);
      // Fallback to basic pattern matching on AI failures
      return this.basicPatternMatching(dto.user_input, properties);
    }
  }

  /**
   * Build system prompt for parameter extraction from schema
   */
  private buildSystemPromptFromSchema(
    templateName: string,
    properties: Record<string, { type: string; description?: string; default?: string | number | boolean }>,
  ): string {
    const params = Object.entries(properties)
      .map(([name, schema]) => {
        const defaultStr = schema.default !== undefined ? ` (默认值: ${schema.default})` : '';
        return `- ${name}: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}${defaultStr}`;
      })
      .join('\n');

    return `你是一个参数提取助手。根据用户的输入，为模版"${templateName}"提取以下参数：
${params}

请返回提取的参数作为 JSON 对象。如果你不能确定某个参数的值，请省略它。
同时返回整体置信度分数（0-1）。

响应格式：
{
  "params": { ... 提取的参数 ... },
  "confidence": <整体置信度分数 0-1>
}`;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(
    dto: RecognizeParamsDTO,
    properties: Record<string, { type: string; description?: string }>,
  ): string {
    let prompt = `User input: "${dto.user_input}"`;

    if (dto.context) {
      prompt += `\n\nAdditional context: ${JSON.stringify(dto.context)}`;
    }

    prompt += `\n\nExtract the following parameters: ${Object.keys(properties).join(', ')}`;

    return prompt;
  }

  /**
   * Parse AI response and validate against schema
   */
  private parseAIResponse(
    response: string,
    properties: Record<string, { type: string; description?: string }>,
  ): RecognizeParamsResponseDTO {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { params: {}, confidence: 0 };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const params = parsed.params || parsed;
      const confidence = parsed.confidence || 0.5;

      // Validate and filter params against schema
      const validatedParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        if (properties[key]) {
          // Type validation
          const expectedType = properties[key].type;
          if (this.validateType(value, expectedType)) {
            validatedParams[key] = value;
          }
        }
      }

      return {
        params: validatedParams,
        confidence: Math.max(0, Math.min(1, confidence)),
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
    properties: Record<string, { type: string; description?: string }>,
  ): RecognizeParamsResponseDTO {
    const params: Record<string, unknown> = {};
    let matchCount = 0;

    for (const [key, schema] of Object.entries(properties)) {
      switch (schema.type) {
        case 'string':
          // Look for quoted strings or common patterns
          const stringMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*["']?([^"'\n,]+)["']?`, 'i'));
          if (stringMatch && stringMatch[1]) {
            params[key] = stringMatch[1].trim();
            matchCount++;
          }
          break;
        case 'number':
          const numberMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*(\\d+(\\.\\d+)?)`, 'i'));
          if (numberMatch && numberMatch[1]) {
            params[key] = parseFloat(numberMatch[1]);
            matchCount++;
          }
          break;
        case 'boolean':
          const boolMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*(true|false|yes|no)`, 'i'));
          if (boolMatch && boolMatch[1]) {
            params[key] = boolMatch[1].toLowerCase() === 'true' || boolMatch[1].toLowerCase() === 'yes';
            matchCount++;
          }
          break;
      }
    }

    const totalParams = Object.keys(properties).length;
    const confidence = totalParams > 0 ? matchCount / totalParams : 0;

    return { params, confidence };
  }

  /**
   * Validate value type against expected schema type
   */
  private validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value as number);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
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