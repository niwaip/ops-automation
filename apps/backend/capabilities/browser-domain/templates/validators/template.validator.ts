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
        const validActions = [
          'click',
          'fill',
          'navigate',
          'wait',
          'select',
          'check',
          'screenshot',
          'assert',
          'search',
          'smart_search',
          'hover',
          'press',
          'press_key',
          'scroll',
          'type_text',
          'get_text',
          'snapshot',
          'read_page',
          'list_search_results',
          'click_result',
          'switch_latest_tab',
          'close_tab',
          'read_value',
          'branch',
          'takeover_gate',
        ];
        if (!validActions.includes(step.action)) {
          errors.push(`Step "${step.step_id}" has invalid action "${step.action}"`);
        }

        // Locator validation for actions that require locators
        const locatorRequiredActions = ['click', 'fill', 'select', 'check', 'read_value'];
        if (locatorRequiredActions.includes(step.action) && !step.locator) {
          errors.push(`Step "${step.step_id}" with action "${step.action}" requires a locator`);
        }

        if (step.action === 'read_value') {
          if (!step.output_var || step.output_var.trim() === '') {
            errors.push(`Step "${step.step_id}" with action "read_value" requires output_var`);
          }

          const method = step.params?.method;
          if (
            method !== undefined &&
            !['innerText', 'textContent', 'value', 'attribute', 'visible'].includes(
              String(method)
            )
          ) {
            errors.push(
              `Step "${step.step_id}" with action "read_value" has invalid params.method "${String(method)}"`
            );
          }

          if (
            step.params?.method === 'attribute' &&
            (!step.params?.attribute || String(step.params.attribute).trim() === '')
          ) {
            errors.push(
              `Step "${step.step_id}" with action "read_value" requires params.attribute when method is "attribute"`
            );
          }
        }

        if (step.action === 'branch') {
          if (!step.branch) {
            errors.push(`Step "${step.step_id}" with action "branch" requires branch config`);
          } else {
            if (!step.branch.condition_fn || step.branch.condition_fn.trim() === '') {
              errors.push(`Step "${step.step_id}" branch config requires condition_fn`);
            }

            if (!['continue', 'stop'].includes(step.branch.on_match)) {
              errors.push(
                `Step "${step.step_id}" branch config has invalid on_match "${String(step.branch.on_match)}"`
              );
            }

            if (!['continue', 'stop', 'takeover'].includes(step.branch.on_mismatch)) {
              errors.push(
                `Step "${step.step_id}" branch config has invalid on_mismatch "${String(step.branch.on_mismatch)}"`
              );
            }

            if (step.branch.on_mismatch === 'takeover' && !step.branch.takeover_reason?.trim()) {
              warnings.push(
                `Step "${step.step_id}" branch config should provide takeover_reason when on_mismatch is "takeover"`
              );
            }
          }
        }

        if (step.action === 'takeover_gate') {
          const takeoverReason = step.params?.takeover_reason ?? step.params?.reason;
          if (takeoverReason !== undefined && String(takeoverReason).trim() === '') {
            errors.push(
              `Step "${step.step_id}" with action "takeover_gate" has an empty takeover reason`
            );
          }
        }

        if (
          step.execution_policy &&
          ![
            'auto_execute',
            'require_confirmation',
            'require_takeover',
            'forbid_in_replay',
          ].includes(step.execution_policy)
        ) {
          errors.push(
            `Step "${step.step_id}" has invalid execution_policy "${String(step.execution_policy)}"`
          );
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
        if (FORBIDDEN_PARAM_NAMES.some((forbidden) => lowerParamName.includes(forbidden))) {
          errors.push(
            `Forbidden parameter name "${paramName}" detected. Templates cannot contain password/secret parameters.`
          );
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
      const stepIds = template.steps.map((s) => s.step_id);
      const duplicates = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate step IDs found: ${duplicates.join(', ')}`);
      }
    }

    // 6. Validate idempotency keys uniqueness
    if (template.steps) {
      const idempotencyKeys = template.steps
        .filter((s) => s.idempotency_key)
        .map((s) => s.idempotency_key!);
      const duplicateKeys = idempotencyKeys.filter(
        (key, index) => idempotencyKeys.indexOf(key) !== index
      );
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
        if (FORBIDDEN_PARAM_NAMES.some((forbidden) => lowerParamName.includes(forbidden))) {
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
