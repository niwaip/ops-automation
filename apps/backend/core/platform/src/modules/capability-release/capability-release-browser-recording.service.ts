import { BadRequestException, Injectable } from '@nestjs/common';
import { CapabilitySourceSnapshotDTO } from './interfaces';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const normalizeBrowserRecordingToolName = (toolName: unknown): string | undefined => {
  if (typeof toolName !== 'string' || !toolName.trim()) {
    return undefined;
  }
  const normalized = toolName.trim();
  return normalized === 'browser_execute' ? 'browser_step' : normalized;
};

type BrowserRecordingRuntimeStep = {
  id: string;
  name: string;
  action: string;
  target?: string;
  args?: Record<string, unknown>;
};

type BrowserRecordingRequestedStep = {
  name?: string;
  index?: number;
};

@Injectable()
export class CapabilityReleaseBrowserRecordingService {
  normalizeExecutionFlow(flow: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(flow)) {
      return [];
    }
    return flow
      .filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((step) => {
        const tool = step.tool;
        if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
          return step;
        }
        const normalizedToolName = normalizeBrowserRecordingToolName(
          (tool as Record<string, unknown>).name,
        );
        if (!normalizedToolName) {
          return step;
        }
        return {
          ...step,
          tool: {
            ...(tool as Record<string, unknown>),
            name: normalizedToolName,
          },
        };
      });
  }

  normalizeToolNames(tools: unknown): string[] {
    if (!Array.isArray(tools)) {
      return [];
    }
    return tools
      .map((item) => normalizeBrowserRecordingToolName(item))
      .filter((item): item is string => typeof item === 'string');
  }

  collectExecutionFlowToolNames(flow: unknown): string[] {
    return this.normalizeExecutionFlow(flow)
      .map((step) => {
        const tool = step.tool;
        if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
          return undefined;
        }
        return normalizeBrowserRecordingToolName((tool as Record<string, unknown>).name);
      })
      .filter((item): item is string => typeof item === 'string');
  }

  mergeToolsWithExecutionFlow(
    declaredTools: unknown,
    executionFlow: unknown,
    options?: { includeSkillMatch?: boolean },
  ): string[] {
    const normalizedDeclaredTools = this.normalizeToolNames(declaredTools);
    const flowTools = this.collectExecutionFlowToolNames(executionFlow);
    const prefix = options?.includeSkillMatch === false ? [] : ['skill_match'];
    return Array.from(new Set([...prefix, ...normalizedDeclaredTools, ...flowTools]));
  }

  validateSnapshot(
    snapshot: CapabilitySourceSnapshotDTO,
    options?: {
      environment?: string;
      deploymentId?: string;
      input?: Record<string, unknown>;
      testCases?: string[];
    },
  ): {
    success: boolean;
    score: number;
    logs: string[];
    resultSnapshot: Record<string, unknown>;
    errorSummary: string | null;
  } {
    const payload = (snapshot.sourcePayload as Record<string, unknown>) || {};
    const steps = Array.isArray(payload.steps) ? payload.steps : [];
    const executionFlow = this.normalizeExecutionFlow(payload.executionFlow);
    const testCases = Array.isArray(options?.testCases) ? options.testCases.filter(Boolean) : [];

    if (steps.length === 0 && executionFlow.length === 0) {
      throw new Error('浏览器录制快照缺少执行步骤或执行流');
    }

    const logs = [
      '开始执行浏览器录制快照静态验证...',
      '当前浏览器录制 Sandbox 校验采用静态快照验证，尚未接入静默回放。',
      `快照验证通过: 包含 ${steps.length} 个录制步骤, ${executionFlow.length} 个执行节点`,
    ];
    if (testCases.length > 0) {
      logs.push(`收到 ${testCases.length} 条自然语言测试用例，将记录到校验结果中`);
      testCases.forEach((item, index) => {
        logs.push(`[Case ${index + 1}] ${item}`);
      });
    }

    return {
      success: true,
      score: 100,
      logs,
      resultSnapshot: {
        mode: 'static_snapshot_validation',
        environment: options?.environment || null,
        deploymentId: options?.deploymentId || null,
        stepCount: steps.length,
        flowNodeCount: executionFlow.length,
        testCases,
        input: options?.input || null,
      },
      errorSummary: null,
    };
  }

  buildRuntimePlan(
    payload: Record<string, unknown>,
    runtimeInput: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): {
    backend: string;
    sessionPreferences: {
      mode?: 'interactive' | 'agent';
      enableCodegen?: boolean;
      headless?: boolean;
    };
    runtimeSteps: BrowserRecordingRuntimeStep[];
    runtimeStepsToExecute: BrowserRecordingRuntimeStep[];
    targetRuntimeStep: BrowserRecordingRuntimeStep | null;
    initialUrl?: string;
  } {
    const backend = this.resolveBackend(payload);
    const sessionPreferences = this.resolveSessionPreferences(payload);
    const runtimeSteps = this.buildRuntimeSteps(payload, runtimeInput);
    const executionStepMetadata = this.extractRequestedExecutionStepMetadata(metadata);
    const targetRuntimeStep = this.resolveRequestedRuntimeStep(runtimeSteps, executionStepMetadata);
    const runtimeStepsToExecute = targetRuntimeStep ? [targetRuntimeStep] : runtimeSteps;
    const initialUrl = this.pickFirstNonEmptyString(
      runtimeInput.url,
      runtimeSteps.find((step) => step.action === 'goto')?.target,
    );

    return {
      backend,
      sessionPreferences,
      runtimeSteps,
      runtimeStepsToExecute,
      targetRuntimeStep,
      ...(initialUrl ? { initialUrl } : {}),
    };
  }

  private resolveBackend(payload: Record<string, unknown>): string {
    const apiEndpoints = asRecord(payload.apiEndpoints);
    const runtimeMetadata = asRecord(apiEndpoints?.runtimeMetadata);
    const executionPlan = asRecord(runtimeMetadata?.executionPlan);

    return this.pickFirstNonEmptyString(
      payload.backend,
      payload.executionBackend,
      runtimeMetadata?.backend,
      executionPlan?.backend,
      process.env.BROWSER_RECORDING_BACKEND,
      process.env.BROWSER_EXECUTION_BACKEND,
      'cli',
    ) || 'cli';
  }

  private resolveSessionPreferences(
    payload: Record<string, unknown>,
  ): {
    mode?: 'interactive' | 'agent';
    enableCodegen?: boolean;
    headless?: boolean;
  } {
    const apiEndpoints = asRecord(payload.apiEndpoints);
    const runtimeMetadata = asRecord(apiEndpoints?.runtimeMetadata);
    const executionPlan = asRecord(runtimeMetadata?.executionPlan);
    const sessionPreferences =
      asRecord(payload.sessionPreferences)
      || asRecord(runtimeMetadata?.sessionPreferences)
      || asRecord(executionPlan?.sessionPreferences)
      || {};
    const mode = this.pickFirstNonEmptyString(
      sessionPreferences.mode,
      process.env.BROWSER_RUNTIME_SESSION_MODE,
      'agent',
    );

    return {
      ...(mode === 'interactive' || mode === 'agent' ? { mode } : {}),
      enableCodegen:
        typeof sessionPreferences.enableCodegen === 'boolean'
          ? sessionPreferences.enableCodegen
          : process.env.BROWSER_RUNTIME_ENABLE_CODEGEN === 'true'
            ? true
            : process.env.BROWSER_RUNTIME_ENABLE_CODEGEN === 'false'
              ? false
              : false,
      headless:
        typeof sessionPreferences.headless === 'boolean'
          ? sessionPreferences.headless
          : process.env.BROWSER_RUNTIME_HEADLESS === 'true'
            ? true
            : process.env.BROWSER_RUNTIME_HEADLESS === 'false'
              ? false
              : false,
    };
  }

  private buildRuntimeSteps(
    payload: Record<string, unknown>,
    runtimeInput: Record<string, unknown>,
  ): BrowserRecordingRuntimeStep[] {
    const executionFlow = this.normalizeExecutionFlow(payload.executionFlow);
    const sourceSteps = Array.isArray(payload.steps)
      ? payload.steps.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
      : [];
    const baseSteps = executionFlow.length > 0 ? executionFlow : sourceSteps;

    return baseSteps.map((step, index) => {
      const runtimePayload = asRecord(step.input) || asRecord(step.config) || {};
      const resolvedPayload = asRecord(
        this.resolveRuntimeValue(runtimePayload, runtimeInput),
      ) || {};
      const resolvedParams = asRecord(resolvedPayload.params) || {};
      const action = this.normalizeStepAction(
        this.pickFirstNonEmptyString(resolvedPayload.action, step.action),
      );
      if (!action) {
        throw new BadRequestException(`浏览器录制步骤缺少 action: ${step.id || `step_${index + 1}`}`);
      }
      const target = this.resolveRuntimeTarget(
        action,
        resolvedPayload,
        resolvedParams,
      );
      const args = this.buildRuntimeArgs(
        action,
        resolvedPayload,
        resolvedParams,
      );

      return {
        id: this.pickFirstNonEmptyString(step.id, resolvedPayload.id, `step_${index + 1}`) || `step_${index + 1}`,
        name: this.pickFirstNonEmptyString(step.name, `Step ${index + 1}`) || `Step ${index + 1}`,
        action,
        ...(target ? { target } : {}),
        ...(Object.keys(args).length > 0 ? { args } : {}),
      };
    });
  }

  private resolveRuntimeTarget(
    action: string,
    resolvedPayload: Record<string, unknown>,
    resolvedParams: Record<string, unknown>,
  ): string | undefined {
    const locatorTarget = this.buildTargetFromLocator(
      asRecord(resolvedPayload.locator) || asRecord(resolvedParams.locator),
    );
    if (locatorTarget) {
      return locatorTarget;
    }

    const selectorTarget = this.normalizeTarget(
      this.pickFirstNonEmptyString(
        resolvedPayload.selector,
        resolvedParams.selector,
      ),
    );
    if (selectorTarget) {
      return selectorTarget;
    }

    const explicitTarget = this.normalizeTarget(
      this.pickFirstNonEmptyString(
        resolvedPayload.target,
        resolvedParams.target,
        action === 'goto' ? resolvedPayload.url : undefined,
        action === 'goto' ? resolvedParams.url : undefined,
      ),
    );
    if (!explicitTarget) {
      return undefined;
    }

    if (this.isSuspiciousTarget(action, explicitTarget, resolvedPayload, resolvedParams)) {
      return undefined;
    }

    return explicitTarget;
  }

  private buildRuntimeArgs(
    action: string,
    resolvedPayload: Record<string, unknown>,
    resolvedParams: Record<string, unknown>,
  ): Record<string, unknown> {
    const pick = (...values: unknown[]) => values.find((value) => value !== undefined);

    switch (action) {
      case 'goto':
        return Object.fromEntries(
          Object.entries({
            url: pick(resolvedPayload.url, resolvedParams.url),
          }).filter(([, value]) => value !== undefined),
        );
      case 'fill':
        return Object.fromEntries(
          Object.entries({
            value: pick(resolvedParams.value, resolvedPayload.value, resolvedPayload.text, resolvedPayload.query),
          }).filter(([, value]) => value !== undefined),
        );
      case 'type_text':
        return Object.fromEntries(
          Object.entries({
            text: pick(resolvedParams.text, resolvedPayload.text, resolvedPayload.value),
            submit_key: pick(resolvedParams.submit_key, resolvedPayload.submit_key),
          }).filter(([, value]) => value !== undefined),
        );
      case 'press_key':
        return Object.fromEntries(
          Object.entries({
            key: pick(resolvedParams.key, resolvedPayload.key, resolvedPayload.value),
          }).filter(([, value]) => value !== undefined),
        );
      case 'wait':
        return Object.fromEntries(
          Object.entries({
            duration: pick(
              resolvedParams.duration,
              resolvedParams.timeoutMs,
              resolvedPayload.duration,
              resolvedPayload.timeoutMs,
            ),
            selector: pick(resolvedParams.selector, resolvedPayload.selector),
          }).filter(([, value]) => value !== undefined),
        );
      case 'smart_search':
      case 'search':
        return Object.fromEntries(
          Object.entries({
            query: pick(resolvedParams.query, resolvedPayload.query, resolvedPayload.text, resolvedPayload.value),
          }).filter(([, value]) => value !== undefined),
        );
      case 'click_result':
        return Object.fromEntries(
          Object.entries({
            index: pick(resolvedParams.index, resolvedPayload.index),
          }).filter(([, value]) => value !== undefined),
        );
      case 'screenshot':
      case 'snapshot':
      case 'read_page':
      case 'get_text':
      case 'switch_latest_tab':
      case 'hover':
      case 'click':
        return {};
      default:
        return { ...resolvedParams };
    }
  }

  private buildTargetFromLocator(
    locator?: Record<string, unknown>,
  ): string | undefined {
    if (!locator) {
      return undefined;
    }

    const locatorType = this.pickFirstNonEmptyString(locator.type)?.toLowerCase();
    const locatorValue = this.pickFirstNonEmptyString(locator.value);
    if (!locatorType || !locatorValue) {
      return undefined;
    }

    switch (locatorType) {
      case 'ref':
        return locatorValue;
      case 'role':
        return `role=${locatorValue}`;
      case 'text':
        return `text=${locatorValue}`;
      case 'test-id':
        return `[data-testid="${locatorValue}"]`;
      case 'xpath':
        return `xpath=${locatorValue}`;
      default:
        return locatorValue;
    }
  }

  private normalizeTarget(target?: string): string | undefined {
    const value = typeof target === 'string' ? target.trim() : '';
    if (!value) {
      return undefined;
    }

    if (/^[a-zA-Z-]+\[name=.*\]$/.test(value) && !value.split('[', 1)[0]?.includes('=')) {
      return `role=${value}`;
    }

    return value;
  }

  private isSuspiciousTarget(
    action: string,
    target: string,
    resolvedPayload: Record<string, unknown>,
    resolvedParams: Record<string, unknown>,
  ): boolean {
    if (!['fill', 'click', 'hover', 'press_key', 'type_text'].includes(action)) {
      return false;
    }

    if (this.looksLikeSelector(target)) {
      return false;
    }

    const valueCandidates = [
      resolvedPayload.value,
      resolvedPayload.text,
      resolvedPayload.query,
      resolvedPayload.url,
      resolvedPayload.key,
      resolvedParams.value,
      resolvedParams.text,
      resolvedParams.query,
      resolvedParams.url,
      resolvedParams.key,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    return valueCandidates.includes(target);
  }

  private looksLikeSelector(target: string): boolean {
    const value = target.trim();
    if (!value) {
      return false;
    }

    return /^e\d+$/i.test(value)
      || /^(role|text|xpath)=/i.test(value)
      || /^(#|\.|\[|\/\/)/.test(value)
      || /[a-zA-Z-]+\[name=/.test(value)
      || value.includes('>>')
      || value.includes(':has')
      || value.includes('[data-testid=');
  }

  private normalizeStepAction(action: string | undefined): string | undefined {
    if (!action) {
      return undefined;
    }
    const normalized = action.trim().toLowerCase();
    switch (normalized) {
      case 'navigate':
        return 'goto';
      case 'waitforselector':
        return 'wait';
      case 'press':
        return 'press_key';
      case 'type':
        return 'type_text';
      default:
        return normalized;
    }
  }

  private extractRequestedExecutionStepMetadata(
    metadata?: Record<string, unknown>,
  ): BrowserRecordingRequestedStep {
    const name = this.pickFirstNonEmptyString(
      metadata?.executionStepName,
      metadata?.stepName,
    );
    const rawIndex = metadata?.executionStepIndex ?? metadata?.stepIndex;
    const index =
      typeof rawIndex === 'number' && Number.isFinite(rawIndex)
        ? rawIndex
        : typeof rawIndex === 'string' && rawIndex.trim() && !Number.isNaN(Number(rawIndex))
          ? Number(rawIndex)
          : undefined;

    return {
      ...(name ? { name } : {}),
      ...(typeof index === 'number' ? { index } : {}),
    };
  }

  private resolveRequestedRuntimeStep(
    runtimeSteps: BrowserRecordingRuntimeStep[],
    requestedStep: BrowserRecordingRequestedStep,
  ): BrowserRecordingRuntimeStep | null {
    if (requestedStep.name) {
      const matchedByName = runtimeSteps.find((step) => step.name === requestedStep.name);
      if (matchedByName) {
        return matchedByName;
      }
    }

    if (
      typeof requestedStep.index === 'number'
      && Number.isInteger(requestedStep.index)
      && requestedStep.index > 0
      && requestedStep.index <= runtimeSteps.length
    ) {
      return runtimeSteps[requestedStep.index - 1];
    }

    return null;
  }

  private resolveRuntimeValue(
    value: unknown,
    runtimeInput: Record<string, unknown>,
  ): unknown {
    if (typeof value === 'string') {
      const exactMatch = value.match(/^\$\{([^}]+)\}$/);
      if (exactMatch) {
        const directValue = runtimeInput[exactMatch[1] as string];
        return directValue !== undefined ? directValue : value;
      }
      return value.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
        const resolved = runtimeInput[key];
        return resolved === undefined || resolved === null ? '' : String(resolved);
      });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveRuntimeValue(item, runtimeInput));
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, current]) => {
        acc[key] = this.resolveRuntimeValue(current, runtimeInput);
        return acc;
      }, {});
    }
    return value;
  }

  private pickFirstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }
}
