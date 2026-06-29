import { Injectable } from '@nestjs/common';
import { BrowserRecordingFlowNormalizerService } from './browser-recording-flow-normalizer.service';
import {
  asFiniteNumber,
  buildRuntimeArgs,
  formatThresholdNumber,
  normalizeStepAction,
  pickFirstNonEmptyString,
  resolveRuntimeTarget,
  resolveRuntimeValue,
} from './browser-recording-runtime-utils';
import { asRecord, BrowserRecordingRuntimeStep } from './browser-recording-runtime.types';

@Injectable()
export class BrowserRecordingRuntimeStepBuilderService {
  constructor(
    private readonly browserRecordingFlowNormalizerService: BrowserRecordingFlowNormalizerService
  ) {}

  buildRuntimeSteps(
    payload: Record<string, unknown>,
    runtimeInput: Record<string, unknown>
  ): BrowserRecordingRuntimeStep[] {
    const templateSteps = this.extractTemplateSteps(payload);
    if (templateSteps.length > 0) {
      return templateSteps.map((step, index) =>
        this.buildRuntimeStepFromTemplate(step, runtimeInput, index)
      );
    }

    const executionFlow = this.browserRecordingFlowNormalizerService.normalizeExecutionFlow(
      payload.executionFlow
    );
    const sourceSteps = Array.isArray(payload.steps)
      ? payload.steps.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];
    const baseSteps = executionFlow.length > 0 ? executionFlow : sourceSteps;

    return baseSteps.map((step, index) => {
      const runtimePayload = asRecord(step.input) || asRecord(step.config) || {};
      const resolvedPayload = asRecord(resolveRuntimeValue(runtimePayload, runtimeInput)) || {};
      const resolvedParams = asRecord(resolvedPayload.params) || {};
      const action = normalizeStepAction(
        pickFirstNonEmptyString(resolvedPayload.action, step.action)
      );
      if (!action) {
        throw new Error(`浏览器录制步骤缺少 action: ${step.id || `step_${index + 1}`}`);
      }
      const target = resolveRuntimeTarget(action, resolvedPayload, resolvedParams);
      const args = buildRuntimeArgs(action, resolvedPayload, resolvedParams);

      return {
        id:
          pickFirstNonEmptyString(step.id, resolvedPayload.id, `step_${index + 1}`) ||
          `step_${index + 1}`,
        name: pickFirstNonEmptyString(step.name, `Step ${index + 1}`) || `Step ${index + 1}`,
        action,
        ...(target ? { target } : {}),
        ...(Object.keys(args).length > 0 ? { args } : {}),
      };
    });
  }

  private extractTemplateSteps(payload: Record<string, unknown>): Array<Record<string, unknown>> {
    const apiEndpoints = asRecord(payload.apiEndpoints);
    const runtimeMetadata =
      asRecord(payload.runtimeMetadata) || asRecord(apiEndpoints?.runtimeMetadata);
    const executionPlan = asRecord(runtimeMetadata?.executionPlan);
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

  private buildRuntimeStepFromTemplate(
    step: Record<string, unknown>,
    runtimeInput: Record<string, unknown>,
    index: number
  ): BrowserRecordingRuntimeStep {
    const resolvedStep = asRecord(resolveRuntimeValue(step, runtimeInput)) || {};
    const stepId =
      pickFirstNonEmptyString(resolvedStep.step_id, resolvedStep.id, `step_${index + 1}`) ||
      `step_${index + 1}`;
    const action = normalizeStepAction(pickFirstNonEmptyString(resolvedStep.action));
    if (!action) {
      throw new Error(`浏览器模板步骤缺少 action: ${stepId}`);
    }

    const params = asRecord(resolvedStep.params) || {};
    const locator = asRecord(resolvedStep.locator) || undefined;
    const target = resolveRuntimeTarget(action, resolvedStep, {
      ...params,
      ...(locator ? { locator } : {}),
    });

    const runtimeArgs = buildRuntimeArgs(action, resolvedStep, params);
    const runtimeStep: BrowserRecordingRuntimeStep = {
      id: stepId,
      name:
        pickFirstNonEmptyString(
          resolvedStep.description,
          resolvedStep.step_id,
          `Step ${index + 1}`
        ) || `Step ${index + 1}`,
      action,
      ...(target ? { target } : {}),
      ...(Object.keys(runtimeArgs).length > 0 ? { args: runtimeArgs } : {}),
      ...(typeof resolvedStep.output_var === 'string' && resolvedStep.output_var.trim()
        ? { outputVar: resolvedStep.output_var.trim() }
        : {}),
      ...(typeof resolvedStep.description === 'string' && resolvedStep.description.trim()
        ? { description: resolvedStep.description.trim() }
        : {}),
    };

    const branch = this.rewriteLegacyThresholdBranch(
      asRecord(resolvedStep.branch),
      resolvedStep,
      runtimeInput
    );
    if (action === 'branch' && branch) {
      const conditionFn = pickFirstNonEmptyString(branch.condition_fn);
      if (!conditionFn) {
        throw new Error(`浏览器模板 branch 步骤缺少 condition_fn: ${stepId}`);
      }
      runtimeStep.branch = {
        conditionFn,
        onMatch: pickFirstNonEmptyString(branch.on_match) === 'stop' ? 'stop' : 'continue',
        onMismatch:
          pickFirstNonEmptyString(branch.on_mismatch) === 'stop'
            ? 'stop'
            : pickFirstNonEmptyString(branch.on_mismatch) === 'continue'
              ? 'continue'
              : 'takeover',
        ...(pickFirstNonEmptyString(branch.takeover_reason)
          ? { takeoverReason: pickFirstNonEmptyString(branch.takeover_reason) }
          : {}),
        ...(pickFirstNonEmptyString(branch.description)
          ? { description: pickFirstNonEmptyString(branch.description) }
          : {}),
      };
    }

    return runtimeStep;
  }

  private rewriteLegacyThresholdBranch(
    branch: Record<string, unknown> | undefined,
    step: Record<string, unknown>,
    runtimeInput: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!branch) {
      return branch;
    }

    const threshold = asFiniteNumber(runtimeInput.grossMarginThreshold);
    if (threshold === undefined) {
      return branch;
    }

    const conditionFn = pickFirstNonEmptyString(branch.condition_fn);
    if (!conditionFn) {
      return branch;
    }

    const thresholdContext = [
      conditionFn,
      pickFirstNonEmptyString(branch.description),
      pickFirstNonEmptyString(branch.takeover_reason),
      pickFirstNonEmptyString(step.description),
    ]
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .join(' ');
    if (!/(gross\s*margin|profit\s*margin|毛利率|粗利率)/i.test(thresholdContext)) {
      return branch;
    }

    const formattedThreshold = formatThresholdNumber(threshold);
    const nextConditionFn = conditionFn.replace(
      /([<>]=?\s*)(-?\d+(?:\.\d+)?)(?![\d.])/,
      `$1${formattedThreshold}`
    );
    if (nextConditionFn === conditionFn) {
      return branch;
    }

    return {
      ...branch,
      condition_fn: nextConditionFn,
    };
  }
}
