import {
  decideRecoveryAction,
  decideModelFallbackStrategy,
  attachErrorCategory,
  classifyToolResultError,
  shouldTriggerDocumentParamRecover,
} from './error-recovery-policy';
import { ToolResult } from './interfaces';

describe('error-recovery-policy', () => {
  it('classifies service_error as tool_runtime_error', () => {
    const result: ToolResult = {
      success: false,
      output: '文档渲染服务调用失败: validation failed',
      code: 'service_error',
      severity: 'error',
      data: {
        error: 'service_error',
        message: 'validation failed',
      },
    };

    expect(classifyToolResultError(result)).toBe('tool_runtime_error');

    const enriched = attachErrorCategory(result);
    expect(enriched?.data?.errorCategory).toBe('tool_runtime_error');
  });

  it('triggers document param recovery for parameter-like runtime failures', () => {
    const result: ToolResult = {
      success: false,
      output: '文档渲染服务调用失败: validation failed',
      code: 'param_validation_failed',
      severity: 'error',
      data: {
        error: 'param_validation_failed',
        errorCategory: 'tool_runtime_error',
        parameterIssue: true,
      },
    };

    expect(shouldTriggerDocumentParamRecover(result)).toBe(true);
  });

  it('does not trigger param recovery for generic runtime failures without parameter signal', () => {
    const result: ToolResult = {
      success: false,
      output: '文档渲染服务调用失败: upstream timeout',
      code: 'service_error',
      severity: 'error',
      data: {
        error: 'service_error',
        errorCategory: 'tool_runtime_error',
      },
    };

    expect(shouldTriggerDocumentParamRecover(result)).toBe(false);
  });

  it('does not trigger recovery for template mismatch', () => {
    const result: ToolResult = {
      success: false,
      output: '模板不一致',
      code: 'template_mismatch',
      severity: 'warning',
      data: {
        error: 'template_mismatch',
      },
      requiresUserInput: true,
    };

    expect(shouldTriggerDocumentParamRecover(result)).toBe(false);
  });

  it('returns next_action recovery decision for document render failures', () => {
    const result: ToolResult = {
      success: false,
      output: '文档渲染服务调用失败: validation failed',
      code: 'param_validation_failed',
      severity: 'error',
      data: {
        error: 'param_validation_failed',
        errorCategory: 'tool_runtime_error',
        parameterIssue: true,
      },
    };

    expect(decideRecoveryAction('document_render', result)).toMatchObject({
      type: 'next_action',
      action: 'document_param_recover',
    });
    expect(decideRecoveryAction('flow_execute', result)).toEqual({ type: 'none' });
  });

  it('returns wait_user_input for requiresUserInput results', () => {
    const result: ToolResult = {
      success: false,
      output: '缺少参数',
      code: 'missing_params',
      severity: 'warning',
      requiresUserInput: true,
      userInputPrompt: '请补充合同日期',
      data: {
        error: 'missing_params',
      },
    };

    expect(decideRecoveryAction('param_collect', result)).toEqual({
      type: 'wait_user_input',
      message: '请补充合同日期',
    });
  });

  it('returns terminate for authorization failures', () => {
    const result: ToolResult = {
      success: false,
      output: '当前权限不足，无法继续执行。',
      code: 'tool_not_allowed',
      severity: 'error',
      data: {
        error: 'tool_not_allowed',
        errorCategory: 'tool_auth_error',
      },
    };

    expect(decideRecoveryAction('document_render', result)).toEqual({
      type: 'terminate',
      message: '当前权限不足，无法继续执行。',
    });
  });

  it('returns retry for provider failures during model inference', () => {
    const result: ToolResult = {
      success: false,
      output: 'AI调用失败: upstream timeout',
      code: 'provider_error',
      severity: 'error',
      data: {
        error: 'provider_error',
        errorCategory: 'provider_error',
      },
      meta: {
        toolName: 'model_inference',
      },
    };

    expect(decideRecoveryAction('model_inference', result)).toEqual({
      type: 'retry',
      retryTarget: 'model_inference',
      message: 'AI调用失败: upstream timeout',
    });
  });

  it('uses cross-provider-first fallback strategy for provider errors', () => {
    const result: ToolResult = {
      success: false,
      output: 'AI调用失败: upstream timeout',
      code: 'provider_error',
      severity: 'error',
      data: {
        error: 'provider_error',
        errorCategory: 'provider_error',
      },
    };

    expect(decideModelFallbackStrategy(result)).toEqual({
      groupOrder: ['cross_provider', 'same_provider'],
      includeCurrentModel: true,
      reason: 'provider_error',
    });
  });

  it('uses same-provider-first fallback strategy for protocol errors', () => {
    const result: ToolResult = {
      success: false,
      output: '协议错误',
      code: 'protocol_error',
      severity: 'error',
      data: {
        error: 'protocol_error',
        errorCategory: 'protocol_error',
      },
    };

    expect(decideModelFallbackStrategy(result)).toEqual({
      groupOrder: ['same_provider', 'cross_provider'],
      includeCurrentModel: true,
      reason: 'protocol_error',
    });
  });

  it('skips current model for model_not_initialized fallback strategy', () => {
    const result: ToolResult = {
      success: false,
      output: '模型 default 未初始化',
      code: 'model_not_initialized',
      severity: 'error',
      data: {
        error: 'model_not_initialized',
        errorCategory: 'provider_error',
      },
    };

    expect(decideModelFallbackStrategy(result)).toEqual({
      groupOrder: ['same_provider', 'cross_provider'],
      includeCurrentModel: false,
      reason: 'model_not_initialized',
    });
  });
});
