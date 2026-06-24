import { Injectable } from '@nestjs/common';
import { BranchAnalysisService } from '../../branch-analysis/branch-analysis.service';
import { BrowserCommand } from '../intent';
import type { BrowserCommandCandidate } from '../intent';
import {
  RecorderLoopDraftState,
  RecorderLoopService,
  RecorderManualInterventionRecord,
  RecorderManualInterventionSignal,
} from '../loop';

interface ObservationLike {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  candidates?: BrowserCommandCandidate[];
  headings: string[];
  links: string[];
}

interface SessionLike {
  runtimeSessionId: string;
  currentPageUrl?: string;
  lastObservation?: ObservationLike;
  loopDraft?: RecorderLoopDraftState;
  manualInterventions?: RecorderManualInterventionRecord[];
  history: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    observation?: ObservationLike;
    commands?: BrowserCommand[];
    execution?: {
      results?: Array<Record<string, unknown>>;
    };
  }>;
  executedCommands: BrowserCommand[];
}

interface TemplateBranchConfigLike {
  condition_fn: string;
  on_match: 'continue' | 'stop';
  on_mismatch: 'continue' | 'stop' | 'takeover';
  takeover_reason?: string;
  description?: string;
}

interface TemplateStepArtifactLike {
  step_id: string;
  action: string;
  locator?: {
    type: string;
    value: string;
  };
  params?: Record<string, string | number>;
  output_var?: string;
  branch?: TemplateBranchConfigLike;
  description?: string;
}

interface OptionalManualInterventionPlan {
  signal?: RecorderManualInterventionSignal;
  pattern?: string;
  description: string;
  takeoverReason: string;
}

@Injectable()
export class RecorderTemplateExportService {
  constructor(
    private readonly branchAnalysisService: BranchAnalysisService,
    private readonly recorderLoopService: RecorderLoopService
  ) {}

