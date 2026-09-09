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
import {
  EPHEMERAL_REF_PATTERN,
  SNAPSHOT_ROLE_ALTERNATION,
  isRoleCompatibleWithTool,
} from '../browser-domain.constants';

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
    ref?: string;
    role?: string;
    name?: string;
    contextLabel?: string;
    regionId?: string;
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

import {
  appendOptionalManualInterventionStepsForIndex,
  appendInitialOptionalManualInterventionPrechecks,
  appendOptionalManualInterventionCheckpoint,
  buildOptionalManualInterventionPlan,
} from './recorder-manual-intervention';
import {
  resolvePreferredBranchReadSelector,
  resolveBranchReadSelectorFromCandidates,
  buildFieldSelector,
  scoreBranchFieldCandidate,
  normalizeExportTemplateSteps,
  dedupeSetupSteps,
  buildSetupStepKey,
  dedupeSetupCommands,
  buildSetupCommandKey,
  collectDedupedSetupItems,
} from './recorder-template-normalizer';
import {
  resolveTemplateLocatorFromRecordedRef,
  resolveTemplateLocatorFromSnapshotText,
  parseTemplateLocatorFromSnapshotRef,
  extractTurnExecutionIndex,
  extractRecordedRef,
  hasCoexistingGenericText,
  countTextOccurrences,
  escapeRegex,
  normalize,
  isGrossMarginHint,
  isEphemeralRuntimeHandle,
  inferTemplateLocatorType,
  mapTemplateLocatorType,
  isButtonLikeDescription,
  withGroundingMetadata,
  buildTemplateLocatorFromLabel,
  toTemplateLocatorFromDescription,
  toTemplateLocatorFromTarget,
  toTemplateLocatorFromExpression,
  toTemplateLocatorFromRuntimeLocator,
  buildTemplateStepLocator,
} from './recorder-template-locator';

