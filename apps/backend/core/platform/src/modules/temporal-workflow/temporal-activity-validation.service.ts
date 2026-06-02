import { Injectable } from '@nestjs/common';
import { ActivityFormData, ActivityValidationResult } from './temporal-activity.types';
import { normalizeInputParams } from './temporal-activity-execution.helpers';

@Injectable()
export class ActivityValidationService {
  async validate(config: ActivityFormData): Promise<ActivityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!config.name || config.name.trim() === '') {
      errors.push('Activity name is required');
    } else if (config.name.length > 255) {
      errors.push('Activity name must be less than 255 characters');
    }

    if (!config.fn || config.fn.trim() === '') {
      errors.push('Function name is required');
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.fn)) {
      errors.push('Function name must be a valid identifier');
    }

    const validHandlers = ['api', 'carbone', 'browser', 'script'];
    if (!config.handler || !validHandlers.includes(config.handler)) {
      errors.push(`Handler must be one of: ${validHandlers.join(', ')}`);
    }

    if (config.timeout) {
      const timeoutRegex = /^\d+[smh]$/;
      if (!timeoutRegex.test(config.timeout)) {
        errors.push('Timeout must be in format: 30s, 1m, 1h');
      }
    }

    // Handle validation based on whether steps are defined
    const steps: any[] = config.config?.steps || [];
    if (steps.length > 0) {
      // Validate each step
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.name) {
          errors.push(`Step ${i + 1} is missing a name`);
        }
        if (!step.type || !validHandlers.includes(step.type)) {
          errors.push(`Step ${i + 1} has invalid handler type`);
        }
        if (step.type === 'api' && !step.config?.endpoint) {
          errors.push(`Step ${i + 1} (API) requires endpoint in config`);
        }
        if (step.type === 'script' && !step.config?.script) {
          errors.push(`Step ${i + 1} (Script) requires script in config`);
        }
        const inputParams = normalizeInputParams(step.inputParams);
        inputParams.forEach((param, paramIndex) => {
          if (!param.key.trim()) {
            errors.push(`Step ${i + 1} input param ${paramIndex + 1} is missing a key`);
          }
        });
      }
      suggestions.push('Steps are defined - AI code will be generated based on step configurations');
    } else {
      // No steps - validate at top level (legacy behavior)
      switch (config.handler) {
        case 'api':
          if (!config.config?.endpoint) {
            errors.push('API handler requires endpoint in config');
          }
          break;
        case 'script':
          if (!config.config?.script) {
            errors.push('Script handler requires script in config');
          }
          break;
      }
    }

    if (config.retryPolicy && config.retryPolicy.maxRetries < 0) {
      errors.push('maxRetries must be non-negative');
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return { isValid: errors.length === 0, score, errors, warnings, suggestions };
  }
}
