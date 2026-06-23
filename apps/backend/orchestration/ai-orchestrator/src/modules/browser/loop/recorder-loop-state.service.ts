import { Injectable } from '@nestjs/common';
import {
  LoopScope,
  RecorderManualInterventionBehavior,
  RecorderManualInterventionSignal,
  RecorderManualInterventionToken,
  RecorderControlTokenStateLike,
  RecorderLoopDraftState,
  RecorderObservationLike,
  RecorderSessionLike,
} from './recorder-loop.types';

@Injectable()
export class RecorderLoopStateService {
  extractRecorderControlTokens(message: string): RecorderControlTokenStateLike {
    const tokenPattern =
      /\[(循环对象(?::[^\]]+)?)\]|\[(循环开始)\]|\[(循环结束)\]|\[(条件分歧)\]|\[(人工介入(?::[^\]]+)?)\]/g;
    const rawTokens: string[] = [];
    let loopTargetScope: RecorderControlTokenStateLike['loopTargetScope'];
    let hasLoopStart = false;
    let hasLoopEnd = false;
    let hasConditionalBranch = false;
    const manualInterventions: RecorderManualInterventionToken[] = [];
    const manualInterventionLabels: string[] = [];

    const cleanedMessage = message
      .replace(
        tokenPattern,
        (
          fullMatch,
          loopObjectToken,
          loopStartToken,
          loopEndToken,
          conditionalBranchToken,
          manualToken
        ) => {
          rawTokens.push(fullMatch);
          if (loopObjectToken) {
            const scopeLabel = loopObjectToken.split(':')[1]?.trim();
            loopTargetScope = this.mapLoopScopeToken(scopeLabel);
          }
          if (loopStartToken) {
            hasLoopStart = true;
          }
          if (loopEndToken) {
            hasLoopEnd = true;
          }
          if (conditionalBranchToken) {
            hasConditionalBranch = true;
          }
          if (manualToken) {
            const intervention = this.parseManualInterventionToken(manualToken);
            manualInterventions.push(intervention);
            manualInterventionLabels.push(intervention.label);
          }
          return ' ';
        }
      )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    return {
      cleanedMessage,
      rawTokens,
      loopTargetScope,
      hasLoopStart,
      hasLoopEnd,
      hasConditionalBranch,
      manualInterventions,
      manualInterventionLabels,
    };
  }

  mapLoopScopeToken(scopeLabel?: string): LoopScope {
    if (!scopeLabel) {
      return 'current_list';
    }
    if (/表格/.test(scopeLabel)) {
      return 'current_table';
    }
    if (/卡片/.test(scopeLabel)) {
      return 'current_cards';
    }
    return 'current_list';
  }

  ensureLoopDraft(session: RecorderSessionLike, fallbackPageUrl?: string): RecorderLoopDraftState {
    if (!session.loopDraft) {
      session.loopDraft = this.normalizeLoopDraft(
        {
          mode: 'repeat_until',
          target: {
            scope: 'current_list',
            ...(fallbackPageUrl ? { currentPageUrl: fallbackPageUrl } : {}),
          },
          onNoProgress: 'stop',
          maxIterations: 100,
        },
        fallbackPageUrl
      );
    }
    return session.loopDraft;
  }

  applyRecorderControlTokensBeforeExecution(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike,
    observation?: RecorderObservationLike
  ): void {
    const fallbackPageUrl = observation?.currentPageUrl || session.currentPageUrl;
    if (state.loopTargetScope) {
      const draft = this.ensureLoopDraft(session, fallbackPageUrl);
      draft.target = {
        ...draft.target,
        scope: state.loopTargetScope,
        ...(fallbackPageUrl ? { currentPageUrl: fallbackPageUrl } : {}),
      };
      draft.updatedAt = new Date().toISOString();
    }
    if (state.hasLoopStart) {
      this.ensureLoopDraft(session, fallbackPageUrl);
      session.pendingLoopCaptureStartCommandIndex = session.executedCommands.length;
    }
    if (state.manualInterventions.length > 0) {
      session.manualInterventions = session.manualInterventions || [];
      const now = new Date().toISOString();
      state.manualInterventions.forEach((item, index) => {
        session.manualInterventions!.push({
          id: `manual-intervention-${Date.now()}-${index}`,
          label: item.label,
          behavior: item.behavior || this.inferManualInterventionBehavior(item.label),
          createdAt: now,
          startCommandIndex: session.executedCommands.length,
          ...(item.signal ? { signal: item.signal } : {}),
        });
      });
    }
  }

  applyRecorderControlTokensAfterExecution(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike
  ): void {
    if (state.hasLoopEnd) {
      this.finalizeLoopIterationCapture(session);
    }
    if (state.manualInterventions.length > 0 && session.manualInterventions?.length) {
      const endIndex = Math.max(session.executedCommands.length - 1, 0);
      for (let index = session.manualInterventions.length - 1; index >= 0; index -= 1) {
        const item = session.manualInterventions[index];
        if (!item) {
          continue;
        }
        if (item.endCommandIndex !== undefined) {
          break;
        }
        item.endCommandIndex = endIndex;
      }
    }
  }

  private parseManualInterventionToken(manualToken: string): RecorderManualInterventionToken {
    const content = manualToken.split(':')[1]?.trim() || '';
    if (!content) {
      return { label: '人工介入' };
    }

    const parts = content
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const label = parts[0] || '人工介入';
    const options = Object.fromEntries(
      parts.slice(1).map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) {
          return [part, 'true'];
        }
        return [part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim()];
      })
    ) as Record<string, string>;

    const behavior = this.parseManualInterventionBehavior(options.behavior);
    const signal = this.parseManualInterventionSignal(options);
    return {
      label,
      ...(behavior ? { behavior } : {}),
      ...(signal ? { signal } : {}),
    };
  }

  private parseManualInterventionBehavior(
    value?: string
  ): RecorderManualInterventionBehavior | undefined {
    return value === 'stop_if_present' || value === 'optional_takeover_if_present'
      ? value
      : undefined;
  }

  private parseManualInterventionSignal(
    options: Record<string, string>
  ): RecorderManualInterventionSignal | undefined {
    const selector = options.selector?.trim();
    const method = options.method?.trim();
    if (!selector || !method) {
      return undefined;
    }
    if (
      method !== 'innerText' &&
      method !== 'textContent' &&
      method !== 'value' &&
      method !== 'attribute' &&
      method !== 'visible'
    ) {
      return undefined;
    }

    const signal: RecorderManualInterventionSignal = {
      selector,
      method,
      ...(options.attribute?.trim() ? { attribute: options.attribute.trim() } : {}),
      ...(options.expect?.trim() ? { expectedValue: options.expect.trim() } : {}),
      ...(options.fallbackPattern?.trim()
        ? { fallbackPattern: options.fallbackPattern.trim().replace(/,/g, '|') }
        : {}),
      ...(options.precheck === 'true' ? { precheckBeforeRecordedCommands: true } : {}),
    };

    if (signal.method === 'attribute' && !signal.attribute) {
      return undefined;
    }
    return signal;
  }

  finalizeLoopIterationCapture(session: RecorderSessionLike): void {
    if (typeof session.pendingLoopCaptureStartCommandIndex !== 'number') {
      return;
    }
    const startIndex = session.pendingLoopCaptureStartCommandIndex;
    const endIndex = session.executedCommands.length - 1;
    const capturedCommands = session.executedCommands.slice(startIndex, endIndex + 1);
    const draft = this.ensureLoopDraft(session, session.currentPageUrl);
    draft.eachIteration = {
      capturedFromIndex: startIndex,
      capturedToIndex: endIndex >= startIndex ? endIndex : startIndex,
      stepIds: capturedCommands.map((_, index) => `recorded_step_${startIndex + index + 1}`),
      stepCount: capturedCommands.length,
    };
    draft.updatedAt = new Date().toISOString();
    session.pendingLoopCaptureStartCommandIndex = undefined;
  }

  buildControlTokenAckReply(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike
  ): string {
    const parts: string[] = [];
    if (state.loopTargetScope) {
      parts.push(`已记录循环对象：${this.describeLoopScope(state.loopTargetScope)}`);
    }
    if (state.hasLoopStart) {
      parts.push('已标记单轮开始');
    }
    if (state.hasLoopEnd) {
      parts.push(
        `已标记单轮结束${session.loopDraft?.eachIteration ? `，当前捕获 ${session.loopDraft.eachIteration.stepCount} 个步骤` : ''}`
      );
    }
    if (state.hasConditionalBranch) {
      parts.push('已记录条件分歧');
    }
    if (state.manualInterventionLabels.length > 0) {
      parts.push(`已记录人工介入点：${state.manualInterventionLabels.join('、')}`);
    }
    return parts.join('；') || '已记录控制符。';
  }

  buildRecorderControlHints(
    session: RecorderSessionLike,
    state: RecorderControlTokenStateLike
  ): string[] {
    const hints: string[] = [];
    if (session.loopDraft?.target) {
      hints.push(`Loop target is ${this.describeLoopScope(session.loopDraft.target.scope)}.`);
    }
    if (state.hasLoopStart) {
      hints.push('This message marks the start of one loop iteration.');
    }
    if (state.hasLoopEnd) {
      hints.push('This message marks the end of one loop iteration.');
    }
    if (state.hasConditionalBranch) {
      hints.push(
        'This message records conditional branching intent for export, not an immediate browser action.'
      );
    }
    if (session.manualInterventions?.length) {
      const labels = session.manualInterventions
        .slice(-3)
        .map((item) =>
          item.behavior === 'optional_takeover_if_present'
            ? `${item.label}(可选触发)`
            : item.label
        )
        .filter(Boolean);
      if (labels.length > 0) {
        hints.push(
          `Human intervention checkpoints: ${labels.join(', ')}. If encountered, stop instead of taking over automatically.`
        );
      }
    }
    return hints;
  }

  describeLoopScope(scope: LoopScope): string {
    if (scope === 'current_table') {
      return '当前表格';
    }
    if (scope === 'current_cards') {
      return '当前卡片区';
    }
    return '当前列表';
  }

  private inferManualInterventionBehavior(
    _label: string
  ): RecorderManualInterventionBehavior {
    return 'stop_if_present';
  }

  normalizeLoopDraft(
    input: RecorderLoopDraftState,
    fallbackPageUrl?: string
  ): RecorderLoopDraftState {
    const normalizeString = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined;
    const normalizeSemanticPath = (value: unknown): string[] | undefined => {
      if (!Array.isArray(value)) {
        return undefined;
      }
      const normalized = value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
      return normalized.length > 0 ? normalized : undefined;
    };
    const normalizeLocator = (value: unknown): { type: string; value: string } | undefined => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
      }
      const record = value as Record<string, unknown>;
      const type = normalizeString(record.type);
      const locatorValue = normalizeString(record.value);
      if (!type || !locatorValue) {
        return undefined;
      }
      return { type, value: locatorValue };
    };

    const match = input?.target?.match;
    const matchValue =
      typeof match?.value === 'string' ||
      typeof match?.value === 'number' ||
      typeof match?.value === 'boolean'
        ? match.value
        : undefined;
    const stepIds = Array.isArray(input.eachIteration?.stepIds)
      ? input.eachIteration.stepIds
          .filter(
            (stepId): stepId is string => typeof stepId === 'string' && stepId.trim().length > 0
          )
          .map((stepId) => stepId.trim())
      : [];
    const stopWhen = input.stopWhen;
    const stopRead:
      | { type: 'count' | 'text'; locator: { type: string; value: string } }
      | { type: 'page_signal'; key: string }
      | undefined =
      stopWhen?.read?.type === 'page_signal'
        ? (() => {
            const key = normalizeString((stopWhen.read as { key?: string }).key);
            return key ? { type: 'page_signal' as const, key } : undefined;
          })()
        : (() => {
            const stopType: 'count' | 'text' | undefined =
              stopWhen?.read?.type === 'count'
                ? 'count'
                : stopWhen?.read?.type === 'text'
                  ? 'text'
                  : undefined;
            const locator = normalizeLocator(
              (stopWhen?.read as { locator?: unknown } | undefined)?.locator
            );
            return stopType && locator ? { type: stopType, locator } : undefined;
          })();

    return {
      mode: 'repeat_until',
      target: {
        scope:
          input?.target?.scope === 'current_table'
            ? 'current_table'
            : input?.target?.scope === 'current_cards'
              ? 'current_cards'
              : 'current_list',
        ...(normalizeString(input?.target?.regionId)
          ? { regionId: normalizeString(input?.target?.regionId) }
          : {}),
        ...(normalizeString(input?.target?.currentPageUrl) || fallbackPageUrl
          ? { currentPageUrl: normalizeString(input?.target?.currentPageUrl) || fallbackPageUrl }
          : {}),
        ...(normalizeString(match?.field) ||
        normalizeString(match?.operator) ||
        matchValue !== undefined
          ? {
              match: {
                ...(normalizeString(match?.field) ? { field: normalizeString(match?.field) } : {}),
                ...(match?.operator === 'contains' ||
                match?.operator === 'lt' ||
                match?.operator === 'gt'
                  ? { operator: match.operator }
                  : normalizeString(match?.operator)
                    ? { operator: 'equals' as const }
                    : {}),
                ...(matchValue !== undefined ? { value: matchValue } : {}),
              },
            }
          : {}),
      },
      ...(normalizeString(input?.sampleRow?.rowKey) ||
      normalizeString(input?.sampleRow?.entityType) ||
      normalizeString(input?.sampleRow?.entityId) ||
      normalizeSemanticPath(input?.sampleRow?.semanticPath)
        ? {
            sampleRow: {
              ...(normalizeString(input?.sampleRow?.rowKey)
                ? { rowKey: normalizeString(input?.sampleRow?.rowKey) }
                : {}),
              ...(normalizeString(input?.sampleRow?.entityType)
                ? { entityType: normalizeString(input?.sampleRow?.entityType) }
                : {}),
              ...(normalizeString(input?.sampleRow?.entityId)
                ? { entityId: normalizeString(input?.sampleRow?.entityId) }
                : {}),
              ...(normalizeSemanticPath(input?.sampleRow?.semanticPath)
                ? { semanticPath: normalizeSemanticPath(input?.sampleRow?.semanticPath) }
                : {}),
            },
          }
        : {}),
      ...(input.eachIteration
        ? {
            eachIteration: {
              ...(typeof input.eachIteration.capturedFromIndex === 'number'
                ? { capturedFromIndex: input.eachIteration.capturedFromIndex }
                : {}),
              ...(typeof input.eachIteration.capturedToIndex === 'number'
                ? { capturedToIndex: input.eachIteration.capturedToIndex }
                : {}),
              stepIds,
              stepCount:
                typeof input.eachIteration.stepCount === 'number'
                  ? input.eachIteration.stepCount
                  : stepIds.length,
            },
          }
        : {}),
      ...(stopRead &&
      normalizeString(stopWhen?.conditionFn) &&
      normalizeString(stopWhen?.description)
        ? {
            stopWhen: {
              read: stopRead,
              conditionFn: normalizeString(stopWhen?.conditionFn)!,
              description: normalizeString(stopWhen?.description)!,
            },
          }
        : {}),
      ...(input.onNoProgress === 'takeover'
        ? { onNoProgress: 'takeover' }
        : { onNoProgress: 'stop' }),
      ...(typeof input.maxIterations === 'number' && Number.isFinite(input.maxIterations)
        ? { maxIterations: input.maxIterations }
        : {}),
      updatedAt: new Date().toISOString(),
    };
  }
}
