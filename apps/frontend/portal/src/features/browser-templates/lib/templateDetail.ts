import {
  isTemplateStepAction,
  type Template,
  type TemplateParamsSchema,
  type TemplateStep,
} from '@/api/template';

export interface ParamProperty {
  type?: string;
  description?: string;
}

export const getTemplateStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    DRAFT: 'default',
    REVIEW: 'processing',
    PUBLISHED: 'success',
    DEPRECATED: 'warning',
    REVOKED: 'error',
  };

  return colorMap[status] || 'default';
};

export const getTemplateParamProperties = (template?: Template): Record<string, ParamProperty> => {
  const schema = template?.params_schema as TemplateParamsSchema | undefined;
  if (!schema?.properties) {
    return {};
  }

  return schema.properties as Record<string, ParamProperty>;
};

export const getTemplateRequiredParams = (template?: Template): string[] => {
  const schema = template?.params_schema as TemplateParamsSchema | undefined;
  return schema?.required || [];
};

export const normalizeTemplateSteps = (steps: TemplateStep[]): TemplateStep[] =>
  steps.map((step, index) => ({
    ...step,
    step_id: (step.step_id || `step_${index + 1}`).trim(),
    action: isTemplateStepAction(step.action) ? step.action : 'click',
    execution_policy:
      step.execution_policy === 'auto_execute' ||
      step.execution_policy === 'require_confirmation' ||
      step.execution_policy === 'require_takeover' ||
      step.execution_policy === 'forbid_in_replay'
        ? step.execution_policy
        : 'auto_execute',
  }));
