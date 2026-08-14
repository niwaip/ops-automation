import { Injectable, Logger } from '@nestjs/common';
import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import { LlmOperationError } from '../registry/errors';

export const OUTPUT_PARSE_FAILED = 'OUTPUT_PARSE_FAILED';
export const OUTPUT_SCHEMA_VIOLATION = 'OUTPUT_SCHEMA_VIOLATION';

function parseJsonFromText(text: string): Record<string, unknown> {
  let trimmed = (text || '').trim();

  // Strip reasoning / thinking tags (e.g. <think>...</think>)
  trimmed = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Try direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Extract from code blocks
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // Extract first outermost JSON object {...}
  const jsonObjectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0].trim());
    } catch {}
  }

  throw new Error('No valid JSON found in output');
}

@Injectable()
export class OutputValidatorService {
  constructor(private readonly logger: Logger) {}

  public parseAndValidate(
    rawContent: string,
    outputSchema: Record<string, unknown> | null,
  ): { data: Record<string, unknown>; schemaValidated: boolean } {
    let data: Record<string, unknown>;
    try {
      data = parseJsonFromText(rawContent);
    } catch (err: any) {
      this.logger.warn(`Failed to parse JSON from model output: ${err.message}`);
      throw new LlmOperationError(OUTPUT_PARSE_FAILED, `Failed to parse JSON from model output: ${err.message}`);
    }

    if (!outputSchema) {
      this.logger.debug('Output schema is null, skipping validation (fail-open)');
      return { data, schemaValidated: false };
    }

    // Project parsed data to only the keys declared in the output schema.
    // This prevents additionalProperties validation errors when the model
    // returns extra fields alongside the required ones.
    const projectedData = this.projectToSchemaKeys(data, outputSchema);

    const result = jsonSchemaValidator.validateOutput(projectedData, outputSchema);
    if (!result.valid) {
      const errorMessages = result.errors?.map(e => `${e.path}: ${e.message}`).join('; ') || 'Unknown validation error';
      this.logger.warn(`Output schema validation failed: ${errorMessages}`);
      throw new LlmOperationError(OUTPUT_SCHEMA_VIOLATION, `Output schema validation failed: ${errorMessages}`, {
        errors: result.errors,
      });
    }

    return { data: projectedData, schemaValidated: true };
  }

  public buildRepairPrompt(systemTemplate: string, previousRawOutput: string): string {
    return `The previous output failed schema validation. Previous output:\n${previousRawOutput}\n\nPlease output strict JSON conforming to the schema.`;
  }

  /**
   * Project raw LLM output to only the top-level keys declared in the schema's
   * `properties`. Extra keys from the model are silently dropped, which avoids
   * spurious additionalProperties errors without changing the schema contract.
   */
  private projectToSchemaKeys(
    data: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const schemaProps = (schema as any)?.properties as Record<string, unknown> | undefined;
    if (!schemaProps || Object.keys(schemaProps).length === 0) {
      return data;
    }
    const projected: Record<string, unknown> = {};
    for (const key of Object.keys(schemaProps)) {
      if (key in data) {
        projected[key] = data[key];
      }
    }
    return projected;
  }
}