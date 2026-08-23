import { Injectable, Logger } from '@nestjs/common';
import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import { LlmOperationError } from '../registry/errors';
import { resolvePrimaryTextValue, stripModelThinking } from './primary-text-output-normalizer';

export const OUTPUT_PARSE_FAILED = 'OUTPUT_PARSE_FAILED';
export const OUTPUT_SCHEMA_VIOLATION = 'OUTPUT_SCHEMA_VIOLATION';

type JsonParseResult = { ok: true; value: unknown } | { ok: false };

function tryParseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function parseJsonFromText(text: string): unknown {
  const trimmed = stripModelThinking(text);

  // Try direct JSON parse
  const direct = tryParseJson(trimmed);
  if (direct.ok) return direct.value;

  // Extract from code blocks
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const codeBlock = tryParseJson(codeBlockMatch[1].trim());
    if (codeBlock.ok) return codeBlock.value;
  }

  // Extract first outermost JSON object {...}
  const jsonObjectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    const jsonObject = tryParseJson(jsonObjectMatch[0].trim());
    if (jsonObject.ok) return jsonObject.value;
  }

  throw new Error('No valid JSON found in output');
}

@Injectable()
export class OutputValidatorService {
  constructor(private readonly logger: Logger) {}

  public parseAndValidate(
    rawContent: string,
    outputSchema: Record<string, unknown> | null,
    inputContext?: Record<string, unknown>
  ): { data: Record<string, unknown>; schemaValidated: boolean } {
    let data: unknown;
    try {
      data = parseJsonFromText(rawContent);
    } catch (err: unknown) {
      // A declared primary string output (or a single-string contract) lets the
      // deterministic boundary wrap bare business text without another model
      // call. The resulting object is still validated against the full schema.
      const fallback = this.buildTextOutputFallback(rawContent, outputSchema);
      if (fallback) {
        this.logger.warn(
          `Model output was not JSON; wrapping raw text into primary field ${Object.keys(fallback)[0]}`
        );
        data = fallback;
      } else {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to parse JSON from model output: ${errorMessage}`);
        throw new LlmOperationError(
          OUTPUT_PARSE_FAILED,
          `Failed to parse JSON from model output: ${errorMessage}`
        );
      }
    }

    if (!outputSchema) {
      if (!this.isRecord(data)) {
        throw new LlmOperationError(
          OUTPUT_PARSE_FAILED,
          'Model output must be a JSON object when no output schema is declared'
        );
      }
      this.logger.debug('Output schema is null, skipping validation (fail-open)');
      return { data, schemaValidated: false };
    }

    // Project parsed data to only the keys declared in the output schema.
    // This prevents additionalProperties validation errors when the model
    // returns extra fields alongside the required ones.
    const projectedData = this.normalizeToSchema(data, outputSchema, inputContext);

    const result = jsonSchemaValidator.validateOutput(projectedData, outputSchema);
    if (!result.valid) {
      const errorMessages =
        result.errors?.map((e) => `${e.path}: ${e.message}`).join('; ') ||
        'Unknown validation error';
      this.logger.warn(`Output schema validation failed: ${errorMessages}`);
      throw new LlmOperationError(
        OUTPUT_SCHEMA_VIOLATION,
        `Output schema validation failed: ${errorMessages}`,
        {
          errors: result.errors,
        }
      );
    }

    return { data: projectedData, schemaValidated: true };
  }

  public buildRepairPrompt(
    systemTemplate: string,
    previousRawOutput: string,
    outputMode: 'json' | 'text' = 'json'
  ): string {
    if (outputMode === 'text') {
      return `The previous business text failed output validation. Follow the original instructions and respond with ONLY the corrected business text — no JSON wrapper, no code fences, no explanatory text.

Original instructions:
${systemTemplate}

Previous output:
${previousRawOutput}`;
    }
    return `The previous output failed schema validation. Respond with ONLY a valid JSON object that conforms to the schema — no markdown, no code fences, no explanatory text.\n\nPrevious output:\n${previousRawOutput}`;
  }

  /**
   * Wraps a non-JSON answer only when the schema identifies an unambiguous
   * string primary output. Remaining required metadata is filled solely from
   * schema-declared deterministic sources, then the full contract is checked.
   */
  private buildTextOutputFallback(
    rawContent: string,
    outputSchema: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!outputSchema) return null;
    const props = this.isRecord(outputSchema.properties) ? outputSchema.properties : undefined;
    if (!props) return null;
    const primaryOutput = this.resolvePrimaryOutput(outputSchema, props);
    if (!primaryOutput) return null;
    const primaryProperty = props[primaryOutput] as Record<string, unknown> | undefined;
    const declaredType = primaryProperty?.type;
    const isStringType =
      declaredType === 'string' || (Array.isArray(declaredType) && declaredType.includes('string'));
    if (!isStringType) return null;
    const cleaned = stripModelThinking(rawContent);
    if (!cleaned) return null;
    // A JSON-looking response that failed parsing is a broken protocol frame,
    // not plain business text. Fail closed so the bounded repair path can fix
    // it instead of leaking wrappers such as `{\"summary\": ...` to users or
    // downstream Skills.
    if (/^(?:```(?:json)?\s*)?(?:\{|\[)/i.test(cleaned)) return null;
    return { [primaryOutput]: cleaned };
  }

  /**
   * Projects model output to declared keys, maps one unambiguous string value
   * to primaryOutput, and copies deterministic metadata from declared inputs.
   */
  private normalizeToSchema(
    data: unknown,
    schema: Record<string, unknown>,
    inputContext?: Record<string, unknown>
  ): Record<string, unknown> {
    const schemaProps = this.isRecord(schema.properties) ? schema.properties : undefined;
    if (!schemaProps || Object.keys(schemaProps).length === 0) {
      return this.isRecord(data) ? data : {};
    }
    const projected: Record<string, unknown> = {};
    if (this.isRecord(data)) {
      for (const key of Object.keys(schemaProps)) {
        if (key in data) {
          projected[key] = data[key];
        }
      }
    }

    const primaryOutput = this.resolvePrimaryOutput(schema, schemaProps);
    const primaryProperty = primaryOutput
      ? (schemaProps[primaryOutput] as Record<string, unknown> | undefined)
      : undefined;
    const primaryType = primaryProperty?.type;
    const primaryIsString =
      primaryType === 'string' || (Array.isArray(primaryType) && primaryType.includes('string'));
    const projectedPrimary = primaryOutput ? projected[primaryOutput] : undefined;
    const primaryNeedsNormalization =
      Boolean(primaryOutput && primaryIsString) &&
      (typeof projectedPrimary !== 'string' || projectedPrimary.trim().length === 0);
    if (primaryOutput && primaryNeedsNormalization) {
      const candidate = resolvePrimaryTextValue(data, primaryOutput);
      if (candidate !== undefined) {
        projected[primaryOutput] = candidate;
        this.logger.warn(
          `Normalized model text field to declared primary output '${primaryOutput}'`
        );
      }
    }

    for (const [key, rawProperty] of Object.entries(schemaProps)) {
      if (key in projected) continue;
      const property = rawProperty as Record<string, unknown>;
      const inputField = property['x-ops-copy-from-input'];
      if (
        typeof inputField === 'string' &&
        inputContext &&
        Object.prototype.hasOwnProperty.call(inputContext, inputField)
      ) {
        projected[key] = inputContext[inputField];
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(property, 'default')) {
        projected[key] = property.default;
      }
    }
    return projected;
  }

  private resolvePrimaryOutput(
    schema: Record<string, unknown>,
    properties: Record<string, unknown>
  ): string | undefined {
    const declared = schema.primaryOutput;
    if (typeof declared === 'string' && declared in properties) return declared;
    const keys = Object.keys(properties);
    return keys.length === 1 ? keys[0] : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
