import { Injectable, Logger } from '@nestjs/common';
import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import { LlmOperationError } from '../registry/errors';

export const INPUT_SCHEMA_VIOLATION = 'INPUT_SCHEMA_VIOLATION';

@Injectable()
export class InputValidatorService {
  constructor(private readonly logger: Logger) {}

  public validate(input: Record<string, unknown>, schema: Record<string, unknown> | null): void {
    if (!schema) {
      this.logger.debug('Input schema is null, skipping validation (fail-open)');
      return;
    }

    const result = jsonSchemaValidator.validateInput(input, schema);
    if (!result.valid) {
      const errorMessages = result.errors?.map(e => `${e.path}: ${e.message}`).join('; ') || 'Unknown validation error';
      this.logger.warn(`Input schema validation failed: ${errorMessages}`);
      throw new LlmOperationError(INPUT_SCHEMA_VIOLATION, `Input schema validation failed: ${errorMessages}`, {
        errors: result.errors,
      });
    }
  }
}