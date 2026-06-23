import { ToolResult } from './interfaces';

export type ErrorCategory =
  | 'user_input_error'
  | 'tool_auth_error'
  | 'tool_runtime_error'
  | 'provider_error'
  | 'protocol_error';

export type RecoveryAction =
  | {
      type: 'none';
    }
  | {
      type: 'next_action';
      action: string;
      params?: Record<string, unknown>;
      observationSuffix?: string;
    }
  | {
      type: 'wait_user_input';
      message?: string;
    }
  | {
      type: 'terminate';
      message?: string;
    }
  | {
      type: 'retry';
      retryTarget?: 'same_action' | 'model_inference';
      message?: string;
    };

export interface ModelFallbackStrategy {
  groupOrder: Array<'same_provider' | 'cross_provider'>;
  includeCurrentModel: boolean;
  reason: 'provider_error' | 'protocol_error' | 'model_not_initialized' | 'default';
}

const DEFAULT_MODEL_FALLBACK_STRATEGY: ModelFallbackStrategy = {
  groupOrder: ['same_provider', 'cross_provider'],
  includeCurrentModel: true,
  reason: 'default',
};

export function classifyToolResultError(result?: ToolResult): ErrorCategory | undefined {
  if (!result || result.success) {
    return undefined;
  }

  const code = result.code || '';
  if (code === 'protocol_error') {
    return 'protocol_error';
  }
  if (code === 'provider_error' || code === 'model_not_initialized') {
    return 'provider_error';
  }
  if (
    [
      'missing_params',
      'missing_user_input',
      'template_ambiguous',
      'template_mismatch',
      'param_recover_failed',
    ].includes(code) ||
    result.requiresUserInput
  ) {
    return 'user_input_error';
  }
  if (
    [
      'unauthorized_access',
      'tool_not_allowed',
      'tool_not_visible_in_capability_snapshot',
      'template_not_visible_in_capability_snapshot',
      'skill_not_visible_in_capability_snapshot',
      'skill_id_required_in_task_mode',
    ].includes(code)
  ) {
    return 'tool_auth_error';
  }
  if (
    [
      'render_failed',
      'param_validation_failed',
      'service_error',
      'execution_error',
      'api_error',
      'template_fetch_failed',
      'render_error',
    ].includes(code)
  ) {
    return 'tool_runtime_error';
  }

  return undefined;
}

export function attachErrorCategory(result?: ToolResult): ToolResult | undefined {
  if (!result) {
    return undefined;
  }

  const existingCategory =
    typeof result.data?.errorCategory === 'string' ? result.data.errorCategory : undefined;
  const errorCategory = existingCategory || classifyToolResultError(result);
  if (!errorCategory) {
    return result;
  }

  return {
    ...result,
    data: {
      ...(result.data || {}),
      errorCategory,
    },
  };
}

export function looksLikeParameterIssue(result: ToolResult): boolean {
  const diagnosticText = [
    result.output || '',
    typeof result.data?.message === 'string' ? result.data.message : '',
    typeof result.data?.error === 'string' ? result.data.error : '',
  ]
    .join(' ')
    .toLowerCase();

  return (
    diagnosticText.includes('参数') ||
    diagnosticText.includes('missing') ||
    diagnosticText.includes('invalid') ||
    diagnosticText.includes('validation') ||
    diagnosticText.includes('required')
  );
}

export function shouldTriggerDocumentParamRecover(result?: ToolResult): boolean {
  if (!result || result.success || result.requiresUserInput) {
    return false;
  }

  const code = result.code || '';
  const parameterIssue = result.data?.parameterIssue === true;

  if (code === 'template_mismatch') {
    return false;
  }
  if (code === 'render_failed' && parameterIssue) {
    return true;
  }
  if (code === 'missing_params' || code === 'param_validation_failed') {
    return true;
  }

  // 兼容历史返回形态：旧结果可能还没有显式 parameterIssue 标记。
  return parameterIssue || looksLikeParameterIssue(result);
}

export function decideRecoveryAction(toolName: string, result?: ToolResult): RecoveryAction {
  if (!result || result.success) {
    return { type: 'none' };
  }

  if (result.requiresUserInput) {
    return {
      type: 'wait_user_input',
      message: result.userInputPrompt || result.output,
    };
  }

  const errorCategory =
    typeof result.data?.errorCategory === 'string'
      ? result.data.errorCategory
      : classifyToolResultError(result);

  if (errorCategory === 'provider_error' || errorCategory === 'protocol_error') {
    return {
      type: 'retry',
      retryTarget: toolName === 'model_inference' ? 'model_inference' : 'same_action',
      message: result.output,
    };
  }

  if (errorCategory === 'tool_auth_error') {
    return {
      type: 'terminate',
      message: result.output,
    };
  }

  if (errorCategory === 'user_input_error') {
    return {
      type: 'wait_user_input',
      message: result.userInputPrompt || result.output,
    };
  }

  return { type: 'none' };
}

export function decideModelFallbackStrategy(result?: ToolResult): ModelFallbackStrategy {
  if (!result || result.success) {
    return DEFAULT_MODEL_FALLBACK_STRATEGY;
  }

  const code = result.code || '';
  const errorCategory =
    typeof result.data?.errorCategory === 'string'
      ? result.data.errorCategory
      : classifyToolResultError(result);

  if (code === 'model_not_initialized') {
    return {
      groupOrder: ['same_provider', 'cross_provider'],
      includeCurrentModel: false,
      reason: 'model_not_initialized',
    };
  }

  if (errorCategory === 'provider_error') {
    return {
      groupOrder: ['cross_provider', 'same_provider'],
      includeCurrentModel: true,
      reason: 'provider_error',
    };
  }

  if (errorCategory === 'protocol_error') {
    return {
      groupOrder: ['same_provider', 'cross_provider'],
      includeCurrentModel: true,
      reason: 'protocol_error',
    };
  }

  return DEFAULT_MODEL_FALLBACK_STRATEGY;
}
