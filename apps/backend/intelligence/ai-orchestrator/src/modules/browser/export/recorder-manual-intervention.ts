import type { RecorderManualInterventionRecord } from '../loop';
import type {
  OptionalManualInterventionPlan,
  SessionLike,
  TemplateStepArtifactLike,
} from './recorder-template-export.types';

export function inferTemplateLocatorType(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('.') ||
    trimmed.startsWith('[') ||
    /^[a-z][a-z0-9_-]*(\b|[#.[:>])/i.test(trimmed) ||
    trimmed.includes('>') ||
    trimmed.includes(':')
  ) {
    return 'css';
  }
  return 'text';
}

export function appendOptionalManualInterventionStepsForIndex(
  templateSteps: TemplateStepArtifactLike[],
  session: SessionLike,
  commandIndex: number,
  nextStepId: () => string,
  consumedManualInterventionIds: Set<string>
): void {
  const interventions = (session.manualInterventions || []).filter(
    (item) =>
      item.behavior === 'optional_takeover_if_present' &&
      item.startCommandIndex === commandIndex &&
      !consumedManualInterventionIds.has(item.id)
  );

  interventions.forEach((item, interventionIndex) => {
    const plan = buildOptionalManualInterventionPlan(item);
    if (!plan) {
      consumedManualInterventionIds.add(item.id);
      return;
    }
    appendOptionalManualInterventionCheckpoint(
      templateSteps,
      item.label,
      plan,
      `manual_checkpoint_${commandIndex}_${interventionIndex}`,
      nextStepId
    );
    consumedManualInterventionIds.add(item.id);
  });
}

export function buildOptionalManualInterventionPlan(
  item: Pick<RecorderManualInterventionRecord, 'label' | 'signal'>
): OptionalManualInterventionPlan | null {
  const normalizedLabel = item.label.trim();
  if (!normalizedLabel) {
    return null;
  }
  return {
    ...(item.signal ? { signal: item.signal } : {}),
    ...(!item.signal
      ? {
          pattern: normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        }
      : {}),
    description: `如果页面出现${normalizedLabel}提示，则暂停自动执行并等待人工介入`,
    takeoverReason: `检测到${normalizedLabel}提示，请人工介入后继续执行`,
  };
}

export function appendInitialOptionalManualInterventionPrechecks(
  templateSteps: TemplateStepArtifactLike[],
  session: SessionLike,
  nextStepId: () => string
): void {
  const interventions = (session.manualInterventions || []).filter(
    (item) => item.behavior === 'optional_takeover_if_present'
  );

  interventions.forEach((item, index) => {
    const plan = buildOptionalManualInterventionPlan(item);
    if (!plan?.signal?.precheckBeforeRecordedCommands) {
      return;
    }
    appendOptionalManualInterventionCheckpoint(
      templateSteps,
      item.label,
      plan,
      `manual_precheck_${index}`,
      nextStepId
    );
  });
}

export function appendOptionalManualInterventionCheckpoint(
  templateSteps: TemplateStepArtifactLike[],
  label: string,
  plan: OptionalManualInterventionPlan,
  outputVarPrefix: string,
  nextStepId: () => string
): void {
  if (plan.signal) {
    const signalOutputVar = `${outputVarPrefix}_signal`;
    const fallbackOutputVar = `${outputVarPrefix}_text`;
    const selector = plan.signal.selector.trim();
    const maxLength =
      plan.signal.method === 'attribute' || plan.signal.method === 'visible' ? 128 : 12000;
    templateSteps.push({
      step_id: nextStepId(),
      action: 'read_value',
      locator: {
        type: inferTemplateLocatorType(selector),
        value: selector,
      },
      params: {
        selector,
        method: plan.signal.method,
        ...(plan.signal.attribute ? { attribute: plan.signal.attribute } : {}),
        max_length: maxLength,
      },
      output_var: signalOutputVar,
      description: `读取${label}页面信号`,
    });
    if (plan.signal.fallbackPattern) {
      templateSteps.push({
        step_id: nextStepId(),
        action: 'read_value',
        locator: {
          type: 'css',
          value: 'body',
        },
        params: {
          selector: 'body',
          method: 'innerText',
          max_length: 12000,
        },
        output_var: fallbackOutputVar,
        description: `检查是否出现${label}提示`,
      });
    }
    const expectedValue = (plan.signal.expectedValue || '').trim().toLowerCase();
    const fallbackCondition = plan.signal.fallbackPattern
      ? ` return !/${plan.signal.fallbackPattern}/i.test(String(ctx.${fallbackOutputVar} || "")); `
      : ' return true; ';
    templateSteps.push({
      step_id: nextStepId(),
      action: 'branch',
      branch: {
        condition_fn: `(ctx) => { const signalValue = String(ctx.${signalOutputVar} || "").trim().toLowerCase(); if (signalValue) { return signalValue !== ${JSON.stringify(expectedValue)}; }${fallbackCondition}}`,
        on_match: 'continue',
        on_mismatch: 'takeover',
        takeover_reason: plan.takeoverReason,
        description: plan.description,
      },
      description: plan.description,
    });
    return;
  }

  const pattern = plan.pattern;
  if (!pattern) {
    return;
  }
  templateSteps.push({
    step_id: nextStepId(),
    action: 'read_value',
    locator: {
      type: 'css',
      value: 'body',
    },
    params: {
      selector: 'body',
      method: 'innerText',
      max_length: 12000,
    },
    output_var: outputVarPrefix,
    description: `检查是否出现${label}提示`,
  });
  templateSteps.push({
    step_id: nextStepId(),
    action: 'branch',
    branch: {
      condition_fn: `(ctx) => !/${pattern}/i.test(String(ctx.${outputVarPrefix} || ""))`,
      on_match: 'continue',
      on_mismatch: 'takeover',
      takeover_reason: plan.takeoverReason,
      description: plan.description,
    },
    description: plan.description,
  });
}

