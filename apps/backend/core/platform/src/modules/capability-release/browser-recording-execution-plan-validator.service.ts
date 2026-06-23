import { Injectable } from '@nestjs/common';

const BROWSER_RECORDING_EXECUTION_PLAN_VERSION = 'browser-recording-ir/v1';

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

type ValidationSeverity = 'error' | 'warning';

type BrowserRecordingExecutionPlanIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
};

type BrowserRecordingExecutionPlanValidationResult = {
  valid: boolean;
  errors: BrowserRecordingExecutionPlanIssue[];
  warnings: BrowserRecordingExecutionPlanIssue[];
  executionPlanVersion: string | null;
  degradedMode: boolean;
  degradeReason: string | null;
  trace: Record<string, unknown>;
};

@Injectable()
export class BrowserRecordingExecutionPlanValidatorService {
  validateForBridge(
    payload: Record<string, unknown>
  ): BrowserRecordingExecutionPlanValidationResult {
    return this.validate(payload, {
      mode: 'bridge',
      allowLegacyFallback: false,
      source: 'publishPayload.apiEndpoints.runtimeMetadata',
    });
  }

  validateForPublish(
    payload: Record<string, unknown>
  ): BrowserRecordingExecutionPlanValidationResult {
    return this.validate(payload, {
      mode: 'publish',
      allowLegacyFallback: true,
      source: 'release.sourcePayload.runtimeMetadata',
    });
  }

  validateForRuntime(
    payload: Record<string, unknown>
  ): BrowserRecordingExecutionPlanValidationResult {
    return this.validate(payload, {
      mode: 'runtime',
      allowLegacyFallback: true,
      source: 'release.sourcePayload.runtimeMetadata',
    });
  }

