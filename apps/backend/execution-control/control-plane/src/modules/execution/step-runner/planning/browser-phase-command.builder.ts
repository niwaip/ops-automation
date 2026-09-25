import { BROWSER_ACTIONS, BROWSER_RUNTIME } from '../browser/browser-execution-constants';
import { isMaskedPlaceholder } from '../../credentials/runtime-credential-resolver.service';
import type { BrowserLoopWorkflowPlanLike } from '../browser/browser-loop-workflow-plan.builder';
import type { PlanDraftLike } from './execution-plan-normalization.service';

export class BrowserPhaseCommandBuilder {
  mapBrowserActivityCommands(
    steps: Record<string, unknown>[],
    activityOrder: number,
    activityName: string,
    resolvedInput: Record<string, unknown>
  ): NonNullable<PlanDraftLike['steps'][number]['commands']> {
    const commands: NonNullable<PlanDraftLike['steps'][number]['commands']> = [];
    steps.forEach((step, index) => {
      const config = {
        ...step,
        ...(this.readRecord(step.config) || {}),
      };
      const normalizedAction = this.normalizeBrowserPhaseCommandAction(
        this.readNonEmptyString(config.action, step.action)
      );
      if (!normalizedAction) {
        return;
      }

      const input = this.buildBrowserPhaseCommandInput(normalizedAction, config, resolvedInput);

      const metadata = {
        stepName: this.rewriteLegacyGrossMarginThresholdText(
          this.readNonEmptyString(step.name) || `${activityName} command ${index + 1}`,
          resolvedInput
        ),
        activityName,
        activityOrder,
        ...(this.buildBrowserPhaseCommandMetadata(normalizedAction, config, resolvedInput) || {}),
      };

      commands.push({
        step_id: `${this.sanitizePhaseKeyFragment(activityName)}__command_${String(index + 1).padStart(2, '0')}`,
        capability_type: BROWSER_RUNTIME.CAPABILITY_TYPE,
        action: normalizedAction,
        input,
        metadata,
      });
    });
    return commands;
  }

  mergeBrowserActivityStepsWithTemplateSteps(
    activitySteps: Record<string, unknown>[],
    templateSteps: Record<string, unknown>[],
    templateStepCursor: number
  ): { steps: Record<string, unknown>[]; nextTemplateStepCursor: number } {
    if (activitySteps.length === 0 || templateSteps.length === 0) {
      return {
        steps: activitySteps,
        nextTemplateStepCursor: templateStepCursor,
      };
    }

    let nextTemplateStepCursor = templateStepCursor;
    const steps = activitySteps.map((step) => {
      const sourceAction = this.normalizeBrowserPhaseCommandAction(
        this.readNonEmptyString(step.action, this.readRecord(step.config)?.action)
      );
      if (!sourceAction) {
        return step;
      }

      for (let index = nextTemplateStepCursor; index < templateSteps.length; index += 1) {
        const templateStep = templateSteps[index];
        const templateAction = this.normalizeBrowserPhaseCommandAction(
          this.readNonEmptyString(templateStep.action, this.readRecord(templateStep.config)?.action)
        );
        if (!templateAction || templateAction !== sourceAction) {
          continue;
        }

        nextTemplateStepCursor = index + 1;
        return {
          ...step,
          ...templateStep,
          config: {
            ...(this.readRecord(step.config) || {}),
            ...(this.readRecord(templateStep.config) || {}),
          },
        };
      }

      return step;
    });

    return {
      steps,
      nextTemplateStepCursor,
    };
  }

  buildBrowserLoopWorkflowActivityStep(input: {
    templateStep: Record<string, unknown>;
    segment: 'pre_loop' | 'iteration' | 'post_loop';
    loopPlan: BrowserLoopWorkflowPlanLike;
    counter: { value: number };
    resolvedInput: Record<string, unknown>;
    loopIteration?: number;
    loopTemplate?: boolean;
  }): PlanDraftLike['steps'][number] {
    input.counter.value += 1;
    const templateStepId =
      this.readNonEmptyString(input.templateStep.step_id, input.templateStep.id) ||
      `template_step_${input.counter.value}`;
    const title =
      this.rewriteLegacyGrossMarginThresholdText(
        this.readNonEmptyString(input.templateStep.description, input.templateStep.name),
        input.resolvedInput
      ) || templateStepId;
    const commands = this.mapBrowserActivityCommands(
      [input.templateStep],
      input.counter.value,
      title,
      input.resolvedInput
    );

    return {
      id: `${input.segment}_${templateStepId}`,
      title,
      description: `执行浏览器步骤 ${title}。`,
      kind: 'tool',
      status: 'planned',
      phase_key: `phase_${String(input.counter.value).padStart(2, '0')}_${this.sanitizePhaseKeyFragment(`${input.segment}_${templateStepId}`)}`,
      phase_name: title,
      phase_type: 'workflow_activity',
      commands,
      loop_id: input.loopPlan.loopId,
      loop_segment: input.segment,
      ...(typeof input.loopIteration === 'number' ? { loop_iteration: input.loopIteration } : {}),
      ...(typeof input.loopTemplate === 'boolean' ? { loop_template: input.loopTemplate } : {}),
      recovery_policy: {
        max_auto_retries: 1,
        allow_human_takeover: true,
      },
    };
  }

