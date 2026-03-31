import { Injectable } from '@nestjs/common';
import { RecognizeParamsDTO, RecognizeParamsResponseDTO, ChatMessage } from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';

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
  private templates: Map<string, TemplateSchema> = new Map();
  private defaultClient: OpenAICompatibleClient | null = null;

  /**
   * Set the default AI client for parameter recognition
   */
  setDefaultClient(client: OpenAICompatibleClient): void {
    this.defaultClient = client;
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
    const template = this.templates.get(dto.template_id);
    if (!template) {
      // Return empty params with low confidence if template not found
      return {
        params: {},
        confidence: 0,
      };
    }

    const paramsSchema = template.params_schema;
    const properties = paramsSchema.properties;

    // Build system prompt for parameter extraction
    const systemPrompt = this.buildSystemPrompt(template);

    // Build messages for the AI
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildUserPrompt(dto, properties) },
    ];

    // If no client is available, use basic pattern matching
    if (!this.defaultClient) {
      return this.basicPatternMatching(dto.user_input, properties);
    }

    try {
      const response = await this.defaultClient.chatCompletion(messages);
      return this.parseAIResponse(response, properties);
    } catch (error) {
      // Fallback to basic pattern matching on AI failure
      return this.basicPatternMatching(dto.user_input, properties);
    }
  }

  /**
   * Build system prompt for parameter extraction
   */
  private buildSystemPrompt(template: TemplateSchema): string {
    const params = Object.entries(template.params_schema.properties)
      .map(([name, schema]) => `- ${name}: ${schema.type}${schema.description ? ` (${schema.description})` : ''}`)
      .join('\n');

    return `You are a parameter extraction assistant. Given a user's input, extract the following parameters for the template "${template.name}":
${params}

Return the extracted parameters as a JSON object. If you cannot confidently extract a parameter, omit it from the response. Also include a confidence score (0-1) for each parameter extraction.

Response format:
{
  "params": { ... extracted parameters ... },
  "confidence": <overall confidence score 0-1>
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
          if (stringMatch) {
            params[key] = stringMatch[1].trim();
            matchCount++;
          }
          break;
        case 'number':
          const numberMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*(\\d+(\\.\\d+)?)`, 'i'));
          if (numberMatch) {
            params[key] = parseFloat(numberMatch[1]);
            matchCount++;
          }
          break;
        case 'boolean':
          const boolMatch = input.match(new RegExp(`${key}[\\s]*[=:][\\s]*(true|false|yes|no)`, 'i'));
          if (boolMatch) {
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