@Injectable()
export class RecorderTemplateExportService {
  // Role sets are imported from browser-domain.constants.ts.

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
    const hasRecordedStartNavigate = session.executedCommands.some(
      (command) =>
        command.tool === 'navigate' &&
        typeof command.params.url === 'string' &&
        command.params.url.trim() === startUrl
    );
    const templateSteps: TemplateStepArtifactLike[] = hasRecordedStartNavigate
      ? []
      : [
          {
            step_id: 'step_1',
            action: 'navigate',
            params: { url: startUrl },
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
      this.matchesBranchNextAction(
        recordedDetailFlowCommands[0],
        branchAnalysis.nextAction,
        detailObservation
      )
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
    return navigateIndex >= 0 ? navigateIndex : 0;
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
    return buildTemplateStepLocator(command, session);
  }

  buildTemplateStepLocator(
    command: BrowserCommand,
    session?: SessionLike
  ): TemplateStepArtifactLike['locator'] | undefined {
    return buildTemplateStepLocator(command, session);
  }

  toTemplateLocatorFromExpression(
    locator: BrowserCommand['locator'] | undefined,
    tool?: string
  ): TemplateStepArtifactLike['locator'] | undefined {
    return toTemplateLocatorFromExpression(locator, tool);
  }

  isRoleCompatibleWithTool(role: string, tool: string): boolean {
    return isRoleCompatibleWithTool(role, tool);
  }

  withGroundingMetadata(
    locator: TemplateStepArtifactLike['locator'] | undefined,
    sourceLocator: BrowserCommand['locator'] | undefined
  ): TemplateStepArtifactLike['locator'] | undefined {
    return withGroundingMetadata(locator, sourceLocator);
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
      | undefined,
    observation?: ObservationLike
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
    const locatorStrategy = normalize(command.locator?.strategy);

    if (nextSelector) {
      return [commandTarget, normalize(command.params.selector), locatorValue].includes(
        nextSelector
      );
    }

    if (!nextText) {
      return false;
    }

    // Recovery commands often carry only a ref or testid (no params.text or
    // locator.name). Resolve the button's visible label from the page
    // observation so we can still match it against nextAction.text.
    const resolvedLabels = this.resolveButtonLabelsFromObservation(
      command,
      observation,
      locatorStrategy
    );

    return [commandText, commandTarget, locatorName, commandDescription, ...resolvedLabels].some(
      (value) =>
        value.length > 0 &&
        (value === nextText || value.includes(nextText) || nextText.includes(value))
    );
  }

  private resolveButtonLabelsFromObservation(
    command: BrowserCommand,
    observation: ObservationLike | undefined,
    locatorStrategy: string
  ): string[] {
    if (!observation?.buttons?.length) {
      return [];
    }

    const normalize = (value: unknown): string =>
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    const targetRef = normalize(command.params.target);
    const locatorValue = normalize(command.locator?.value);

    const matchedButton = observation.buttons.find((button) => {
      const buttonRef = normalize(button.ref);
      if (targetRef && buttonRef && buttonRef === targetRef) {
        return true;
      }
      if (locatorStrategy === 'testid' && locatorValue) {
        const buttonTestId = normalize(button.dataTestId);
        if (buttonTestId && buttonTestId === locatorValue) {
          return true;
        }
      }
      return false;
    });

    if (!matchedButton) {
      return [];
    }

    const labels: string[] = [];
    const buttonText = normalize(matchedButton.text);
    const buttonName = normalize(matchedButton.name);
    if (buttonText) {
      labels.push(buttonText);
    }
    if (buttonName && buttonName !== buttonText) {
      labels.push(buttonName);
    }
    return labels;
  }

  private appendOptionalManualInterventionStepsForIndex(
    templateSteps: TemplateStepArtifactLike[],
    session: SessionLike,
    commandIndex: number,
    nextStepId: () => string,
    consumedManualInterventionIds: Set<string>
  ): void {
    appendOptionalManualInterventionStepsForIndex(
      templateSteps,
      session,
      commandIndex,
      nextStepId,
      consumedManualInterventionIds
    );
  }

  private buildOptionalManualInterventionPlan(
    item: Pick<RecorderManualInterventionRecord, 'label' | 'signal'>
  ): OptionalManualInterventionPlan | null {
    return buildOptionalManualInterventionPlan(item);
  }

  private appendInitialOptionalManualInterventionPrechecks(
    templateSteps: TemplateStepArtifactLike[],
    session: SessionLike,
    nextStepId: () => string
  ): void {
    appendInitialOptionalManualInterventionPrechecks(templateSteps, session, nextStepId);
  }

  private appendOptionalManualInterventionCheckpoint(
    templateSteps: TemplateStepArtifactLike[],
    label: string,
    plan: OptionalManualInterventionPlan,
    outputVarPrefix: string,
    nextStepId: () => string
  ): void {
    appendOptionalManualInterventionCheckpoint(
      templateSteps,
      label,
      plan,
      outputVarPrefix,
      nextStepId
    );
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
      !/^(?:[#.:]|\[)/.test(trimmedLocatorValue)
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
    return toTemplateLocatorFromTarget(target);
  }

  toTemplateLocatorFromRuntimeLocator(
    locator: NonNullable<BrowserCommand['locator']>
  ): TemplateStepArtifactLike['locator'] | undefined {
    return toTemplateLocatorFromRuntimeLocator(locator);
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
    return mapTemplateLocatorType(strategy);
  }

  inferTemplateLocatorType(value: string): string {
    return inferTemplateLocatorType(value);
  }

  toTemplateLocatorFromDescription(
    description: string | undefined
  ): TemplateStepArtifactLike['locator'] | undefined {
    return toTemplateLocatorFromDescription(description);
  }

  buildTemplateLocatorFromLabel(
    label: string | undefined,
    description?: string,
    action?: string
  ): TemplateStepArtifactLike['locator'] | undefined {
    return buildTemplateLocatorFromLabel(label, description, action);
  }

  isButtonLikeDescription(description?: string): boolean {
    return isButtonLikeDescription(description);
  }

  isEphemeralRuntimeHandle(value: unknown): boolean {
    return isEphemeralRuntimeHandle(value);
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
    return resolvePreferredBranchReadSelector(
      detailObservation,
      readSelectors,
      outputVar,
      branchIntent
    );
  }

  private resolveBranchReadSelectorFromCandidates(
    candidates: BrowserCommandCandidate[],
    hints: Array<string | undefined>
  ): string | undefined {
    return resolveBranchReadSelectorFromCandidates(candidates, hints);
  }

  private buildFieldSelector(candidate: BrowserCommandCandidate): string | undefined {
    return buildFieldSelector(candidate);
  }

  private scoreBranchFieldCandidate(
    candidate: BrowserCommandCandidate,
    hints: string[]
  ): number {
    return scoreBranchFieldCandidate(candidate, hints);
  }

  private normalizeExportTemplateSteps(
    templateSteps: TemplateStepArtifactLike[]
  ): TemplateStepArtifactLike[] {
    return normalizeExportTemplateSteps(templateSteps);
  }

  private dedupeSetupSteps(steps: TemplateStepArtifactLike[]): TemplateStepArtifactLike[] {
    return dedupeSetupSteps(steps);
  }

  private buildSetupStepKey(step: TemplateStepArtifactLike): string | undefined {
    return buildSetupStepKey(step);
  }

  private dedupeSetupCommands(commands: BrowserCommand[]): BrowserCommand[] {
    return dedupeSetupCommands(commands);
  }

  private buildSetupCommandKey(command: BrowserCommand): string | undefined {
    return buildSetupCommandKey(command);
  }

  private collectDedupedSetupItems<T>(
    items: T[],
    keyBuilder: (item: T) => string | undefined
  ): T[] {
    return collectDedupedSetupItems(items, keyBuilder);
  }

  private resolveTemplateLocatorFromRecordedRef(
    command: BrowserCommand,
    session?: SessionLike
  ): TemplateStepArtifactLike['locator'] | undefined {
    return resolveTemplateLocatorFromRecordedRef(command, session);
  }

  private extractTurnExecutionIndex(turn: unknown): number | undefined {
    return extractTurnExecutionIndex(turn);
  }

  private extractRecordedRef(command: BrowserCommand): string | undefined {
    return extractRecordedRef(command);
  }

  private parseTemplateLocatorFromSnapshotRef(
    snapshotContent: string,
    ref: string
  ): TemplateStepArtifactLike['locator'] | undefined {
    return parseTemplateLocatorFromSnapshotRef(snapshotContent, ref);
  }

  private resolveTemplateLocatorFromSnapshotText(
    text: string,
    command: BrowserCommand,
    session?: SessionLike
  ): TemplateStepArtifactLike['locator'] | undefined {
    return resolveTemplateLocatorFromSnapshotText(text, command, session);
  }

  private hasCoexistingGenericText(snapshotContent: string, text: string): boolean {
    return hasCoexistingGenericText(snapshotContent, text);
  }

  private countTextOccurrences(snapshotContent: string, text: string, targetRef: string): number {
    return countTextOccurrences(snapshotContent, text, targetRef);
  }

  private escapeRegex(value: string): string {
    return escapeRegex(value);
  }

  private normalize(value: unknown): string {
    return normalize(value);
  }

  private isGrossMarginHint(value: string): boolean {
    return isGrossMarginHint(value);
  }
}