  async buildTemplateStepsForExport(
    session: SessionLike,
    userGoal: string
  ): Promise<TemplateStepArtifactLike[] | undefined> {
    const branchIntentContext = this.buildBranchGenerationIntentContext(session, userGoal);
    const detailObservation = this.findLatestMeaningfulObservation(
      session,
      branchIntentContext.turnIndex
    );
    if (!detailObservation) {
      return undefined;
    }

    const startUrl = this.findExportStartUrl(session);
    if (!startUrl) {
      return undefined;
    }
    const exportStartCommandIndex = this.findExportStartCommandIndex(session, startUrl);

    const branchIntent = branchIntentContext.intent;
    const loopPendingKeyword = this.recorderLoopService.deriveLoopPendingKeyword(
      session,
      session.loopDraft
    );
    const { preLoopCommands, iterationCommands } =
      this.recorderLoopService.splitRecordedCommandsForExport(session, startUrl);
    const templateSteps: TemplateStepArtifactLike[] = [
      {
        step_id: 'step_1',
        action: 'navigate',
        params: {
          url: startUrl,
        },
        description: '打开起始页面',
      },
    ];
    const nextStepId = () => `step_${templateSteps.length + 1}`;
    const consumedManualInterventionIds = new Set<string>();
    this.appendInitialOptionalManualInterventionPrechecks(templateSteps, session, nextStepId);
    this.appendTemplateStepsFromCommandRange(
      templateSteps,
      preLoopCommands,
      exportStartCommandIndex,
      nextStepId,
      session,
      consumedManualInterventionIds
    );

    const [loopEntryCommand, ...recordedDetailFlowCommands] = iterationCommands;
    const loopEntryCommandGlobalIndex = exportStartCommandIndex + preLoopCommands.length;
    if (loopEntryCommand) {
      this.appendOptionalManualInterventionStepsForIndex(
        templateSteps,
        session,
        loopEntryCommandGlobalIndex,
        nextStepId,
        consumedManualInterventionIds
      );
      templateSteps.push(
        this.buildParameterizedRowDetailStep(
          nextStepId(),
          loopEntryCommand,
          loopPendingKeyword,
          session
        )
      );
    }

    if (!branchIntent) {
      this.appendTemplateStepsFromCommandRange(
        templateSteps,
        recordedDetailFlowCommands,
        loopEntryCommand ? loopEntryCommandGlobalIndex + 1 : loopEntryCommandGlobalIndex,
        nextStepId,
        session,
        consumedManualInterventionIds
      );
      this.appendOptionalManualInterventionStepsForIndex(
        templateSteps,
        session,
        session.executedCommands.length,
        nextStepId,
        consumedManualInterventionIds
      );
      return this.normalizeExportTemplateSteps(templateSteps);
    }

    const branchAnalysis = await this.branchAnalysisService.analyzeBranchCondition({
      runtimeSessionId: session.runtimeSessionId,
      userIntent: branchIntent,
      onMismatch: 'takeover',
      pageSignals: {
        buttons: detailObservation.buttons
          .map((button) => (typeof button.text === 'string' ? button.text : ''))
          .filter(Boolean),
        headings: detailObservation.headings,
        links: detailObservation.links,
        currentPageUrl: detailObservation.currentPageUrl || session.currentPageUrl,
        pageTitle: detailObservation.title,
        pageText: detailObservation.text,
      },
    });
    const branchSpec = branchAnalysis.branchStepSpec;
    const branchReadSelector = this.resolvePreferredBranchReadSelector(
      detailObservation,
      branchSpec.readSelectors,
      branchSpec.outputVar,
      branchIntent
    );
    const branchReadMaxLength = /^(body|html)$/i.test(branchReadSelector.trim())
      ? 12000
      : undefined;

    templateSteps.push({
      step_id: nextStepId(),
      action: 'read_value',
      locator: {
        type: this.inferTemplateLocatorType(branchReadSelector),
        value: branchReadSelector,
      },
      params: {
        selector: branchReadSelector,
        method: branchSpec.readMethod,
        ...(branchReadMaxLength ? { max_length: branchReadMaxLength } : {}),
      },
      output_var: branchSpec.outputVar,
      description: `读取条件值：${branchSpec.description}`,
    });
    templateSteps.push({
      step_id: nextStepId(),
      action: 'branch',
      branch: {
        condition_fn: branchSpec.conditionFn,
        on_match: branchSpec.onMatch,
        on_mismatch: branchSpec.onMismatch,
        takeover_reason: branchSpec.takeoverReason,
        description: branchSpec.description,
      },
      description: branchSpec.description,
    });

    if (branchAnalysis.nextAction?.action === 'click') {
      const locator = branchAnalysis.nextAction.selector
        ? {
            type: this.inferTemplateLocatorType(branchAnalysis.nextAction.selector),
            value: branchAnalysis.nextAction.selector,
          }
        : this.buildTemplateLocatorFromLabel(
            branchAnalysis.nextAction.text,
            branchAnalysis.nextAction.description
          );
      if (locator) {
        templateSteps.push({
          step_id: nextStepId(),
          action: 'click',
          locator,
          description: branchAnalysis.nextAction.description,
        });
      }
    }

    const remainingRecordedDetailFlowCommands =
      branchAnalysis.nextAction?.action === 'click' &&
      this.matchesBranchNextAction(recordedDetailFlowCommands[0], branchAnalysis.nextAction)
        ? recordedDetailFlowCommands.slice(1)
        : recordedDetailFlowCommands;

    if (branchAnalysis.nextAction?.action !== 'click') {
      this.appendTemplateStepsFromCommandRange(
        templateSteps,
        recordedDetailFlowCommands,
        loopEntryCommand ? loopEntryCommandGlobalIndex + 1 : loopEntryCommandGlobalIndex,
        nextStepId,
        session,
        consumedManualInterventionIds
      );
    } else {
      this.appendTemplateStepsFromCommandRange(
        templateSteps,
        remainingRecordedDetailFlowCommands,
        loopEntryCommand ? loopEntryCommandGlobalIndex + 2 : loopEntryCommandGlobalIndex + 1,
        nextStepId,
        session,
        consumedManualInterventionIds
      );
    }

    this.appendOptionalManualInterventionStepsForIndex(
      templateSteps,
      session,
      session.executedCommands.length,
      nextStepId,
      consumedManualInterventionIds
    );

    return this.normalizeExportTemplateSteps(templateSteps);
  }

  sanitizeRecordedCommandsForExport(commands: BrowserCommand[]): BrowserCommand[] {
    const normalized: BrowserCommand[] = [];
    let setupBuffer: BrowserCommand[] = [];

    const flushSetupBuffer = () => {
      if (setupBuffer.length === 0) {
        return;
      }
      normalized.push(...this.dedupeSetupCommands(setupBuffer));
      setupBuffer = [];
    };

    for (const command of commands) {
      if (command.tool === 'navigate' || command.tool === 'fill') {
        setupBuffer.push(command);
        continue;
      }
      flushSetupBuffer();
      normalized.push(command);
    }

    flushSetupBuffer();
    return normalized;
  }

