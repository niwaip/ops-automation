import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getBrowserWorkerUrl } from '../config/service-endpoints';
import { asRecord, BrowserRecordingRuntimeStep } from '../compiler/browser-recording-runtime.types';
import { BrowserRecordingExecutionPlanValidatorService } from '../validator/browser-recording-execution-plan-validator.service';
import { CapabilityReleaseBrowserRecordingService } from '../compiler/capability-release-browser-recording.service';
import { CapabilityReleaseDTO, ExecuteCapabilityRuntimeResultDTO } from '../interfaces';
import type {
  CapabilityReleaseRuntimeAccessors,
  CapabilityReleaseRuntimeExecutionOptions,
} from '../publisher/capability-release-runtime.service';
import { CapabilityReleaseBrowserRuntimeExecutorService } from './capability-release-browser-runtime-executor.service';
import { CapabilityReleaseBrowserRuntimeResultService } from './capability-release-browser-runtime-result.service';
import { CapabilityReleaseBrowserRuntimeSupportService } from './capability-release-browser-runtime-support.service';
import { BrowserRuntimePlanValidation } from './capability-release-browser-runtime.types';
import { CapabilityReleaseBrowserSessionBrokerService } from './capability-release-browser-session-broker.service';

@Injectable()
export class CapabilityReleaseBrowserRuntimeService {
  constructor(
    private readonly browserRecordingExecutionPlanValidatorService: BrowserRecordingExecutionPlanValidatorService,
    private readonly capabilityReleaseBrowserRecordingService: CapabilityReleaseBrowserRecordingService,
    private readonly capabilityReleaseBrowserRuntimeExecutorService: CapabilityReleaseBrowserRuntimeExecutorService,
    private readonly capabilityReleaseBrowserRuntimeResultService: CapabilityReleaseBrowserRuntimeResultService,
    private readonly capabilityReleaseBrowserRuntimeSupportService: CapabilityReleaseBrowserRuntimeSupportService,
    private readonly browserSessionBroker: CapabilityReleaseBrowserSessionBrokerService
  ) {}

