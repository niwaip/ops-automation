import { Injectable } from '@nestjs/common';
import { BrowserActionStep, BrowserRuntimeParamBinding } from '../domain/browser-step.types';

@Injectable()
export class BrowserSchemaService {
  /**
   * Generates a JSON Schema from a sequence of steps
   */
  generateParamsSchema(steps: BrowserActionStep[]): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    const allBindings = this.collectUserInputBindings(steps);

    for (const binding of allBindings) {
      if (!properties[binding.name]) {
        properties[binding.name] = {
          type: this.inferType(binding.value),
          description: binding.description || `Parameter ${binding.name}`,
          ...(binding.secret ? { format: 'password' } : {}),
          default: binding.value,
        };

        if (binding.required) {
          required.push(binding.name);
        }
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  private collectUserInputBindings(steps: BrowserActionStep[]): BrowserRuntimeParamBinding[] {
    const bindings: BrowserRuntimeParamBinding[] = [];
    const seenNames = new Set<string>();

    for (const step of steps) {
      if (step.paramBindings) {
        for (const binding of step.paramBindings) {
          if (
            (binding.source === 'user_input' || binding.source === 'secret') &&
            !seenNames.has(binding.name)
          ) {
            bindings.push(binding);
            seenNames.add(binding.name);
          }
        }
      }
    }

    return bindings;
  }

  private inferType(value: any): string {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (value && typeof value === 'object') return 'object';
    return 'string';
  }
}