  findLatestMeaningfulObservation(
    session: SessionLike,
    preferredTurnIndex?: number
  ): ObservationLike | undefined {
    if (typeof preferredTurnIndex === 'number') {
      for (let index = preferredTurnIndex; index < session.history.length; index += 1) {
        const observation = session.history[index]?.observation;
        if (this.isMeaningfulObservation(observation)) {
          return observation;
        }
      }
      for (let index = preferredTurnIndex; index >= 0; index -= 1) {
        const observation = session.history[index]?.observation;
        if (this.isMeaningfulObservation(observation)) {
          return observation;
        }
      }
    }

    for (const turn of [...session.history].reverse()) {
      const observation = turn.observation;
      if (this.isMeaningfulObservation(observation)) {
        return observation;
      }
    }
    return session.lastObservation;
  }

  findExportStartUrl(session: SessionLike): string | undefined {
    const navigateCommand = session.executedCommands.find(
      (command) => command.tool === 'navigate' && typeof command.params.url === 'string'
    );
    if (typeof navigateCommand?.params.url === 'string' && navigateCommand.params.url.trim()) {
      return navigateCommand.params.url.trim();
    }
    return session.currentPageUrl?.trim();
  }

  findExportStartCommandIndex(session: SessionLike, startUrl: string): number {
    const commands = Array.isArray(session.executedCommands) ? session.executedCommands : [];
    const navigateIndex = commands.findIndex(
      (command) =>
        command.tool === 'navigate' &&
        typeof command.params.url === 'string' &&
        command.params.url.trim() === startUrl
    );
    return navigateIndex >= 0 ? navigateIndex + 1 : 0;
  }

  buildBranchGenerationIntentContext(
    session: SessionLike,
    userGoal: string
  ): { intent?: string; turnIndex?: number } {
    const candidates = session.history
      .map((turn, index) => ({ index, role: turn.role, content: turn.content.trim() }))
      .filter((turn) => turn.role === 'user' && turn.content);

    const explicitBranchIntent = [...candidates]
      .reverse()
      .find((turn) => this.isExplicitConditionalControlIntent(turn.content));
    if (explicitBranchIntent) {
      return {
        intent: explicitBranchIntent.content,
        turnIndex: explicitBranchIntent.index,
      };
    }

    const loopActionIntent = [...candidates]
      .reverse()
      .find((turn) => this.isLoopActionControlIntent(turn.content));
    if (loopActionIntent) {
      return {
        intent: loopActionIntent.content,
        turnIndex: loopActionIntent.index,
      };
    }

    if (
      this.isExplicitConditionalControlIntent(userGoal) ||
      this.isLoopActionControlIntent(userGoal)
    ) {
      return { intent: userGoal };
    }
    return {};
  }

