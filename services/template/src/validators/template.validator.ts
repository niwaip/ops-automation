import { Injectable } from '@nestjs/common';
import { TemplateJSON, ValidationResult, FORBIDDEN_PARAM_NAMES } from '../types/template.types';
import { LocatorValidator } from './locator.validator';

@Injectable()
export class TemplateValidator {
  constructor(private readonly locatorValidator: LocatorValidator) {}

  /**
   * Validate entire template structure
   */
  validate(template: TemplateJSON): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate required fields
    if (!template.id) {
      errors.push('Template ID is required');
    }
    if (!template.name || template.name.trim() === '') {
      errors.push('Template name is required');
    }
    if (!template.version) {
      errors.push('Template version is required');
    }
    if (!template.status) {
      errors.push('Template status is required');
    }

    // 2. Validate step IDs format
    if (!template.steps || template.steps.length === 0) {
      warnings.push('Template has no steps defined');
    } else {
      for (const step of template.steps) {
        // Step ID format check: step_{number}
        if (!step.step_id) {
          errors.push(`Step missing step_id`);
        } else if (!/^step_\d+$/.test(step.step_id)) {
          errors.push(`Step ID "${step.step_id}" does not match format "step_{number}"`);
        }

        // Action validation
        const validActions = ['click', 'fill', 'navigate', 'wait', 'select', 'check', 'screenshot', 'assert'];
        if (!validActions.includes(step.action)) {
          errors.push(`Step "${step.step_id}" has invalid action "${step.action}"`);
        }

        // Locator validation for actions that require locators
        const locatorRequiredActions = ['click', 'fill', 'select', 'check'];
        if (locatorRequiredActions.includes(step.action) && !step.locator) {
          errors.push(`Step "${step.step_id}" with action "${step.action}" requires a locator`);
        }

        // Validate locators
        const locatorResult = this.locatorValidator.validateStepLocators(step);
        errors.push(...locatorResult.errors);
        warnings.push(...locatorResult.warnings);
      }
    }

    // 3. Validate params_schema - check for forbidden parameter names (security)
    if (template.params_schema && template.params_schema.properties) {
      for (const paramName of Object.keys(template.params_schema.properties)) {
        const lowerParamName = paramName.toLowerCase();
        if (FORBIDDEN_PARAM_NAMES.some(forbidden => lowerParamName.includes(forbidden))) {
          errors.push(`Forbidden parameter name "${paramName}" detected. Templates cannot contain password/secret parameters.`);
        }
      }

      // Check required array
      if (template.params_schema.required && !Array.isArray(template.params_schema.required)) {
        errors.push('params_schema.required must be an array');
      }
    }

    // 4. Validate state machine constraints
    // PUBLISHED templates must have at least one step
    if (template.status === 'PUBLISHED' && (!template.steps || template.steps.length === 0)) {
      errors.push('PUBLISHED templates must have at least one step');
    }

    // 5. Validate step uniqueness
    if (template.steps) {
      const stepIds = template.steps.map(s => s.step_id);
      const duplicates = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate step IDs found: ${duplicates.join(', ')}`);
      }
    }

    // 6. Validate idempotency keys uniqueness
    if (template.steps) {
      const idempotencyKeys = template.steps
        .filter(s => s.idempotency_key)
        .map(s => s.idempotency_key!);
      const duplicateKeys = idempotencyKeys.filter((key, index) => idempotencyKeys.indexOf(key) !== index);
      if (duplicateKeys.length > 0) {
        errors.push(`Duplicate idempotency_keys found: ${duplicateKeys.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Quick validation for compile output
   */
  validateCompileOutput(template: Partial<TemplateJSON>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.steps || template.steps.length === 0) {
      errors.push('Compiled template has no steps');
    }

    if (template.steps) {
      for (const step of template.steps) {
        const locatorResult = this.locatorValidator.validateStepLocators(step);
        errors.push(...locatorResult.errors);
        warnings.push(...locatorResult.warnings);
      }
    }

    if (template.params_schema?.properties) {
      for (const paramName of Object.keys(template.params_schema.properties)) {
        const lowerParamName = paramName.toLowerCase();
        if (FORBIDDEN_PARAM_NAMES.some(forbidden => lowerParamName.includes(forbidden))) {
          errors.push(`Forbidden parameter "${paramName}" in compiled template`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}