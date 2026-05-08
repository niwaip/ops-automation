import { Injectable } from '@nestjs/common';
import { Locator, TemplateStep, LocatorType, LOCATOR_PRIORITY } from '../types/template.types';

@Injectable()
export class LocatorValidator {
  /**
   * Validate a single locator
   * Returns warnings for low-priority locators (css, xpath)
   */
  validateLocator(locator: Locator): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!locator) {
      return { errors, warnings };
    }

    // Check locator type is valid
    const validTypes: LocatorType[] = ['role', 'text', 'test-id', 'css', 'xpath', 'ref'];
    if (!validTypes.includes(locator.type)) {
      errors.push(`Invalid locator type "${locator.type}". Must be one of: ${validTypes.join(', ')}`);
    }

    // Check locator value is not empty
    if (!locator.value || locator.value.trim() === '') {
      errors.push(`Locator value cannot be empty`);
    }

    // Warning for low-priority locators
    if (locator.type === 'css' || locator.type === 'xpath') {
      warnings.push(
        `Using "${locator.type}" locator is discouraged. Prefer role > text > test-id for better stability.`
      );
    }

    // Validate fallback locator if present
    if (locator.fallback) {
      const fallbackResult = this.validateLocator(locator.fallback);
      errors.push(...fallbackResult.errors.map(e => `Fallback locator: ${e}`));
      warnings.push(...fallbackResult.warnings.map(w => `Fallback locator: ${w}`));
    }

    return { errors, warnings };
  }

  /**
   * Check if locator strategy is compliant (role/text/test-id preferred)
   */
  isLocatorCompliant(locator: Locator): boolean {
    if (!locator) return true;
    return LOCATOR_PRIORITY[locator.type] <= 3;
  }

  /**
   * Get locator priority score
   */
  getLocatorPriority(locator: Locator): number {
    if (!locator) return 0;
    return LOCATOR_PRIORITY[locator.type] || 5;
  }

  /**
   * Validate all locators in a step
   */
  validateStepLocators(step: TemplateStep): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (step.locator) {
      const result = this.validateLocator(step.locator);
      errors.push(...result.errors.map(e => `Step "${step.step_id}": ${e}`));
      warnings.push(...result.warnings.map(w => `Step "${step.step_id}": ${w}`));
    }

    // Check assertions for locators
    if (step.assertions) {
      for (const assertion of step.assertions) {
        if (assertion.locator) {
          const result = this.validateLocator(assertion.locator);
          errors.push(...result.errors.map(e => `Step "${step.step_id}" assertion: ${e}`));
          warnings.push(...result.warnings.map(w => `Step "${step.step_id}" assertion: ${w}`));
        }
      }
    }

    return { errors, warnings };
  }
}