  buildBrowserLoopWorkflowControlStep(input: {
    id: string;
    title: string;
    description: string;
    loopPlan: BrowserLoopWorkflowPlanLike;
    stopCondition?: Record<string, unknown>;
  }): PlanDraftLike['steps'][number] {
    return {
      id: input.id,
      title: input.title,
      description: input.description,
      kind: 'control',
      status: 'planned',
      tool_name: 'loop_control',
      phase_key: `phase_${this.sanitizePhaseKeyFragment(input.id)}`,
      phase_name: input.title,
      phase_type: 'loop_control',
      loop_control_action: input.id,
      loop_id: input.loopPlan.loopId,
      loop_segment: 'control',
      ...(input.stopCondition ? { loop_stop_condition: input.stopCondition } : {}),
    };
  }

  buildBrowserPhaseCommandInput(
    action: string,
    config: Record<string, unknown>,
    resolvedInput: Record<string, unknown>
  ): Record<string, unknown> {
    const resolve = (value: unknown): unknown =>
      this.resolveBrowserTemplateValue(value, resolvedInput);
    const params = this.readRecord(config.params) || {};
    const locatorTarget = this.buildBrowserPhaseLocatorTarget(
      this.readRecord(config.locator, params.locator),
      resolvedInput
    );
    const target = this.readNonEmptyString(
      locatorTarget,
      resolve(config.target),
      resolve(params.target),
      resolve(config.selector),
      resolve(params.selector),
      resolve(config.url),
      resolve(params.url),
      resolve(config.text),
      resolve(params.text),
      resolve(config.value),
      resolve(params.value)
    );
    const duration = this.readInteger(
      resolve(config.duration),
      resolve(params.duration),
      resolve(config.timeoutMs),
      resolve(params.timeoutMs)
    );
    const selector = this.readNonEmptyString(
      locatorTarget,
      resolve(config.selector),
      resolve(params.selector),
      resolve(config.target),
      resolve(params.target)
    );
    const value = this.readNonEmptyString(
      resolve(config.value),
      resolve(params.value),
      resolve(config.text),
      resolve(params.text),
      resolve(config.query),
      resolve(params.query)
    );
    const text = this.readNonEmptyString(
      resolve(config.text),
      resolve(params.text),
      resolve(config.value),
      resolve(params.value),
      resolve(config.query),
      resolve(params.query)
    );
    const url = this.readNonEmptyString(
      resolve(config.url),
      resolve(params.url),
      resolve(config.target),
      resolve(params.target)
    );

    const args = (() => {
      switch (action) {
        case BROWSER_ACTIONS.GOTO:
        case 'navigate':
          return Object.fromEntries(
            Object.entries({ url }).filter(([, item]) => item !== undefined)
          );
        case 'fill':
        case 'type_text':
          return Object.fromEntries(
            Object.entries({ selector, value, text }).filter(([, item]) => item !== undefined)
          );
        case 'click':
        case 'hover':
        case 'screenshot':
        case 'snapshot':
        case 'read_page':
        case 'get_text':
          return Object.fromEntries(
            Object.entries({ selector }).filter(([, item]) => item !== undefined)
          );
        case 'wait':
          return Object.fromEntries(
            Object.entries({ duration, selector }).filter(([, item]) => item !== undefined)
          );
        default:
          return Object.fromEntries(
            Object.entries({
              duration,
              selector,
              value,
              text,
              url,
            }).filter(([, item]) => item !== undefined)
          );
      }
    })();

    return {
      ...(target ? { target } : {}),
      ...(Object.keys(args).length > 0 ? { args } : {}),
    };
  }