  async executePublishedSkill(
    release: CapabilityReleaseDTO,
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId: string | undefined,
    options: CapabilityReleaseRuntimeExecutionOptions | undefined,
    accessors: CapabilityReleaseRuntimeAccessors
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const runtimeInput = input || {};
    const rawExecutionPlan = asRecord(
      asRecord(snapshot.sourcePayload.apiEndpoints)?.runtimeMetadata
    )
      ? asRecord(asRecord(snapshot.sourcePayload.apiEndpoints)?.runtimeMetadata)?.executionPlan
      : undefined;
    const rawTemplateBranchConditions = Array.isArray(asRecord(rawExecutionPlan)?.templateSteps)
      ? (asRecord(rawExecutionPlan)?.templateSteps as unknown[])
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item)
          )
          .map((item) => asRecord(item.branch))
          .filter((branch): branch is Record<string, unknown> => Boolean(branch))
          .map((branch) => ({
            conditionFn: typeof branch.condition_fn === 'string' ? branch.condition_fn : null,
            description: typeof branch.description === 'string' ? branch.description : null,
            takeoverReason:
              typeof branch.takeover_reason === 'string' ? branch.takeover_reason : null,
          }))
      : [];
    if (
      rawTemplateBranchConditions.length > 0 ||
      runtimeInput.grossMarginThreshold !== undefined ||
      runtimeInput.threshold !== undefined
    ) {
      this.capabilityReleaseBrowserRuntimeSupportService.reportApproveThresholdDebug(
        'A',
        'browser recording runtime received threshold input',
        {
          skillId,
          releaseId: release.id,
          releaseName: (release as unknown as Record<string, unknown>).name || null,
          grossMarginThreshold: runtimeInput.grossMarginThreshold ?? null,
          threshold: runtimeInput.threshold ?? null,
          input: runtimeInput,
          rawTemplateBranchConditions,
        }
      );
    }

    const browserWorkerUrl = getBrowserWorkerUrl();
    const runtimeExecutionId = options?.executionId || `capability-runtime-${release.id}`;
    const planValidation = this.browserRecordingExecutionPlanValidatorService.validateForRuntime(
      snapshot.sourcePayload
    );
    const {
      backend,
      runtimeStepsToExecute,
      targetRuntimeStep,
      loopPlan,
      initialUrl,
      sessionPreferences,
    } = this.capabilityReleaseBrowserRecordingService.buildRuntimePlan(
      snapshot.sourcePayload,
      runtimeInput,
      options?.metadata
    );
    const sessionLease = await this.browserSessionBroker.acquire({
      runtimeSessionId: options?.runtimeSessionId,
      userId,
      executionId: options?.executionId,
    });
    const runtimeSessionId = sessionLease.runtimeSessionId;
    const resolvedBranchSteps = runtimeStepsToExecute
      .filter(
        (step: BrowserRecordingRuntimeStep) => step.action === 'branch' && Boolean(step.branch)
      )
      .map((step: BrowserRecordingRuntimeStep) => ({
        id: step.id,
        description: step.description || null,
        conditionFn: step.branch?.conditionFn || null,
        onMatch: step.branch?.onMatch || null,
        onMismatch: step.branch?.onMismatch || null,
        takeoverReason: step.branch?.takeoverReason || null,
      }));
    if (
      resolvedBranchSteps.length > 0 ||
      runtimeInput.grossMarginThreshold !== undefined ||
      runtimeInput.threshold !== undefined
    ) {
      this.capabilityReleaseBrowserRuntimeSupportService.reportApproveThresholdDebug(
        'B',
        'browser recording runtime resolved branch steps',
        {
          skillId,
          runtimeSessionId,
          grossMarginThreshold: runtimeInput.grossMarginThreshold ?? null,
          threshold: runtimeInput.threshold ?? null,
          resolvedBranchSteps,
        }
      );
    }

    const runtimeTrace = {
      ...planValidation.trace,
      releaseId: release.id,
      publishedSkillId: skillId,
      runtimeExecutionId,
      ...(release.currentSkillDraftId ? { skillDraftId: release.currentSkillDraftId } : {}),
    };
    const runtimeEvidence: Record<string, unknown> = {
      currentStepId: null,
      currentLoopIteration: null,
      currentRiskLevel: null,
      riskReason: null,
      lastReadValue: null,
      lastBranchDecision: null,
      takeoverReason: null,
    };
    const logs = [
      `[BrowserRuntime] 调用浏览器录制运行时`,
      `[BrowserRuntime] backend=${backend}`,
      `[BrowserRuntime] runtimeSessionId=${runtimeSessionId}`,
      `[BrowserRuntime] publishedSkillId=${skillId}`,
      `[BrowserRuntime] executionPlanVersion=${planValidation.executionPlanVersion || 'legacy/unknown'}`,
      `[BrowserRuntime] degradedMode=${planValidation.degradedMode}`,
      ...(planValidation.degradeReason
        ? [`[BrowserRuntime] degradeReason=${planValidation.degradeReason}`]
        : []),
      `[BrowserRuntime] stepCount=${runtimeStepsToExecute.length}`,
      ...(loopPlan
        ? [
            `[BrowserRuntime] loopMode=${loopPlan.mode}`,
            `[BrowserRuntime] loopMaxIterations=${loopPlan.maxIterations}`,
          ]
        : []),
    ];
    const state = {
      preserveRuntimeSession: false,
      startedAt: new Date().toISOString(),
      currentPageUrl: initialUrl,
      captureOrdinal: 0,
      attemptByStepId: {} as Record<string, number>,
      stepResults: [] as Array<Record<string, unknown>>,
      variables: {} as Record<string, unknown>,
      runtimeEvidence,
      warnings: [] as Array<{ code: string; message: string; stepId?: string }>,
      contentCandidates: [] as Array<Record<string, unknown>>,
      logs,
    };

    try {
      const shouldInitBrowserSession =
        !options?.runtimeSessionId &&
        (!targetRuntimeStep ||
          targetRuntimeStep.action === 'goto' ||
          targetRuntimeStep.action === 'navigate');
      if (shouldInitBrowserSession) {
        // Worker allocation is owned by session-broker. The release runtime only
        // initializes the browser attached to that formal runtime session when not pre-allocated.
        await axios.post<{ success: boolean; message?: string }>(
          `${browserWorkerUrl}/browser/init`,
          {
            backend,
            runtimeSessionId,
            sessionPreferences,
          },
          { timeout: 60000 }
        );
      }

      const failWithAudit = async (inputParams: {
        message: string;
        status?: 'blocked' | 'takeover_required';
        takeoverReason?: string;
        eventType?: string;
        summary?: string;
        details?: Record<string, unknown>;
      }): Promise<ExecuteCapabilityRuntimeResultDTO> => {
        const payload = this.capabilityReleaseBrowserRuntimeResultService.buildRuntimePayload({
          runtimeSessionId,
          runtimeExecutionId,
          backend,
          planValidation: planValidation as BrowserRuntimePlanValidation,
          runtimeTrace,
          state,
        });
        return this.capabilityReleaseBrowserRuntimeResultService.failWithAudit({
          release,
          skillId,
          userId,
          options,
          runtimeSessionId,
          backend,
          planValidation: planValidation as BrowserRuntimePlanValidation,
          accessors,
          result: inputParams,
          payload,
          logs,
        });
      };

      if (!planValidation.valid) {
        const message = `executionPlan 校验失败: ${planValidation.errors.map((item) => item.message).join('；')}`;
        logs.push(`[BrowserRuntime][ValidationError] ${message}`);
        return failWithAudit({
          message,
          status: 'blocked',
          eventType: 'skill_runtime_blocked_by_execution_plan_validation',
          summary: `运行时阻断：Browser Recording executionPlan 校验失败: ${skillId}`,
          details: {
            planValidation,
          },
        });
      }

      const executionResult = await this.capabilityReleaseBrowserRuntimeExecutorService.execute({
        release,
        skillId,
        options,
        accessors,
        runtimeInput,
        runtimeSessionId,
        runtimeExecutionId,
        browserWorkerUrl,
        backend,
        planValidation: planValidation as BrowserRuntimePlanValidation,
        runtimeStepsToExecute,
        targetRuntimeStep,
        loopPlan,
        state,
        failWithAudit,
      });
      if (executionResult) {
        return executionResult;
      }

      const normalizedResult =
        this.capabilityReleaseBrowserRuntimeResultService.buildRuntimePayload({
          runtimeSessionId,
          runtimeExecutionId,
          backend,
          planValidation: planValidation as BrowserRuntimePlanValidation,
          runtimeTrace,
          state,
        });

      await this.capabilityReleaseBrowserRuntimeResultService.insertSuccessAudit({
        release,
        skillId,
        userId,
        options,
        runtimeSessionId,
        backend,
        planValidation: planValidation as BrowserRuntimePlanValidation,
        accessors,
      });

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'browser_recording',
        runtimeSessionId,
        success: true,
        output: normalizedResult,
        result: normalizedResult,
        logs,
        error: null,
      };
    } catch (error) {
      const message =
        this.capabilityReleaseBrowserRuntimeResultService.normalizeUnexpectedError(error);
      logs.push(`[BrowserRuntime][Error] ${message}`);

      return this.capabilityReleaseBrowserRuntimeResultService.failWithAudit({
        release,
        skillId,
        userId,
        options,
        runtimeSessionId,
        backend,
        planValidation: planValidation as BrowserRuntimePlanValidation,
        accessors,
        result: {
          message,
          details: {
            error: message,
          },
        },
        payload: null,
        logs,
      });
    } finally {
      if (!state.preserveRuntimeSession) {
        await this.browserSessionBroker.closeOwnedQuietly(
          sessionLease,
          'published_browser_template_completed'
        );
      }
    }
  }
}