  isExplicitConditionalControlIntent(content: string): boolean {
    const normalized = content.trim();
    if (!normalized) {
      return false;
    }

    const hasConditionalSignal =
      /(分歧|条件|如果|若|满足|不满足|大于|小于|高于|低于|超过|不足|否则|人工介入|人工接管|takeover|阈值|自动执行|直接执行|命中|未命中)/i.test(
        normalized
      );
    if (!hasConditionalSignal) {
      return false;
    }

    const isNavigationOnly =
      /^(?:\[[^\]]+\]\s*)?(?:返回|回到|进入|打开|点击|查看|切换|跳转|去往)/.test(normalized) &&
      !/(如果|若|否则|满足|不满足|大于|小于|高于|低于|超过|不足|人工介入|人工接管|takeover|阈值|自动执行|直接执行)/i.test(
        normalized
      );
    return !isNavigationOnly;
  }

  isLoopActionControlIntent(content: string): boolean {
    const normalized = content.trim();
    if (!normalized) {
      return false;
    }

    const hasLoopCue = /(循环处理|批量处理|逐条|全部|遍历|直到没有|直到无|首条|第一条)/.test(
      normalized
    );
    const hasActionCue = /(审批|批准|承认|通过|拒绝|驳回)/i.test(normalized);
    const isNavigationOnly =
      /^(?:\[[^\]]+\]\s*)?(?:返回|回到|进入|打开|点击|查看|切换|跳转|去往)/.test(normalized);
    return hasLoopCue && hasActionCue && !isNavigationOnly;
  }

  buildParameterizedRowDetailStep(
    stepId: string,
    command: BrowserCommand,
    loopPendingKeyword?: string,
    session?: SessionLike
  ): TemplateStepArtifactLike {
    const baseStep = this.buildTemplateStepFromRecordedCommand(command, stepId, session);
    if (!baseStep) {
      return {
        step_id: stepId,
        action: 'takeover_gate',
        description: '未能稳定推导循环首步，请按页面提示继续执行',
      };
    }

    const indexedLocator = this.toIndexedLoopItemTemplateLocator(
      baseStep.locator,
      loopPendingKeyword
    );
    if (!indexedLocator) {
      return {
        ...baseStep,
        description: baseStep.description || '打开当前待处理项详情',
      };
    }

    return {
      ...baseStep,
      locator: indexedLocator,
      description: '打开当前待处理项详情',
    };
  }

  appendTemplateStepsFromCommands(
    templateSteps: TemplateStepArtifactLike[],
    commands: BrowserCommand[],
    nextStepId: () => string,
    session?: SessionLike
  ): void {
    commands.forEach((command) => {
      const step = this.buildTemplateStepFromRecordedCommand(command, nextStepId(), session);
      if (step) {
        templateSteps.push(step);
      }
    });
  }

  appendTemplateStepsFromCommandRange(
    templateSteps: TemplateStepArtifactLike[],
    commands: BrowserCommand[],
    startCommandIndex: number,
    nextStepId: () => string,
    session: SessionLike,
    consumedManualInterventionIds: Set<string>
  ): void {
    commands.forEach((command, localIndex) => {
      this.appendOptionalManualInterventionStepsForIndex(
        templateSteps,
        session,
        startCommandIndex + localIndex,
        nextStepId,
        consumedManualInterventionIds
      );
      const step = this.buildTemplateStepFromRecordedCommand(command, nextStepId(), session);
      if (step) {
        templateSteps.push(step);
      }
    });
  }

  buildTemplateStepFromRecordedCommand(
    command: BrowserCommand,
    stepId: string,
    session?: SessionLike
  ): TemplateStepArtifactLike | undefined {
    const action = typeof command.tool === 'string' ? command.tool.trim() : '';
    if (!action) {
      return undefined;
    }

    const locator = this.toTemplateLocator(command, session);
    const params = this.toTemplateParams(command.params, ['selector', 'text', 'target']);
    const description =
      typeof command.description === 'string' && command.description.trim()
        ? command.description.trim()
        : undefined;

    if (action === 'click' && !locator && !params) {
      return {
        step_id: stepId,
        action: 'takeover_gate',
        description: description || '页面存在待处理操作，请根据当前页面提示继续执行',
      };
    }

    return {
      step_id: stepId,
      action,
      ...(locator ? { locator } : {}),
      ...(params ? { params } : {}),
      ...(description ? { description } : {}),
    };
  }

  toTemplateLocator(
    command: BrowserCommand,
    session?: SessionLike
  ): TemplateStepArtifactLike['locator'] | undefined {
    const targetLocator = this.toTemplateLocatorFromTarget(command.params.target);
    if (targetLocator) {
      return targetLocator;
    }

    const resolvedRefLocator = this.resolveTemplateLocatorFromRecordedRef(command, session);
    if (resolvedRefLocator) {
      return resolvedRefLocator;
    }

    if (command.locator?.strategy && command.locator.value) {
      const runtimeLocator = this.toTemplateLocatorFromRuntimeLocator(command.locator);
      if (runtimeLocator) {
        return runtimeLocator;
      }
    }

    if (typeof command.params.selector === 'string' && command.params.selector.trim()) {
      if (this.isEphemeralRuntimeHandle(command.params.selector)) {
        return this.toTemplateLocatorFromDescription(command.description);
      }
      return {
        type: this.inferTemplateLocatorType(command.params.selector),
        value: command.params.selector,
      };
    }

    if (typeof command.params.text === 'string' && command.params.text.trim()) {
      if (this.isEphemeralRuntimeHandle(command.params.text)) {
        return this.toTemplateLocatorFromDescription(command.description);
      }
      return this.buildTemplateLocatorFromLabel(command.params.text, command.description);
    }

    const descriptionLocator = this.toTemplateLocatorFromDescription(command.description);
    if (descriptionLocator) {
      return descriptionLocator;
    }

    return undefined;
  }

  matchesBranchNextAction(
    command: BrowserCommand | undefined,
    nextAction:
      | {
          action?: string;
          selector?: string;
          text?: string;
          description?: string;
        }
      | undefined
  ): boolean {
    if (!command || command.tool !== 'click' || nextAction?.action !== 'click') {
      return false;
    }

    const normalize = (value: unknown): string =>
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    const nextSelector = normalize(nextAction.selector);
    const nextText = normalize(nextAction.text);
    const commandDescription = normalize(command.description);
    const commandTarget = normalize(command.params.target);
    const commandText = normalize(command.params.text);
    const locatorValue = normalize(command.locator?.value);
    const locatorName = normalize(command.locator?.name);

    if (nextSelector) {
      return [commandTarget, normalize(command.params.selector), locatorValue].includes(
        nextSelector
      );
    }

    if (!nextText) {
      return false;
    }

    return [commandText, commandTarget, locatorName, commandDescription].some(
      (value) =>
        value.length > 0 &&
        (value === nextText || value.includes(nextText) || nextText.includes(value))
    );
  }

  private appendOptionalManualInterventionStepsForIndex(
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
      const plan = this.buildOptionalManualInterventionPlan(item);
      if (!plan) {
        consumedManualInterventionIds.add(item.id);
        return;
      }
      this.appendOptionalManualInterventionCheckpoint(
        templateSteps,
        item.label,
        plan,
        `manual_checkpoint_${commandIndex}_${interventionIndex}`,
        nextStepId
      );
      consumedManualInterventionIds.add(item.id);
    });
  }

  private buildOptionalManualInterventionPlan(
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

  private appendInitialOptionalManualInterventionPrechecks(
    templateSteps: TemplateStepArtifactLike[],
    session: SessionLike,
    nextStepId: () => string
  ): void {
    const interventions = (session.manualInterventions || []).filter(
      (item) => item.behavior === 'optional_takeover_if_present'
    );

    interventions.forEach((item, index) => {
      const plan = this.buildOptionalManualInterventionPlan(item);
      if (!plan?.signal?.precheckBeforeRecordedCommands) {
        return;
      }
      this.appendOptionalManualInterventionCheckpoint(
        templateSteps,
        item.label,
        plan,
        `manual_precheck_${index}`,
        nextStepId
      );
    });
  }

  private appendOptionalManualInterventionCheckpoint(
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
          type: this.inferTemplateLocatorType(selector),
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

  toIndexedLoopItemTemplateLocator(
    locator: TemplateStepArtifactLike['locator'] | undefined,
    loopPendingKeyword?: string
  ): TemplateStepArtifactLike['locator'] | undefined {
    if (!locator || typeof locator.value !== 'string') {
      return undefined;
    }

    const trimmedLocatorValue = locator.value.trim();
    const locatorValue = this.normalizeLocatorForLoopIndexing(locator, trimmedLocatorValue);
    const indexedValue = this.recorderLoopService.toIndexedLoopItemLocator(
      locatorValue,
      '${rowIndex}',
      loopPendingKeyword
    );
    if (!indexedValue) {
      return undefined;
    }

    return {
      type: 'css',
      value: indexedValue,
    };
  }

  private normalizeLocatorForLoopIndexing(
    locator: NonNullable<TemplateStepArtifactLike['locator']>,
    trimmedLocatorValue: string
  ): string {
    if (
      locator.type === 'text' &&
      !trimmedLocatorValue.startsWith('text=') &&
      !trimmedLocatorValue.startsWith(':nth-match(') &&
      !/^[#.:\[]/.test(trimmedLocatorValue)
    ) {
      return `text=${locator.value}`;
    }

    if (locator.type === 'role') {
      const roleMatch = trimmedLocatorValue.match(/^([a-zA-Z_][\w-]*)\[name="(.+)"\]$/);
      if (roleMatch?.[1] && roleMatch[2]) {
        const tag = roleMatch[1].trim().toLowerCase();
        const label = roleMatch[2].trim().replace(/"/g, '\\"');
        if (tag === 'button') {
          return `button:has-text("${label}")`;
        }
        if (tag === 'link') {
          return `a:has-text("${label}")`;
        }
      }
    }

    return locator.value;
  }

  toTemplateLocatorFromTarget(target: unknown): TemplateStepArtifactLike['locator'] | undefined {
    if (typeof target !== 'string' || !target.trim()) {
      return undefined;
    }

    const roleMatch = target.trim().match(/^([a-zA-Z_][\w-]*)\[name=(["'])(.+)\2\]$/);
    if (roleMatch?.[1] && roleMatch[3]) {
      return {
        type: 'role',
        value: `${roleMatch[1]}[name="${roleMatch[3]}"]`,
      };
    }

    return undefined;
  }

  toTemplateLocatorFromRuntimeLocator(
    locator: NonNullable<BrowserCommand['locator']>
  ): TemplateStepArtifactLike['locator'] | undefined {
    const strategy = typeof locator.strategy === 'string' ? locator.strategy : '';
    const value = typeof locator.value === 'string' ? locator.value : '';
    const type = this.mapTemplateLocatorType(strategy);
    if (!type) {
      return undefined;
    }

    if (
      strategy === 'role' &&
      typeof locator.role === 'string' &&
      locator.role.trim() &&
      typeof locator.name === 'string' &&
      locator.name.trim()
    ) {
      const escapedName = locator.name.trim().replace(/"/g, '\\"');
      return {
        type,
        value: `${locator.role.trim()}[name="${escapedName}"]`,
      };
    }

    if (!value.trim()) {
      return undefined;
    }

    return {
      type,
      value,
    };
  }

  toTemplateParams(
    params: Record<string, unknown>,
    omitKeys: string[] = []
  ): Record<string, string | number> | undefined {
    const entries = Object.entries(params).filter(
      ([key, value]) =>
        !omitKeys.includes(key) && (typeof value === 'string' || typeof value === 'number')
    );

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries) as Record<string, string | number>;
  }

  mapTemplateLocatorType(strategy: string): string | undefined {
    switch (strategy) {
      case 'css':
      case 'role':
      case 'text':
      case 'label':
      case 'placeholder':
      case 'testid':
        return strategy === 'testid' ? 'test-id' : strategy;
      default:
        return undefined;
    }
  }

  inferTemplateLocatorType(value: string): string {
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

  toTemplateLocatorFromDescription(
    description: string | undefined
  ): TemplateStepArtifactLike['locator'] | undefined {
    if (!description?.trim()) {
      return undefined;
    }

    const normalized = description.trim();
    const quotedLabelMatch = normalized.match(/点击[「“"']([^」”"']{1,48})[」”"']/);
    if (quotedLabelMatch?.[1]) {
      return this.buildTemplateLocatorFromLabel(quotedLabelMatch[1].trim(), normalized);
    }

    const buttonLabelMatch = normalized.match(/^点击\s*(.+?)\s*按钮/);
    const buttonLabel = buttonLabelMatch?.[1]?.trim();
    if (
      buttonLabel &&
      buttonLabel.length <= 48 &&
      !/^第[一二三四五六七八九十0-9]/.test(buttonLabel)
    ) {
      return this.buildTemplateLocatorFromLabel(buttonLabel, normalized);
    }

    return undefined;
  }

  buildTemplateLocatorFromLabel(
    label: string | undefined,
    description?: string
  ): TemplateStepArtifactLike['locator'] | undefined {
    const normalizedLabel = typeof label === 'string' ? label.trim() : '';
    if (!normalizedLabel) {
      return undefined;
    }

    if (this.isButtonLikeDescription(description)) {
      const escapedName = normalizedLabel.replace(/"/g, '\\"');
      return {
        type: 'role',
        value: `button[name="${escapedName}"]`,
      };
    }

    return {
      type: 'text',
      value: normalizedLabel,
    };
  }

  isButtonLikeDescription(description?: string): boolean {
    const normalized = typeof description === 'string' ? description.trim() : '';
    if (!normalized) {
      return false;
    }
    return /(按钮|button)/i.test(normalized);
  }

  isEphemeralRuntimeHandle(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }
    const normalized = value.trim();
    if (!normalized) {
      return false;
    }
    return /^e\d+$/i.test(normalized) || /^\d+_\d+$/.test(normalized);
  }

  private isMeaningfulObservation(observation?: ObservationLike): observation is ObservationLike {
    return Boolean(
      observation &&
      (Boolean(observation.text?.trim()) ||
        observation.buttons.length > 0 ||
        observation.inputs.length > 0 ||
        observation.links.length > 0 ||
        observation.headings.length > 0)
    );
  }

  private resolvePreferredBranchReadSelector(
    detailObservation: ObservationLike,
    readSelectors: string[] | undefined,
    outputVar?: string,
    branchIntent?: string
  ): string {
    const candidateSelector = this.resolveBranchReadSelectorFromCandidates(
      detailObservation.candidates || [],
      [branchIntent, outputVar, ...(readSelectors || [])]
    );
    if (candidateSelector) {
      return candidateSelector;
    }
    return (
      readSelectors?.find((selector) => typeof selector === 'string' && selector.trim().length > 0) ||
      'body'
    );
  }

  private resolveBranchReadSelectorFromCandidates(
    candidates: BrowserCommandCandidate[],
    hints: Array<string | undefined>
  ): string | undefined {
    const normalizedHints = hints.map((value) => this.normalize(value)).filter(Boolean);
    const scoredCandidates = candidates
      .filter((candidate) => candidate.kind === 'field')
      .map((candidate) => ({
        selector: this.buildFieldSelector(candidate),
        score: this.scoreBranchFieldCandidate(candidate, normalizedHints),
      }))
      .filter(
        (entry): entry is { selector: string; score: number } =>
          typeof entry.selector === 'string' && entry.selector.trim().length > 0 && entry.score > 0
      )
      .sort((left, right) => right.score - left.score);

    return scoredCandidates[0]?.selector;
  }

  private buildFieldSelector(candidate: BrowserCommandCandidate): string | undefined {
    if (candidate.preferredLocator?.type === 'testid' && candidate.preferredLocator.value.trim()) {
      return `[data-testid="${candidate.preferredLocator.value.trim()}"]`;
    }
    if (candidate.dataTestId?.trim()) {
      return `[data-testid="${candidate.dataTestId.trim()}"]`;
    }
    if (candidate.elementId?.trim()) {
      return `#${candidate.elementId.trim()}`;
    }
    if (candidate.preferredLocator?.type === 'css' && candidate.preferredLocator.value.trim()) {
      return candidate.preferredLocator.value.trim();
    }
    return undefined;
  }

  private scoreBranchFieldCandidate(
    candidate: BrowserCommandCandidate,
    hints: string[]
  ): number {
    const values = [
      candidate.field,
      candidate.label,
      candidate.text,
      candidate.summary,
      candidate.elementId,
      candidate.dataTestId,
      candidate.preferredLocator?.value,
    ].map((value) => this.normalize(value));
    let score = 0;

    for (const hint of hints) {
      if (!hint) {
        continue;
      }
      if (this.isGrossMarginHint(hint) && values.some((value) => this.isGrossMarginHint(value))) {
        score += 220;
        continue;
      }
      if (values.some((value) => value.length > 0 && (value.includes(hint) || hint.includes(value)))) {
        score += 60;
      }
    }

    if (candidate.preferredLocator?.type === 'testid') {
      score += 20;
    } else if (candidate.dataTestId || candidate.elementId) {
      score += 10;
    }

    return score;
  }

  private normalizeExportTemplateSteps(
    templateSteps: TemplateStepArtifactLike[]
  ): TemplateStepArtifactLike[] {
    const normalized: TemplateStepArtifactLike[] = [];
    let setupBuffer: TemplateStepArtifactLike[] = [];

    const flushSetupBuffer = () => {
      if (setupBuffer.length === 0) {
        return;
      }
      normalized.push(...this.dedupeSetupSteps(setupBuffer));
      setupBuffer = [];
    };

    for (const step of templateSteps) {
      if (step.action === 'navigate' || step.action === 'fill') {
        setupBuffer.push(step);
        continue;
      }
      flushSetupBuffer();
      normalized.push(step);
    }

    flushSetupBuffer();
    return normalized.map((step, index) => ({
      ...step,
      step_id: `step_${index + 1}`,
    }));
  }

  private dedupeSetupSteps(steps: TemplateStepArtifactLike[]): TemplateStepArtifactLike[] {
    const navigateStep = [...steps].reverse().find((step) => step.action === 'navigate');
    const dedupedFills = this.collectDedupedSetupItems(
      steps.filter((step) => step.action === 'fill'),
      (step) => this.buildSetupStepKey(step)
    );
    return [...(navigateStep ? [navigateStep] : []), ...dedupedFills];
  }

  private buildSetupStepKey(step: TemplateStepArtifactLike): string | undefined {
    if (step.action === 'navigate') {
      const url = typeof step.params?.url === 'string' ? step.params.url.trim() : '';
      return url ? `navigate:${url}` : undefined;
    }
    if (step.action === 'fill') {
      const locatorType = typeof step.locator?.type === 'string' ? step.locator.type : '';
      const locatorValue = typeof step.locator?.value === 'string' ? step.locator.value.trim() : '';
      const value = typeof step.params?.value === 'string' ? step.params.value.trim() : '';
      if (!locatorValue || !value) {
        return undefined;
      }
      return `fill:${locatorType}:${locatorValue}:${value}`;
    }
    return undefined;
  }

  private dedupeSetupCommands(commands: BrowserCommand[]): BrowserCommand[] {
    const navigateCommand = [...commands].reverse().find((command) => command.tool === 'navigate');
    const dedupedFills = this.collectDedupedSetupItems(
      commands.filter((command) => command.tool === 'fill'),
      (command) => this.buildSetupCommandKey(command)
    );
    return [...(navigateCommand ? [navigateCommand] : []), ...dedupedFills];
  }

  private buildSetupCommandKey(command: BrowserCommand): string | undefined {
    if (command.tool === 'navigate') {
      const url = typeof command.params.url === 'string' ? command.params.url.trim() : '';
      return url ? `navigate:${url}` : undefined;
    }
    if (command.tool === 'fill') {
      const stableLocatorSignature =
        typeof command.locator?.role === 'string' &&
        command.locator.role.trim() &&
        typeof command.locator?.name === 'string' &&
        command.locator.name.trim()
          ? `role:${command.locator.role.trim()}|name:${command.locator.name.trim()}`
          : [
              typeof command.locator?.strategy === 'string' ? command.locator.strategy : '',
              typeof command.locator?.value === 'string' ? command.locator.value : '',
              typeof command.params.target === 'string' ? command.params.target : '',
              typeof command.params.selector === 'string' ? command.params.selector : '',
            ]
              .map((value) => value.trim())
              .filter(Boolean)
              .join('|');
      const value = typeof command.params.value === 'string' ? command.params.value.trim() : '';
      if (!stableLocatorSignature || !value) {
        return undefined;
      }
      return `fill:${stableLocatorSignature}:${value}`;
    }
    return undefined;
  }

  private collectDedupedSetupItems<T>(
    items: T[],
    keyBuilder: (item: T) => string | undefined
  ): T[] {
    const lastIndexByKey = new Map<string, number>();
    items.forEach((item, index) => {
      const key = keyBuilder(item);
      if (key) {
        lastIndexByKey.set(key, index);
      }
    });
    return items.filter((item, index) => {
      const key = keyBuilder(item);
      if (!key) {
        return true;
      }
      return lastIndexByKey.get(key) === index;
    });
  }

  private resolveTemplateLocatorFromRecordedRef(
    command: BrowserCommand,
    session?: SessionLike
  ): TemplateStepArtifactLike['locator'] | undefined {
    const ref = this.extractRecordedRef(command);
    if (!ref || !session?.history?.length) {
      return undefined;
    }

    for (const turn of session.history) {
      const results = turn.execution?.results;
      if (!Array.isArray(results)) {
        continue;
      }
      for (const result of results) {
        const content =
          result &&
          typeof result === 'object' &&
          result.data &&
          typeof result.data === 'object' &&
          typeof (result.data as Record<string, unknown>).content === 'string'
            ? ((result.data as Record<string, unknown>).content as string)
            : '';
        if (!content || !content.includes(`[ref=${ref}]`)) {
          continue;
        }
        const locator = this.parseTemplateLocatorFromSnapshotRef(content, ref);
        if (locator) {
          return locator;
        }
      }
    }

    return undefined;
  }

  private extractRecordedRef(command: BrowserCommand): string | undefined {
    const target =
      typeof command.params.target === 'string' && this.isEphemeralRuntimeHandle(command.params.target)
        ? command.params.target.trim()
        : '';
    if (target) {
      return target;
    }
    const locatorValue =
      typeof command.locator?.value === 'string' && this.isEphemeralRuntimeHandle(command.locator.value)
        ? command.locator.value.trim()
        : '';
    return locatorValue || undefined;
  }

  private parseTemplateLocatorFromSnapshotRef(
    snapshotContent: string,
    ref: string
  ): TemplateStepArtifactLike['locator'] | undefined {
    const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const roleMatch = snapshotContent.match(
      new RegExp(
        `(?:-\\s*)?(button|link|textbox|checkbox|radio|combobox)\\s+"([^"]+)"\\s+\\[ref=${escapedRef}\\]`,
        'i'
      )
    );
    if (roleMatch?.[1] && roleMatch[2]) {
      const role = roleMatch[1].toLowerCase();
      const name = roleMatch[2].trim().replace(/"/g, '\\"');
      return {
        type: 'role',
        value: `${role}[name="${name}"]`,
      };
    }
    return undefined;
  }

  private normalize(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  private isGrossMarginHint(value: string): boolean {
    return /(gross.?margin|profit.?margin|毛利率|粗利率)/i.test(value);
  }
}
