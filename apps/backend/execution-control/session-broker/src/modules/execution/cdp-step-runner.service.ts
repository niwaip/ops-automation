import { Injectable, Logger } from '@nestjs/common';
import { CdpWorkerClientService } from './cdp-worker-client.service';
import { extractMainTextFromHtml } from './cdp-html-text';
import {
  type ExecutionResult,
  type TemplateStep,
} from './cdp-executor.types';

@Injectable()
export class CdpStepRunnerService {
  private readonly logger = new Logger(CdpStepRunnerService.name);

  constructor(private readonly client: CdpWorkerClientService) {}

  replaceParams(value: unknown, params: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      return value
        .replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, paramName) => {
          if (params[paramName] !== undefined) {
            return String(params[paramName]);
          }
          return match;
        })
        .replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, paramName) => {
          if (params[paramName] !== undefined) {
            return String(params[paramName]);
          }
          return match;
        });
    }
    return value;
  }

  substituteStep(step: TemplateStep, params: Record<string, unknown>): TemplateStep {
    const substituted = JSON.parse(JSON.stringify(step)) as TemplateStep;
    const rewrite = (value: unknown): unknown => this.replaceParams(value, params);

    if (substituted.params) {
      substituted.params = Object.fromEntries(
        Object.entries(substituted.params).map(([key, value]) => [key, rewrite(value)])
      );
    }
    if (substituted.locator?.value) {
      substituted.locator.value = String(rewrite(substituted.locator.value));
    }
    if (substituted.output_var) {
      substituted.output_var = String(rewrite(substituted.output_var));
    }
    if (substituted.branch) {
      substituted.branch = {
        ...substituted.branch,
        condition_fn: String(rewrite(substituted.branch.condition_fn)),
        takeover_reason: substituted.branch.takeover_reason
          ? String(rewrite(substituted.branch.takeover_reason))
          : substituted.branch.takeover_reason,
        description: substituted.branch.description
          ? String(rewrite(substituted.branch.description))
          : substituted.branch.description,
      };
    }
    return substituted;
  }

  buildSelector(locator: { type: string; value: string }): string {
    const type = locator.type === 'testId' || locator.type === 'testid' ? 'test-id' : locator.type;

    switch (type) {
      case 'css':
        return locator.value;
      case 'xpath':
        return locator.value;
      case 'text':
        return `text=${locator.value}`;
      case 'role':
        return `role=${locator.value}`;
      case 'ref':
        return locator.value;
      case 'placeholder':
        return `[placeholder="${locator.value}"]`;
      case 'label':
        if (
          locator.value.startsWith('#') ||
          locator.value.startsWith('.') ||
          locator.value.startsWith('[') ||
          locator.value.startsWith('/')
        ) {
          return locator.value;
        }
        return `internal:label="${locator.value}"`;
      case 'test-id':
        return `[data-testid="${locator.value}"]`;
      default:
        return locator.value;
    }
  }

  mapStepToCommand(
    step: TemplateStep,
    params: Record<string, unknown> = {}
  ): { tool: string; params: Record<string, unknown> } {
    const commandParams: Record<string, unknown> = { ...(step.params || {}) };

    const directKeys = ['selector', 'target', 'value', 'url', 'text', 'key', 'duration', 'direction', 'amount'] as const;
    for (const k of directKeys) {
      if (step[k] !== undefined && commandParams[k] === undefined) commandParams[k] = step[k];
    }
    if (step.locator) {
      if (step.locator.type === 'ref' && commandParams.target === undefined) {
        commandParams.target = step.locator.value;
      } else if (commandParams.selector === undefined) {
        commandParams.selector = this.buildSelector(step.locator);
      }
    }
    if (step.wait) {
      if (step.wait.value && commandParams.selector === undefined) commandParams.selector = step.wait.value;
      if (step.wait.timeout !== undefined && commandParams.duration === undefined) commandParams.duration = step.wait.timeout;
    }
    const stepCaptureProfile = step.capture_profile || step.captureProfile;
    if (stepCaptureProfile) {
      if (commandParams.captureProfile === undefined) commandParams.captureProfile = stepCaptureProfile;
      if (commandParams.capture_profile === undefined) commandParams.capture_profile = stepCaptureProfile;
    }

    for (const key of Object.keys(commandParams)) {
      commandParams[key] = this.replaceParams(commandParams[key], params);
    }

    return {
      tool: step.action,
      params: commandParams,
    };
  }

  async executeSingleStep(
    step: TemplateStep,
    sessionId: string | undefined,
    params: Record<string, unknown>,
    backend: string,
    variables: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const substitutedStep = this.substituteStep(step, params);

    if (substitutedStep.execution_policy === 'forbid_in_replay') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: '步骤策略禁止在回放中自动执行',
        message: substitutedStep.description || '步骤策略禁止在回放中自动执行',
        replay_forbidden: true,
        replay_forbidden_reason: '步骤策略禁止在回放中自动执行',
      };
    }

    if (substitutedStep.execution_policy === 'require_confirmation') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: '步骤策略要求人工确认后执行',
        message: substitutedStep.description || '步骤策略要求人工确认后执行',
        confirmation_required: true,
        confirmation_reason: '步骤策略要求人工确认后执行',
      };
    }

    if (substitutedStep.execution_policy === 'require_takeover') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: '步骤策略要求人工接管',
        message: substitutedStep.description || '步骤策略要求人工接管',
        takeover: true,
        takeover_reason: '步骤策略要求人工接管',
      };
    }

    if (substitutedStep.action === 'read_value') {
      return this.executeReadValueStep(substitutedStep, sessionId, backend, variables);
    }

    if (substitutedStep.action === 'branch') {
      return this.executeBranchStep(substitutedStep, variables);
    }

    if (substitutedStep.action === 'takeover_gate') {
      return {
        success: false,
        step_id: substitutedStep.step_id,
        action: substitutedStep.action,
        error: substitutedStep.params?.reason
          ? String(substitutedStep.params.reason)
          : '人工接管节点触发',
        message: substitutedStep.description || '人工接管节点触发',
        takeover: true,
        takeover_reason:
          typeof substitutedStep.params?.reason === 'string'
            ? substitutedStep.params.reason
            : '人工接管节点触发',
      };
    }

    const command = this.mapStepToCommand(substitutedStep, params);
    const captureProfile = substitutedStep.capture_profile || substitutedStep.captureProfile;
    const commandArgs = { ...command.params };
    delete commandArgs.captureProfile;
    delete commandArgs.capture_profile;
    const runtimeSessionId = sessionId || 'template-test-default';
    const result = await this.client.postJson<{
      success: boolean;
      output?: Record<string, any>;
      errorCode?: string;
      errorMessage?: string;
      warningCodes?: string[];
    }>('/browser/execute-step', {
      executionId: `template-test:${runtimeSessionId}`,
      runtimeSessionId,
      backend,
      stepId: substitutedStep.step_id,
      action: command.tool,
      args: commandArgs,
      ...(captureProfile ? { captureProfile } : {}),
    });

    const stepResult = (result.output || {}) as Record<string, any>;
    const success = result.success === true;
    const cleanHtml = this.extractHtmlResult(stepResult.html);
    const rawText =
      typeof stepResult?.data?.text === 'string'
        ? stepResult.data.text
        : typeof stepResult.text === 'string'
          ? stepResult.text
          : undefined;

    const shouldExtract = this.shouldExtractMainContent(substitutedStep);
    const extractedText = shouldExtract
      ? (rawText && !this.isRawCliOutput(rawText) ? rawText.trim() : undefined) ||
        (cleanHtml ? extractMainTextFromHtml(cleanHtml) : undefined)
      : undefined;

    return {
      success,
      step_id: substitutedStep.step_id,
      action: String(stepResult.command || substitutedStep.action),
      error: success
        ? undefined
        : String(result.errorMessage || stepResult.message || 'Step execution failed'),
      message: success
        ? this.extractCleanMessage(stepResult, {}, substitutedStep)
        : String(result.errorMessage || substitutedStep.description || 'Step execution failed'),
      screenshot: typeof stepResult.screenshot === 'string' ? stepResult.screenshot : undefined,
      text: extractedText,
      html: cleanHtml,
    };
  }

  isRawCliOutput(value?: string): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return (
      trimmed.includes('### Result') ||
      trimmed.includes('### Ran Playwright code') ||
      trimmed.startsWith('- Page URL:')
    );
  }

  shouldExtractMainContent(step: TemplateStep): boolean {
    if (step.action === 'read_page' || step.action === 'get_text' || step.action === 'read_value') {
      return true;
    }
    const captureProfile =
      step.capture_profile ||
      step.captureProfile ||
      (step.params?.captureProfile as any) ||
      (step.params?.capture_profile as any);
    if (!captureProfile) return false;
    const capture = captureProfile.capture;
    if (capture && typeof capture === 'object') {
      return capture.mainContent === true;
    }
    return captureProfile.profile === 'article';
  }

  extractCleanMessage(
    stepResult: Record<string, any>,
    result: { message?: string },
    substitutedStep: TemplateStep
  ): string {
    const raw =
      typeof stepResult.message === 'string' && stepResult.message.trim()
        ? stepResult.message.trim()
        : typeof result.message === 'string' && result.message.trim()
          ? result.message.trim()
          : '';
    if (raw && !raw.includes('### Result') && !raw.includes('### Ran Playwright code')) {
      return raw;
    }
    return substitutedStep.description || `${substitutedStep.action} 执行成功`;
  }

  extractHtmlResult(rawHtml?: unknown): string | undefined {
    if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
      return undefined;
    }
    const trimmed = rawHtml.trim();
    if (trimmed.includes('### Result')) {
      const match = trimmed.match(
        /### Result\s*\n?([\s\S]*?)(?:\n### Ran Playwright code|\n### |\n```|$)/
      );
      const candidate = match && typeof match[1] === 'string' ? match[1].trim() : trimmed;
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === 'string' && /<[a-z!/][\s\S]*>/i.test(parsed.trim())) {
          return parsed.trim();
        }
      } catch {
        const unquoted =
          (candidate.startsWith('"') && candidate.endsWith('"')) ||
          (candidate.startsWith("'") && candidate.endsWith("'"))
            ? candidate.slice(1, -1).trim()
            : candidate;
        if (/<[a-z!/][\s\S]*>/i.test(unquoted)) {
          return unquoted;
        }
      }
      return undefined;
    }
    return /<[a-z!/][\s\S]*>/i.test(trimmed) ? trimmed : undefined;
  }

  async executeReadValueStep(
    step: TemplateStep,
    sessionId: string | undefined,
    backend: string,
    variables: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const command = this.mapReadValueStepToCommand(step);
    const result = await this.client.postJson<{
      success: boolean;
      results: Array<Record<string, unknown>>;
      message?: string;
    }>('/browser/execute', {
      runtimeSessionId: sessionId,
      backend,
      commands: [command],
    });

    const raw = (
      Array.isArray(result.results) && result.results.length > 0 ? result.results[0] || {} : {}
    ) as Record<string, any>;
    const success = raw.status !== 'error' && result.success !== false;
    const rawText =
      typeof raw?.data?.text === 'string'
        ? raw.data.text
        : typeof raw.text === 'string'
          ? raw.text
          : typeof raw.stdout === 'string'
            ? raw.stdout
            : '';
    const textValue = this.extractReadValueText(rawText);

    if (success && step.output_var) {
      variables[step.output_var] = textValue;
    }

    return {
      success,
      step_id: step.step_id,
      action: step.action,
      error: success ? undefined : String(raw.message || result.message || '读取页面值失败'),
      message: success
        ? `读取到变量 ${step.output_var || 'value'}`
        : String(raw.message || result.message || ''),
      text: textValue,
    };
  }

  extractReadValueText(rawText: string): string {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return '';
    }

    const resultBlockMatch = trimmed.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);
    const candidate = resultBlockMatch?.[1]?.trim() || trimmed;

    if (candidate === 'true' || candidate === 'false') {
      return candidate;
    }

    if (
      (candidate.startsWith('"') && candidate.endsWith('"')) ||
      (candidate.startsWith("'") && candidate.endsWith("'"))
    ) {
      try {
        const parsed = JSON.parse(candidate);
        if (
          typeof parsed === 'string' ||
          typeof parsed === 'number' ||
          typeof parsed === 'boolean'
        ) {
          return String(parsed).trim();
        }
      } catch {
        return candidate.slice(1, -1).trim();
      }
    }

    return candidate;
  }

  executeBranchStep(
    step: TemplateStep,
    variables: Record<string, unknown>
  ): ExecutionResult {
    const branch = step.branch;
    if (!branch?.condition_fn) {
      return {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: 'branch step missing condition_fn',
      };
    }

    try {
      const evaluator = new Function(
        'ctx',
        `const fn = ${branch.condition_fn}; return fn(ctx);`
      ) as (ctx: Record<string, unknown>) => unknown;
      const matched = Boolean(evaluator(variables));
      const outcome = matched ? branch.on_match : branch.on_mismatch;
      if (outcome === 'continue') {
        return {
          success: true,
          step_id: step.step_id,
          action: step.action,
          message: matched ? '条件成立，继续执行' : '条件不成立，但配置为继续执行',
        };
      }
      if (outcome === 'stop') {
        return {
          success: false,
          step_id: step.step_id,
          action: step.action,
          error: matched ? '条件成立，按配置停止执行' : '条件不满足，按配置停止执行',
          message: branch.description || '条件分歧停止执行',
        };
      }
      return {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: branch.takeover_reason || '条件不满足，需要人工接管',
        message: branch.description || '条件分歧触发人工接管',
        takeover: true,
        takeover_reason: branch.takeover_reason || '条件不满足，需要人工接管',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: `执行条件表达式失败: ${errorMsg}`,
      };
    }
  }

  mapReadValueStepToCommand(step: TemplateStep): {
    tool: string;
    params: Record<string, unknown>;
  } {
    const method =
      typeof step.params?.method === 'string' && step.params.method.trim()
        ? step.params.method.trim()
        : undefined;
    const selector =
      typeof step.params?.selector === 'string'
        ? step.params.selector
        : step.locator
          ? this.buildSelector(step.locator)
          : undefined;
    const maxLength = typeof step.params?.max_length === 'number' ? step.params.max_length : 4000;
    return {
      tool: 'get_text',
      params: {
        ...(selector ? { selector } : {}),
        ...(method ? { method } : {}),
        ...(typeof step.params?.attribute === 'string' && step.params.attribute.trim()
          ? { attribute: step.params.attribute.trim() }
          : {}),
        max_length: maxLength,
      },
    };
  }
}
