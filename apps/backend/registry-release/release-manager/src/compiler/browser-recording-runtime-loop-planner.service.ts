import { Injectable } from '@nestjs/common';
import {
  buildTargetFromLocator,
  pickFirstNonEmptyString,
  resolveRuntimeValue,
} from './browser-recording-runtime-utils';
import {
  asRecord,
  BrowserRecordingLoopCondition,
  BrowserRecordingRuntimeStep,
} from './browser-recording-runtime.types';

@Injectable()
export class BrowserRecordingRuntimeLoopPlannerService {
  buildLoopPlan(
    payload: Record<string, unknown>,
    runtimeInput: Record<string, unknown>,
    runtimeSteps: BrowserRecordingRuntimeStep[]
  ): BrowserRecordingLoopCondition | null {
    if (runtimeSteps.length === 0) {
      return null;
    }
    const loopDraft = this.extractLoopDraft(payload, runtimeInput);
    if (!loopDraft) {
      return null;
    }

    const eachIteration = asRecord(loopDraft.eachIteration);
    const stepIds = Array.isArray(eachIteration?.stepIds)
      ? eachIteration.stepIds
          .filter(
            (stepId: unknown): stepId is string =>
              typeof stepId === 'string' && stepId.trim().length > 0
          )
          .map((stepId: string) => stepId.trim())
      : [];
    if (stepIds.length === 0) {
      return null;
    }

    const matchedIndexes = stepIds
      .map((stepId: string) => runtimeSteps.findIndex((step) => step.id === stepId))
      .filter((index: number) => index >= 0);
    if (matchedIndexes.length === 0) {
      return null;
    }

    const loopStartIndex = Math.min(...matchedIndexes);
    const loopEndIndex = Math.max(...matchedIndexes);
    const iterationSteps = runtimeSteps.slice(loopStartIndex, loopEndIndex + 1);
    if (iterationSteps.length === 0) {
      return null;
    }

    const stopWhen = asRecord(loopDraft.stopWhen);
    const stopRead = asRecord(stopWhen?.read);
    const stopConditionFn = pickFirstNonEmptyString(stopWhen?.conditionFn);
    const stopDescription = pickFirstNonEmptyString(stopWhen?.description);
    if (!stopRead || !stopConditionFn || !stopDescription) {
      return null;
    }

    const readType = pickFirstNonEmptyString(stopRead.type);
    const readStep = this.buildLoopStopReadStep(stopRead, runtimeInput);
    if (!readType || !readStep) {
      return null;
    }

    if (readType !== 'count' && readType !== 'text' && readType !== 'page_signal') {
      return null;
    }

    const signalKey = pickFirstNonEmptyString(stopRead.key);
    if (readType === 'page_signal' && !signalKey) {
      return null;
    }

    return {
      mode: 'repeat_until',
      stopWhen: {
        read:
          readType === 'page_signal'
            ? {
                type: 'page_signal',
                key: signalKey!,
                step: readStep,
              }
            : {
                type: readType,
                ...(signalKey ? { key: signalKey } : {}),
                step: readStep,
              },
        conditionFn: stopConditionFn,
        description: stopDescription,
      },
      maxIterations: this.resolveLoopMaxIterations(loopDraft.maxIterations),
      onNoProgress:
        pickFirstNonEmptyString(loopDraft.onNoProgress) === 'stop' ? 'stop' : 'takeover',
      preLoopSteps: runtimeSteps.slice(0, loopStartIndex),
      iterationSteps,
      postLoopSteps: runtimeSteps.slice(loopEndIndex + 1),
    };
  }

  private extractLoopDraft(
    payload: Record<string, unknown>,
    runtimeInput: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const apiEndpoints = asRecord(payload.apiEndpoints);
    const runtimeMetadata =
      asRecord(payload.runtimeMetadata) || asRecord(apiEndpoints?.runtimeMetadata);
    const executionPlan = asRecord(runtimeMetadata?.executionPlan);
    const rawLoopDraft = asRecord(executionPlan?.loopDraft) || asRecord(runtimeMetadata?.loopDraft);
    return rawLoopDraft
      ? asRecord(resolveRuntimeValue(rawLoopDraft, runtimeInput)) || rawLoopDraft
      : undefined;
  }

  private buildLoopStopReadStep(
    stopRead: Record<string, unknown>,
    runtimeInput: Record<string, unknown>
  ): BrowserRecordingRuntimeStep | null {
    const readType = pickFirstNonEmptyString(stopRead.type);
    if (!readType) {
      return null;
    }

    if (readType === 'page_signal') {
      return {
        id: 'loop_stop_read',
        name: '读取循环终止页面信号',
        action: 'read_page',
        description: '读取页面信号用于判断循环是否结束',
      };
    }

    const locator = asRecord(resolveRuntimeValue(stopRead.locator, runtimeInput));
    const target = buildTargetFromLocator(locator);
    if (!locator || !target) {
      return null;
    }

    return {
      id: 'loop_stop_read',
      name: '读取循环终止信号',
      action: 'read_value',
      target,
      args: {
        selector: locator.value,
      },
      description: '读取循环终止信号',
    };
  }

  private resolveLoopMaxIterations(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 100;
  }
}
