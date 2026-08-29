import { Injectable } from '@nestjs/common';
import { BrowserCommand } from '../intent';
import { RecorderLoopLocatorService } from './recorder-loop-locator.service';
import {
  RecorderLoopDraftState,
  RecorderSessionLike,
  TemplateStepLike,
} from './recorder-loop.types';

@Injectable()
export class RecorderLoopExportService {
  constructor(
    private readonly locatorService: RecorderLoopLocatorService = new RecorderLoopLocatorService()
  ) {}

  splitRecordedCommandsForExport(
    session: RecorderSessionLike,
    startUrl: string
  ): { preLoopCommands: BrowserCommand[]; iterationCommands: BrowserCommand[] } {
    const commands = Array.isArray(session.executedCommands) ? session.executedCommands : [];
    if (commands.length === 0) {
      return { preLoopCommands: [], iterationCommands: [] };
    }

    const navigateIndex = commands.findIndex(
      (command) =>
        command.tool === 'navigate' &&
        typeof command.params.url === 'string' &&
        command.params.url.trim() === startUrl
    );
    // Preserve the first recorded navigation as an explicit template action.
    // The template exporter may synthesize a navigation only when the session
    // has no recorded navigate command at all.
    const exportStartIndex = navigateIndex >= 0 ? navigateIndex : 0;
    const loopRange = this.getLoopCapturedCommandRange(session.loopDraft);
    if (loopRange) {
      return {
        preLoopCommands: commands.slice(exportStartIndex, loopRange.startIndex),
        iterationCommands: commands.slice(loopRange.startIndex, loopRange.endIndex + 1),
      };
    }

    const detailEntryIndex = commands.findIndex((command) =>
      this.locatorService.isRecordedDetailEntryCommand(command)
    );
    if (detailEntryIndex < 0) {
      return {
        preLoopCommands: commands.slice(exportStartIndex),
        iterationCommands: [],
      };
    }

    const returnIndex = commands.findIndex(
      (command, index) =>
        index > detailEntryIndex && this.locatorService.isReturnToListCommand(command)
    );
    const iterationEndIndex = returnIndex > detailEntryIndex ? returnIndex : commands.length - 1;
    return {
      preLoopCommands: commands.slice(exportStartIndex, detailEntryIndex),
      iterationCommands: commands.slice(detailEntryIndex, iterationEndIndex + 1),
    };
  }

  getLoopCapturedCommandRange(
    loopDraft?: RecorderLoopDraftState
  ): { startIndex: number; endIndex: number } | undefined {
    const startIndex = loopDraft?.eachIteration?.capturedFromIndex;
    const endIndex = loopDraft?.eachIteration?.capturedToIndex;
    if (
      typeof startIndex !== 'number' ||
      typeof endIndex !== 'number' ||
      !Number.isFinite(startIndex) ||
      !Number.isFinite(endIndex) ||
      startIndex < 0 ||
      endIndex < startIndex
    ) {
      return undefined;
    }
    return { startIndex, endIndex };
  }

  optimizeTemplateStepsForLoopExport(
    templateSteps?: TemplateStepLike[],
    loopDraft?: RecorderLoopDraftState,
    loopPendingKeyword?: string
  ): TemplateStepLike[] | undefined {
    if (
      !templateSteps?.length ||
      !loopDraft ||
      loopDraft.stopWhen ||
      loopDraft.target.scope !== 'current_list'
    ) {
      return templateSteps;
    }

    let patched = false;
    const optimized = templateSteps.map((step) => {
      if (patched || !this.locatorService.isLoopRowTemplateStep(step)) {
        return step;
      }
      const locatorValue = typeof step.locator?.value === 'string' ? step.locator.value : '';
      const firstRowLocator = this.locatorService.toFirstLoopItemLocator(
        locatorValue,
        loopPendingKeyword
      );
      if (!firstRowLocator) {
        return step;
      }
      patched = true;
      return {
        ...step,
        locator: {
          ...(step.locator || { type: 'css' }),
          value: firstRowLocator,
        },
        description: '打开当前第一条待处理案件详情',
      };
    });

    return optimized;
  }