  private validate(
    payload: Record<string, unknown>,
    options: {
      mode: 'bridge' | 'publish' | 'runtime';
      allowLegacyFallback: boolean;
      source: string;
    }
  ): BrowserRecordingExecutionPlanValidationResult {
    const issues: BrowserRecordingExecutionPlanIssue[] = [];
    const runtimeMetadata = this.resolveRuntimeMetadata(payload);
    const executionPlan = asRecord(runtimeMetadata?.executionPlan);
    const templateSteps = this.resolveTemplateSteps(runtimeMetadata, executionPlan);
    const loopDraft = asRecord(executionPlan?.loopDraft) || asRecord(runtimeMetadata?.loopDraft);
    const outputs = this.resolveOutputs(runtimeMetadata, executionPlan);
    const executionLimits = asRecord(executionPlan?.executionLimits);
    const trace = asRecord(executionPlan?.trace) || asRecord(runtimeMetadata?.trace) || {};
    const executionPlanVersion =
      this.pickFirstNonEmptyString(
        executionPlan?.executionPlanVersion,
        runtimeMetadata?.executionPlanVersion
      ) || null;
    const hasLegacyExecutionFlow =
      Array.isArray(payload.executionFlow) && payload.executionFlow.length > 0;

    if (!executionPlan) {
      const message = `缺少 runtimeMetadata.executionPlan，当前将依赖兼容路径: ${options.source}`;
      if (options.allowLegacyFallback && hasLegacyExecutionFlow) {
        issues.push({
          severity: 'warning',
          code: 'legacy_execution_plan_fallback',
          message,
        });
      } else {
        issues.push({
          severity: 'error',
          code: 'missing_execution_plan',
          message,
        });
      }
    }

    if (executionPlan && executionPlanVersion !== BROWSER_RECORDING_EXECUTION_PLAN_VERSION) {
      issues.push({
        severity: 'warning',
        code: 'unexpected_execution_plan_version',
        message: `executionPlanVersion 不是预期值 ${BROWSER_RECORDING_EXECUTION_PLAN_VERSION}`,
      });
    }

    if (templateSteps.length === 0) {
      const message = 'executionPlan/templateSteps 为空，无法稳定承载 branch/loop 等高级语义';
      if (options.allowLegacyFallback && hasLegacyExecutionFlow) {
        issues.push({
          severity: 'warning',
          code: 'missing_template_steps_fallback_to_execution_flow',
          message,
        });
      } else {
        issues.push({
          severity: 'error',
          code: 'missing_template_steps',
          message,
        });
      }
    }

    const duplicateStepIds = this.findDuplicateStepIds(templateSteps);
    if (duplicateStepIds.length > 0) {
      issues.push({
        severity: 'error',
        code: 'duplicate_step_id',
        message: `存在重复 stepId: ${duplicateStepIds.join(', ')}`,
      });
    }

    const invalidLoopReason = this.validateLoopDraft(loopDraft);
    if (invalidLoopReason) {
      issues.push({
        severity: 'error',
        code: 'invalid_loop_draft',
        message: invalidLoopReason,
      });
    }

    const missingBranchVariables = this.findMissingBranchVariables(
      templateSteps,
      this.collectKnownVariables(payload, executionPlan, templateSteps)
    );
    if (missingBranchVariables.length > 0) {
      issues.push({
        severity: 'error',
        code: 'branch_variable_missing',
        message: `branch 引用了不存在的变量: ${missingBranchVariables.join(', ')}`,
      });
    }

    if (outputs.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'missing_outputs',
        message: 'executionPlan.outputs 为空，发布后结果可读性较弱',
      });
    }

    if (!executionLimits || Object.keys(executionLimits).length === 0) {
      issues.push({
        severity: 'warning',
        code: 'missing_execution_limits',
        message: 'executionPlan.executionLimits 缺失',
      });
    }

    if (!this.pickFirstNonEmptyString(trace.recorderSessionId, trace.exportArtifactId)) {
      issues.push({
        severity: 'warning',
        code: 'missing_trace_ids',
        message: 'executionPlan.trace 缺少 recorderSessionId/exportArtifactId',
      });
    }

    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    const degradeCandidate = [...errors, ...warnings].find((issue) =>
      [
        'missing_execution_plan',
        'legacy_execution_plan_fallback',
        'missing_template_steps',
        'missing_template_steps_fallback_to_execution_flow',
        'invalid_loop_draft',
      ].includes(issue.code)
    );

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      executionPlanVersion,
      degradedMode: Boolean(degradeCandidate),
      degradeReason: degradeCandidate?.code || null,
      trace,
    };
  }

  private resolveRuntimeMetadata(
    payload: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const apiEndpoints = asRecord(payload.apiEndpoints);
    return asRecord(payload.runtimeMetadata) || asRecord(apiEndpoints?.runtimeMetadata);
  }

  private resolveTemplateSteps(
    runtimeMetadata?: Record<string, unknown>,
    executionPlan?: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    const templateSteps = Array.isArray(executionPlan?.templateSteps)
      ? executionPlan.templateSteps
      : Array.isArray(runtimeMetadata?.templateSteps)
        ? runtimeMetadata.templateSteps
        : [];
    return templateSteps.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );
  }

  private resolveOutputs(
    runtimeMetadata?: Record<string, unknown>,
    executionPlan?: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    const outputs = Array.isArray(executionPlan?.outputs)
      ? executionPlan.outputs
      : Array.isArray(runtimeMetadata?.outputs)
        ? runtimeMetadata.outputs
        : [];
    return outputs.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );
  }

  private findDuplicateStepIds(templateSteps: Array<Record<string, unknown>>): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    templateSteps.forEach((step, index) => {
      const stepId = this.pickFirstNonEmptyString(step.step_id, step.id, `step_${index + 1}`);
      if (!stepId) {
        return;
      }
      if (seen.has(stepId)) {
        duplicates.add(stepId);
        return;
      }
      seen.add(stepId);
    });
    return [...duplicates];
  }

  private collectKnownVariables(
    payload: Record<string, unknown>,
    executionPlan: Record<string, unknown> | undefined,
    templateSteps: Array<Record<string, unknown>>
  ): Set<string> {
    const variables = new Set<string>();
    const paramsSchema = asRecord(payload.paramsSchema);
    const paramProperties = asRecord(paramsSchema?.properties) || {};
    Object.keys(paramProperties).forEach((key) => variables.add(key));

    const planParameters = Array.isArray(executionPlan?.parameters) ? executionPlan.parameters : [];
    planParameters.forEach((parameter) => {
      const record = asRecord(parameter);
      const name = this.pickFirstNonEmptyString(record?.name);
      if (name) {
        variables.add(name);
      }
    });

    templateSteps.forEach((step) => {
      const action = this.pickFirstNonEmptyString(step.action);
      const outputVar = this.pickFirstNonEmptyString(step.output_var, step.outputVar);
      if (action === 'read_value' && outputVar) {
        variables.add(outputVar);
      }
    });

    return variables;
  }

  private findMissingBranchVariables(
    templateSteps: Array<Record<string, unknown>>,
    knownVariables: Set<string>
  ): string[] {
    const missing = new Set<string>();

    templateSteps.forEach((step) => {
      const action = this.pickFirstNonEmptyString(step.action);
      if (action !== 'branch') {
        return;
      }
      const branch = asRecord(step.branch);
      const conditionFn = this.pickFirstNonEmptyString(branch?.condition_fn, branch?.conditionFn);
      if (!conditionFn) {
        return;
      }
      this.extractBranchVariables(conditionFn).forEach((variableName) => {
        if (!knownVariables.has(variableName)) {
          missing.add(variableName);
        }
      });
    });

    return [...missing];
  }

  private extractBranchVariables(conditionFn: string): string[] {
    const variables = new Set<string>();

    for (const match of conditionFn.matchAll(/\bctx\.([a-zA-Z_$][\w$]*)/g)) {
      if (match[1]) {
        variables.add(match[1]);
      }
    }

    for (const match of conditionFn.matchAll(/\bctx\[['"]([^'"]+)['"]\]/g)) {
      if (match[1]) {
        variables.add(match[1]);
      }
    }

    return [...variables];
  }

  private validateLoopDraft(loopDraft?: Record<string, unknown>): string | null {
    if (!loopDraft) {
      return null;
    }

    const stopWhen = asRecord(loopDraft.stopWhen);
    const stopRead = asRecord(stopWhen?.read);
    const conditionFn = this.pickFirstNonEmptyString(stopWhen?.conditionFn);
    const description = this.pickFirstNonEmptyString(stopWhen?.description);
    if (!stopWhen || !stopRead || !conditionFn || !description) {
      return 'loopDraft.stopWhen 缺少 read/conditionFn/description';
    }

    const readType = this.pickFirstNonEmptyString(stopRead.type);
    if (!readType || !['count', 'text', 'page_signal'].includes(readType)) {
      return 'loopDraft.stopWhen.read.type 不合法';
    }

    if (readType === 'page_signal') {
      if (!this.pickFirstNonEmptyString(stopRead.key)) {
        return 'loopDraft.stopWhen.read.type=page_signal 时必须提供 key';
      }
      return null;
    }

    const locator = asRecord(stopRead.locator);
    if (
      !locator ||
      !this.pickFirstNonEmptyString(locator.type) ||
      !this.pickFirstNonEmptyString(locator.value)
    ) {
      return 'loopDraft.stopWhen.read 必须提供可解析 locator';
    }

    return null;
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
