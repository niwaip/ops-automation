export { ActivityCodegenService } from '@ops/platform/dist/modules/temporal-workflow/temporal-activity-codegen.service';
export { TemporalWorkflowCodegenService } from '@ops/platform/dist/modules/temporal-workflow/temporal-workflow-codegen.service';
export { TemporalWorkflowCodegenOrchestrationService } from '@ops/platform/dist/workflow-registry/codegen/index';

export interface WorkflowCodegenSummary {
  success: boolean;
  attempts?: number;
  autoRetried?: boolean;
  generationMode?: 'deterministic' | 'ai';
  codeLength?: number;
  error?: string;
}

export function isWorkflowCodegenSuccessful(result: {
  success: boolean;
  code?: string;
}): boolean {
  return result.success && typeof result.code === 'string' && result.code.trim().length > 0;
}

export function summarizeWorkflowCodegenResult(result: {
  success: boolean;
  code?: string;
  error?: string;
  attempts?: number;
  autoRetried?: boolean;
  generationMode?: 'deterministic' | 'ai';
}): WorkflowCodegenSummary {
  return {
    success: result.success,
    attempts: result.attempts,
    autoRetried: result.autoRetried,
    generationMode: result.generationMode,
    codeLength: result.code?.length,
    error: result.error,
  };
}