  buildExportLoopDraft(
    loopDraft: RecorderLoopDraftState | undefined,
    templateSteps?: TemplateStepLike[],
    loopPendingKeyword?: string
  ): RecorderLoopDraftState | undefined {
    if (!loopDraft) {
      return undefined;
    }

    const mappedEachIteration = this.buildExportLoopEachIteration(loopDraft, templateSteps);
    const stopWhen =
      loopDraft.stopWhen || this.deriveLoopStopWhen(templateSteps, loopDraft, loopPendingKeyword);
    return {
      ...loopDraft,
      ...(mappedEachIteration ? { eachIteration: mappedEachIteration } : {}),
      ...(stopWhen ? { stopWhen } : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  buildExportLoopEachIteration(
    loopDraft: RecorderLoopDraftState,
    templateSteps?: TemplateStepLike[]
  ): RecorderLoopDraftState['eachIteration'] | undefined {
    if (!templateSteps?.length) {
      return loopDraft.eachIteration;
    }

    const stepIds = this.deriveLoopIterationStepIds(
      templateSteps,
      loopDraft.eachIteration?.stepCount
    );
    if (stepIds.length === 0) {
      return loopDraft.eachIteration;
    }

    return {
      ...(loopDraft.eachIteration || {}),
      stepIds,
      stepCount: stepIds.length,
    };
  }

  deriveLoopIterationStepIds(
    templateSteps: TemplateStepLike[],
    preferredStepCount?: number
  ): string[] {
    const startIndex = templateSteps.findIndex((step) =>
      this.locatorService.isLoopRowTemplateStep(step)
    );
    if (startIndex < 0) {
      return [];
    }

    if (
      typeof preferredStepCount === 'number' &&
      Number.isFinite(preferredStepCount) &&
      preferredStepCount > 0 &&
      !templateSteps
        .slice(startIndex, startIndex + preferredStepCount + 2)
        .some((step) => step.action === 'branch' || step.action === 'read_value')
    ) {
      return templateSteps
        .slice(startIndex, startIndex + preferredStepCount)
        .map((step) => step.step_id)
        .filter(
          (stepId): stepId is string => typeof stepId === 'string' && stepId.trim().length > 0
        );
    }

    const endIndex = this.findLoopIterationEndTemplateStepIndex(templateSteps, startIndex);
    return templateSteps
      .slice(startIndex, endIndex + 1)
      .map((step) => step.step_id)
      .filter((stepId): stepId is string => typeof stepId === 'string' && stepId.trim().length > 0);
  }

  deriveLoopStopWhen(
    templateSteps: TemplateStepLike[] | undefined,
    loopDraft: RecorderLoopDraftState,
    loopPendingKeyword?: string
  ): RecorderLoopDraftState['stopWhen'] | undefined {
    if (loopDraft.stopWhen || loopDraft.target.scope !== 'current_list' || !templateSteps?.length) {
      return loopDraft.stopWhen;
    }

    const loopRowStep = templateSteps.find((step) =>
      this.locatorService.isLoopRowTemplateStep(step)
    );
    const locatorType =
      typeof loopRowStep?.locator?.type === 'string' ? loopRowStep.locator.type : 'css';
    const locatorValue =
      typeof loopRowStep?.locator?.value === 'string' ? loopRowStep.locator.value : '';
    const pendingStopReadLocator = this.locatorService.toPendingLoopStopLocator(locatorValue);
    const stopReadLocator = this.locatorService.toLoopCollectionLocator(locatorValue);

    if (loopPendingKeyword && pendingStopReadLocator) {
      return {
        read: {
          type: 'text',
          locator: {
            type: locatorType,
            value: pendingStopReadLocator,
          },
        },
        conditionFn: `!String(value || '').includes(${JSON.stringify(loopPendingKeyword)})`,
        description: `当前列表中已无“${loopPendingKeyword}”项时结束循环`,
      };
    }
    if (!stopReadLocator) {
      return undefined;
    }

    return {
      read: {
        type: 'text',
        locator: {
          type: locatorType,
          value: stopReadLocator,
        },
      },
      conditionFn: "!String(value || '').trim()",
      description: '当前列表中已无可处理项时结束循环',
    };
  }

  deriveLoopPendingKeyword(
    session: RecorderSessionLike,
    loopDraft?: RecorderLoopDraftState
  ): string | undefined {
    const explicitMatchValue =
      typeof loopDraft?.target?.match?.value === 'string'
        ? loopDraft.target.match.value.trim()
        : '';
    if (explicitMatchValue) {
      return explicitMatchValue;
    }

    const recordedFilterKeyword = this.extractRecordedLoopFilterKeyword(session.executedCommands);
    if (recordedFilterKeyword) {
      return recordedFilterKeyword;
    }
    return undefined;
  }

  extractRecordedLoopFilterKeyword(commands: BrowserCommand[]): string | undefined {
    for (const command of commands) {
      if (command.tool !== 'click') {
        continue;
      }

      const description = typeof command.description === 'string' ? command.description.trim() : '';
      if (!/筛选|filter/i.test(description)) {
        continue;
      }

      const quotedLabel = description.match(/[「"](.*?)[」"]/);
      const labelCandidates = [
        quotedLabel?.[1],
        typeof command.locator?.name === 'string' ? command.locator.name : undefined,
        typeof command.params.text === 'string' ? command.params.text : undefined,
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);

      const stableLabel = labelCandidates.find((label) => !/^(全部|すべて|all)$/i.test(label));
      if (stableLabel) {
        return stableLabel;
      }
    }

    return undefined;
  }

  isBulkPendingLoopGoal(session: RecorderSessionLike, userGoal: string): boolean {
    const source = [
      userGoal,
      ...session.history.filter((turn) => turn.role === 'user').map((turn) => turn.content),
    ].join('\n');
    return /(循环处理|批量处理|逐条|全部|直到没有|直到无|遍历)/.test(source);
  }

  findLoopIterationEndTemplateStepIndex(
    templateSteps: TemplateStepLike[],
    startIndex: number
  ): number {
    for (let index = startIndex + 1; index < templateSteps.length; index += 1) {
      const step = templateSteps[index];
      if (!step) {
        continue;
      }
      if (this.locatorService.isReturnToListTemplateStep(step)) {
        return index;
      }
    }
    return templateSteps.length - 1;
  }
}
