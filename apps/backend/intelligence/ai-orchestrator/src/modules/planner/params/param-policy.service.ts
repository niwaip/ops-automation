import { Injectable } from '@nestjs/common';
import { SkillMatchResult } from '../../react-engine/interfaces';

export type WorkflowParamRequiredMode =
  | 'always'
  | 'conditional'
  | 'optional'
  | 'system_required';

export type WorkflowParamPolicySnapshot = {
  enabled?: boolean;
  requiredMode?: WorkflowParamRequiredMode;
  defaultValue?: unknown;
  defaultValueResolver?: string;
  valueSourcePriority?: string[];
  confirmationThreshold?: number;
  previewBlocking?: boolean;
  validationRules?: Array<Record<string, unknown>>;
  transformRule?: string;
  templateBinding?: string;
};

@Injectable()
export class ParamPolicyService {
  resolveWorkflowParamPolicies(
    matchedSkill: SkillMatchResult
  ): Record<string, WorkflowParamPolicySnapshot> | undefined {
    const workflowInputPolicy = matchedSkill.apiEndpoints?.runtimeMetadata?.workflowInputPolicy;
    if (!workflowInputPolicy || typeof workflowInputPolicy !== 'object') {
      return undefined;
    }
    const params = workflowInputPolicy.params;
    if (!params || typeof params !== 'object') {
      return undefined;
    }
    return params;
  }

  resolveWorkflowRequiredMode(
    workflowPolicy: WorkflowParamPolicySnapshot | undefined,
    schemaRequired: boolean,
    allowSchemaStrategyFallback: boolean
  ): WorkflowParamRequiredMode {
    const mode = workflowPolicy?.requiredMode;
    if (
      mode === 'always' ||
      mode === 'conditional' ||
      mode === 'optional' ||
      mode === 'system_required'
    ) {
      return mode;
    }
    if (!allowSchemaStrategyFallback) {
      return 'optional';
    }
    return schemaRequired ? 'always' : 'optional';
  }

  hasWorkflowPolicyStrategySource(
    workflowParamPolicies?: Record<string, WorkflowParamPolicySnapshot>
  ): boolean {
    return Boolean(workflowParamPolicies && Object.keys(workflowParamPolicies).length > 0);
  }
}
