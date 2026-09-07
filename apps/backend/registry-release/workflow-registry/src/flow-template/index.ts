export * from './interfaces';
export * from './flow-template.ports';
export { ExecutionFlowModule } from './execution-flow.module';
export { ExecutionFlowTemplateController } from './execution-flow.controller';
export { ExecutionFlowTemplateService } from './execution-flow-template.service';
export { ExecutionFlowValidationFacadeService } from './execution-flow-validation-facade.service';
export { ExecutionFlowValidationHttpService } from './execution-flow-validation-http.service';
export { ExecutionFlowValidationService } from './execution-flow-validation.service';

import type { ExecutionFlowStep } from './interfaces';
import { EXECUTION_FLOW_CATEGORIES as executionFlowCategories } from './interfaces';

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
