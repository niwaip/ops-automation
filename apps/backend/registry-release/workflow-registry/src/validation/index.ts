export type {
  StepAnalysis,
  ValidationResult,
} from '../flow-template';
export {
  ExecutionFlowValidationFacadeService,
  ExecutionFlowValidationHttpService,
  ExecutionFlowValidationService,
} from '../flow-template';

import type { ValidationResult } from '../flow-template';

export interface TemporalValidationResult {
  isValid?: boolean;
  score?: number;
  errors: string[];
  warnings: string[];
  [key: string]: any;
}

export interface ActivityValidationResult {
  isValid?: boolean;
  score?: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  [key: string]: any;
}

export function isExecutionFlowValidationPassed(
  result: ValidationResult,
  minimumScore = 60,
): boolean {
  return result.isValid && (result.score ?? minimumScore) >= minimumScore;
}

export function collectTemporalValidationMessages(
  result: TemporalValidationResult,
): string[] {
  return [...(result.errors || []), ...(result.warnings || [])];
}

export function collectActivityValidationMessages(
  result: ActivityValidationResult,
): string[] {
  return [...(result.errors || []), ...(result.warnings || []), ...(result.suggestions || [])];
}