  buildBrowserPhaseCommandMetadata(
    action: string,
    config: Record<string, unknown>,
    resolvedInput: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {};
    const outputVar = this.readNonEmptyString(config.outputVar, config.output_var);
    if (outputVar) {
      metadata.outputVar = outputVar;
    }

    if (action === 'branch') {
      const branch = this.readRecord(config.branch);
      const conditionFn = this.readNonEmptyString(branch?.conditionFn, branch?.condition_fn);
      if (conditionFn) {
        metadata.branch = {
          conditionFn,
          onMatch:
            this.readNonEmptyString(branch?.onMatch, branch?.on_match) === 'stop'
              ? 'stop'
              : 'continue',
          onMismatch:
            this.readNonEmptyString(branch?.onMismatch, branch?.on_mismatch) === 'takeover'
              ? 'takeover'
              : this.readNonEmptyString(branch?.onMismatch, branch?.on_mismatch) === 'continue'
                ? 'continue'
                : 'stop',
          ...(this.readNonEmptyString(branch?.takeoverReason, branch?.takeover_reason)
            ? {
                takeoverReason: this.rewriteLegacyGrossMarginThresholdText(
                  this.readNonEmptyString(branch?.takeoverReason, branch?.takeover_reason),
                  resolvedInput
                ),
              }
            : {}),
          ...(this.readNonEmptyString(branch?.description)
            ? {
                description: this.rewriteLegacyGrossMarginThresholdText(
                  this.readNonEmptyString(branch?.description),
                  resolvedInput
                ),
              }
            : {}),
        };
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  resolveBrowserTemplateValue(value: unknown, resolvedInput: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      const resolvePlaceholder = (match: string, rawKey: string): string => {
        const key = rawKey.trim();
        const lower = key.toLowerCase();
        let resolved =
          resolvedInput[key] ??
          Object.entries(resolvedInput).find(([k]) => k.toLowerCase() === lower)?.[1];
        if (resolved === undefined || resolved === null) {
          if (['username', 'user', 'account'].includes(lower)) {
            resolved =
              resolvedInput.username ??
              resolvedInput.userName ??
              resolvedInput.user ??
              resolvedInput.account;
          } else if (['password', 'logincredential', 'secret'].includes(lower)) {
            resolved =
              resolvedInput.password ??
              resolvedInput.loginCredential ??
              resolvedInput.passwd ??
              resolvedInput.secret;
          }
        }
        if (
          resolved === undefined ||
          resolved === null ||
          (typeof resolved === 'string' &&
            (isMaskedPlaceholder(resolved) || /^\$\{[^}]+\}$/.test(resolved.trim())))
        ) {
          return match;
        }
        return String(resolved);
      };

      return [
        /\$\{\s*([^}]+?)\s*\}/g,
        /\{\{\s*([^}]+?)\s*\}\}/g,
        /\{([A-Za-z0-9_.[\]-]+)\}/g,
      ].reduce(
        (current, pattern) =>
          current.replace(pattern, (match, key) => resolvePlaceholder(match, String(key))),
        value
      );
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveBrowserTemplateValue(item, resolvedInput));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.resolveBrowserTemplateValue(item, resolvedInput),
        ])
      );
    }
    return value;
  }

  rewriteLegacyGrossMarginThresholdText(
    value: string | undefined,
    resolvedInput: Record<string, unknown>
  ): string | undefined {
    const resolvedValue = this.readNonEmptyString(
      this.resolveBrowserTemplateValue(value, resolvedInput),
      value
    );
    if (!resolvedValue) {
      return resolvedValue;
    }

    const threshold = this.readNonEmptyString(
      resolvedInput.grossMarginThreshold,
      resolvedInput.gross_margin_threshold
    );
    if (!threshold) {
      return resolvedValue;
    }

    if (
      !/(毛利率|粗利率|gross.?margin|profit.?margin|自动化承认|承认操作|人工介入|人工接管|阈值|未达到|条件满足)/i.test(
        resolvedValue
      )
    ) {
      return resolvedValue;
    }

    const normalizedThreshold = threshold.replace(/%/g, '').trim();
    if (!normalizedThreshold) {
      return resolvedValue;
    }

    return resolvedValue.replace(/(?<![\d.])-?\d+(?:\.\d+)?(?=\s*%)/g, normalizedThreshold);
  }

  normalizeBrowserPhaseCommandAction(action: string | undefined): string | undefined {
    if (!action) {
      return undefined;
    }

    const normalized = action.trim().toLowerCase();
    switch (normalized) {
      case 'navigate':
        return BROWSER_ACTIONS.GOTO;
      case 'read_value':
        return 'get_text';
      case 'waitforselector':
        return BROWSER_ACTIONS.WAIT;
      case 'press':
        return BROWSER_ACTIONS.PRESS_KEY;
      case 'type':
        return BROWSER_ACTIONS.TYPE_TEXT;
      default:
        return normalized;
    }
  }

  sanitizePhaseKeyFragment(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'phase'
    );
  }

  readRecordArray(source: unknown, key?: string): Record<string, unknown>[] {
    const target =
      key && source && typeof source === 'object' && !Array.isArray(source)
        ? (source as Record<string, unknown>)[key]
        : source;
    return Array.isArray(target)
      ? target.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];
  }

  readRecord(...values: unknown[]): Record<string, unknown> | null {
    for (const value of values) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return null;
  }

  readNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  readInteger(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return Math.trunc(parsed);
        }
      }
    }
    return undefined;
  }

  buildBrowserPhaseLocatorTarget(
    locator: Record<string, unknown> | null,
    resolvedInput: Record<string, unknown>
  ): string | undefined {
    if (!locator) {
      return undefined;
    }
    const type = this.readNonEmptyString(locator.type)?.toLowerCase();
    const rawValue = this.resolveBrowserTemplateValue(locator.value, resolvedInput);
    const value = this.readNonEmptyString(rawValue);
    if (!type || !value) {
      return undefined;
    }

    switch (type) {
      case 'css':
      case 'selector':
        return value;
      case 'role':
        return `role=${value}`;
      case 'text':
        return `text=${value}`;
      case 'label':
        return `internal:label="${value}"`;
      case 'testid':
      case 'data-testid':
        return `[data-testid="${value}"]`;
      case 'xpath':
        return `xpath=${value}`;
      default:
        return value;
    }
  }
}
