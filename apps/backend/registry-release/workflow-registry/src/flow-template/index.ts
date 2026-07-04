export {
  EXECUTION_FLOW_CATEGORIES,
  ExecutionFlowModule,
  ExecutionFlowTemplateController,
  ExecutionFlowTemplateService,
} from '@ops/platform/dist/modules/execution-flow';
export type {
  CreateExecutionFlowTemplateDTO,
  ExecutionFlowStep,
  ExecutionFlowStepType,
  ExecutionFlowTemplateDTO,
  StepAnalysis,
  UpdateExecutionFlowTemplateDTO,
  ValidationResult,
  WorkflowInputPolicy,
  WorkflowParamPolicy,
  WorkflowParamRequiredMode,
} from '@ops/platform/dist/modules/execution-flow';

import type {
  ExecutionFlowStep,
} from '@ops/platform/dist/modules/execution-flow';
import {
  EXECUTION_FLOW_CATEGORIES as executionFlowCategories,
} from '@ops/platform/dist/modules/execution-flow';

export function getExecutionFlowCategoryMeta(category: string): {
  label: string;
  color: string;
} | undefined {
  return executionFlowCategories[category as keyof typeof executionFlowCategories];
}

export function collectExecutionFlowToolNames(
  steps: ExecutionFlowStep[] | null | undefined,
): string[] {
  return [...new Set((steps || []).flatMap((step) => (step.tool?.name ? [step.tool.name] : [])))].sort();
}
