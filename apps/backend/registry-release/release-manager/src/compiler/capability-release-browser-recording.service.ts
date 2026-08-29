import { Injectable } from '@nestjs/common';
import { BrowserRecordingFlowNormalizerService } from './browser-recording-flow-normalizer.service';
import { BrowserRecordingRuntimePlannerService } from './browser-recording-runtime-planner.service';
import { BrowserRecordingRuntimePlan } from './browser-recording-runtime.types';
import { CapabilitySourceSnapshotDTO } from '../interfaces';

@Injectable()
export class CapabilityReleaseBrowserRecordingService {
  constructor(
    private readonly browserRecordingFlowNormalizerService: BrowserRecordingFlowNormalizerService,
    private readonly browserRecordingRuntimePlannerService: BrowserRecordingRuntimePlannerService
  ) {}

  normalizeExecutionFlow(flow: unknown): Array<Record<string, unknown>> {
    return this.browserRecordingFlowNormalizerService.normalizeExecutionFlow(flow);
  }

  normalizeToolNames(tools: unknown): string[] {
    return this.browserRecordingFlowNormalizerService.normalizeToolNames(tools);
  }

  collectExecutionFlowToolNames(flow: unknown): string[] {
    return this.browserRecordingFlowNormalizerService.collectExecutionFlowToolNames(flow);
  }

  mergeToolsWithExecutionFlow(
    declaredTools: unknown,
    executionFlow: unknown,
    options?: { includeSkillMatch?: boolean }
  ): string[] {
    return this.browserRecordingFlowNormalizerService.mergeToolsWithExecutionFlow(
      declaredTools,
      executionFlow,
      options
    );
  }

  validateSnapshot(
    snapshot: CapabilitySourceSnapshotDTO,
    options?: {
      environment?: string;
      deploymentId?: string;
      input?: Record<string, unknown>;
      testCases?: string[];
    }
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
    const runtimeMetadata =
      payload.runtimeMetadata && typeof payload.runtimeMetadata === 'object'
        ? (payload.runtimeMetadata as Record<string, unknown>)
        : payload.apiEndpoints && typeof payload.apiEndpoints === 'object'
          ? ((payload.apiEndpoints as Record<string, unknown>).runtimeMetadata as Record<string, unknown> | undefined)
          : undefined;
    const executionPlan =
      runtimeMetadata?.executionPlan && typeof runtimeMetadata.executionPlan === 'object'
        ? (runtimeMetadata.executionPlan as Record<string, unknown>)
        : undefined;
    const templateSteps = Array.isArray(executionPlan?.templateSteps)
      ? executionPlan.templateSteps
      : Array.isArray(runtimeMetadata?.templateSteps)
        ? runtimeMetadata.templateSteps
        : [];
    const testCases = Array.isArray(options?.testCases) ? options.testCases.filter(Boolean) : [];

    if (steps.length === 0 && executionFlow.length === 0 && templateSteps.length === 0) {
      throw new Error('浏览器录制快照缺少执行步骤、执行流或 executionPlan.templateSteps');
    }

    const logs = [
      '开始执行浏览器录制快照静态验证...',
      '当前浏览器录制 Sandbox 校验采用静态快照验证，尚未接入静默回放。',
      `快照验证通过: 包含 ${steps.length} 个录制步骤, ${executionFlow.length} 个执行节点, ${templateSteps.length} 个模板步骤`,
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
        templateStepCount: templateSteps.length,
        testCases,
        input: options?.input || null,
      },
      errorSummary: null,
    };
  }

  buildRuntimePlan(
    payload: Record<string, unknown>,
    runtimeInput: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): BrowserRecordingRuntimePlan {
    return this.browserRecordingRuntimePlannerService.buildRuntimePlan(
      payload,
      runtimeInput,
      metadata
    );
  }
}
