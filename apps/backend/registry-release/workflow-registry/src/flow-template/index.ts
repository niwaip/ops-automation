export {
  EXECUTION_FLOW_CATEGORIES,
} from '@ops/platform/dist/modules/execution-flow/interfaces';
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
} from '@ops/platform/dist/modules/execution-flow/interfaces';
export { ExecutionFlowModule } from '@ops/platform/dist/modules/execution-flow/execution-flow.module';
export { ExecutionFlowTemplateController } from '@ops/platform/dist/modules/execution-flow/execution-flow.controller';
export { ExecutionFlowTemplateService } from '@ops/platform/dist/modules/execution-flow/execution-flow-template.service';

import type {
  ExecutionFlowStep,
} from '@ops/platform/dist/modules/execution-flow/interfaces';
import {
  EXECUTION_FLOW_CATEGORIES as executionFlowCategories,
} from '@ops/platform/dist/modules/execution-flow/interfaces';

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
