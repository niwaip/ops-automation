import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BrowserRecordingRuntimeStep } from '../compiler/browser-recording-runtime.types';
import { BrowserRecordingActionPolicyService } from '../validator/browser-recording-action-policy.service';
import { ExecuteCapabilityRuntimeResultDTO } from '../interfaces';
import { CapabilityReleaseBrowserRuntimeSupportService } from './capability-release-browser-runtime-support.service';
import {
  BrowserRuntimeExecutionContext,
  BrowserRuntimeMutableState,
} from './capability-release-browser-runtime.types';
import { BrowserPostStateReconcilerService } from './browser-runtime-result/browser-post-state-reconciler.service';
import { BrowserRuntimeStepResultStateService } from './browser-runtime-result/browser-runtime-step-result-state.service';

@Injectable()
export class CapabilityReleaseBrowserRuntimeStepExecutorService {
  constructor(
    private readonly browserRecordingActionPolicyService: BrowserRecordingActionPolicyService,
    private readonly capabilityReleaseBrowserRuntimeSupportService: CapabilityReleaseBrowserRuntimeSupportService,
    private readonly browserPostStateReconcilerService: BrowserPostStateReconcilerService,
    private readonly browserRuntimeStepResultStateService: BrowserRuntimeStepResultStateService
  ) {}

  async executeSequence(
    context: BrowserRuntimeExecutionContext,
    steps: BrowserRecordingRuntimeStep[],
    label: string,
    state: BrowserRuntimeMutableState
  ): Promise<ExecuteCapabilityRuntimeResultDTO | null> {
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]!;
      const actionAssessment = this.browserRecordingActionPolicyService.assessRuntimeStep(step, {
        currentPageUrl: state.currentPageUrl,
      });
      state.runtimeEvidence.currentStepId = step.id;
      state.runtimeEvidence.currentRiskLevel = actionAssessment.riskLevel;
      state.runtimeEvidence.riskReason = actionAssessment.reason;
      state.logs.push(
        `[BrowserRuntime][${label}][Step ${index + 1}] ${step.action}${step.target ? ` -> ${step.target}` : ''}`
      );
      state.logs.push(
        `[BrowserRuntime][${label}][Risk] ${step.id} => ${actionAssessment.riskLevel} (${actionAssessment.reason})`
      );

      if (actionAssessment.riskLevel === 'forbidden') {
        const message = `运行时阻断高风险动作: ${actionAssessment.reason}`;
        state.logs.push(`[BrowserRuntime][Blocked] ${message}`);
        state.stepResults.push({
          stepId: step.id,
          name: step.name,
          action: step.action,
          target: step.target || null,
          output: null,
          blocked: true,
          riskLevel: actionAssessment.riskLevel,
          riskReason: actionAssessment.reason,
        });
        return context.failWithAudit({
          message,
          status: 'blocked',
          eventType: 'skill_runtime_blocked_by_action_policy',
          summary: `运行时阻断：Browser Recording 动作策略禁止执行: ${context.skillId}`,
          details: {
            stepId: step.id,
            action: step.action,
            target: step.target || null,
            riskLevel: actionAssessment.riskLevel,
            riskReason: actionAssessment.reason,
          },
        });
      }

      if (actionAssessment.riskLevel === 'confirm') {
        const takeoverReason = `运行时动作需要人工接管: ${actionAssessment.reason}`;
        state.preserveRuntimeSession = true;
        state.runtimeEvidence.takeoverReason = takeoverReason;
        await this.capabilityReleaseBrowserRuntimeSupportService.freezeBrowserRuntimeSession(
          context.browserWorkerUrl,
          context.runtimeSessionId,
          context.backend,
          takeoverReason
        );
        state.logs.push(`[BrowserRuntime][Takeover] ${takeoverReason}`);
        state.stepResults.push({
          stepId: step.id,
          name: step.name,
          action: step.action,
          target: step.target || null,
          output: null,
          takeover: true,
          takeoverReason,
          riskLevel: actionAssessment.riskLevel,
          riskReason: actionAssessment.reason,
        });
        return context.failWithAudit({
          message: takeoverReason,
          status: 'takeover_required',
          takeoverReason,
          eventType: 'skill_runtime_takeover_required_by_action_policy',
          summary: `运行时接管：Browser Recording 动作策略要求人工确认: ${context.skillId}`,
          details: {
            stepId: step.id,
            action: step.action,
            target: step.target || null,
            riskLevel: actionAssessment.riskLevel,
            riskReason: actionAssessment.reason,
          },
        });
      }

      if (step.action === 'takeover_gate') {
        state.preserveRuntimeSession = true;
        await this.capabilityReleaseBrowserRuntimeSupportService.freezeBrowserRuntimeSession(
          context.browserWorkerUrl,
          context.runtimeSessionId,
          context.backend,
          step.description || '人工接管'
        );
        const takeoverReason = step.description || '需要人工接管';
        state.runtimeEvidence.takeoverReason = takeoverReason;
        state.stepResults.push({
          stepId: step.id,
          name: step.name,
          action: step.action,
          target: step.target || null,
          output: null,
          takeover: true,
          takeoverReason,
          riskLevel: actionAssessment.riskLevel,
          riskReason: actionAssessment.reason,
        });
        return context.failWithAudit({
          message: takeoverReason,
          status: 'takeover_required',
          takeoverReason,
          summary: `运行时接管：Browser Recording takeover gate 触发: ${context.skillId}`,
          details: {
            stepId: step.id,
            action: step.action,
            target: step.target || null,
          },
        });
      }

      if (step.action === 'read_value') {
        const readResult = await this.executeReadValueStep(
          context,
          step,
          actionAssessment.riskLevel,
          actionAssessment.reason,
          state
        );
        if (readResult.failure) {
          return readResult.failure;
        }
        continue;
      }

      if (step.action === 'branch') {
        const branchResult = await this.executeBranchStep(
          context,
          step,
          actionAssessment.riskLevel,
          actionAssessment.reason,
          state
        );
        if (branchResult) {
          return branchResult;
        }
        continue;
      }

      const attempt = this.browserRuntimeStepResultStateService.nextAttempt(state, step.id);
      const captureProfile =
        step.captureProfile ||
        (context.options?.metadata?.captureProfile as Record<string, unknown> | undefined) ||
        (context.options?.metadata?.capture_profile as Record<string, unknown> | undefined) ||
        {
          schemaVersion: 'capture-profile/v1',
          profile: 'article',
          capture: { screenshot: true, html: true, mainContent: true },
        };
      const response = await axios.post<{
        success: boolean;
        snapshotId?: string;
        output?: Record<string, unknown>;
        errorCode?: string;
        errorMessage?: string;
        shouldTakeover?: boolean;
        takeoverReason?: string;
        executionState?: 'completed' | 'failed' | 'ambiguous';
        pageState?: Record<string, unknown>;
        artifacts?: Array<Record<string, unknown>>;
        attemptedAt?: string;
        observedAt?: string;
        warningCodes?: string[];
        postCheck?: Record<string, unknown>;
      }>(
        `${context.browserWorkerUrl}/browser/execute-step`,
        {
          executionId: context.runtimeExecutionId,
          runtimeSessionId: context.runtimeSessionId,
          backend: context.backend,
          stepId: `${context.options?.stepId || context.release.id}:${step.id}`,
          attempt,
          action: step.action,
          ...(step.target ? { target: step.target } : {}),
          ...(step.args && Object.keys(step.args).length > 0 ? { args: step.args } : {}),
          ...(captureProfile ? { captureProfile } : {}),
        },
        { timeout: 120000 }
      );

      const result = response.data;
      if (!result.success) {
        const reconciliation = process.env.BROWSER_POST_STATE_RECONCILIATION_ENABLED === 'true'
          ? this.browserPostStateReconcilerService.reconcile({
              action: step.action,
              result: result as Record<string, unknown>,
            })
          : { recovered: false, verification: { success: false, confidence: 0, checks: [] } };
        this.browserRuntimeStepResultStateService.recordWorkerResult({
          state,
          step,
          attempt,
          result: result as Record<string, unknown>,
          recovered: reconciliation.recovered,
          metadata: {
            ...(reconciliation.recovered ? { reconciliation: reconciliation.verification } : {}),
            ...(state.runtimeEvidence.currentLoopIteration ? { iteration: state.runtimeEvidence.currentLoopIteration } : {}),
          },
        });
        if (reconciliation.recovered) {
          state.warnings.push({
            code: reconciliation.warningCode || 'NAVIGATION_TIMEOUT_RECOVERED',
            message: '浏览器动作超时，但 post-state 对账确认页面已到达目标状态',
            stepId: step.id,
          });
          state.logs.push(`[BrowserRuntime][Recovered] ${step.id} post-state reconciliation succeeded`);
          continue;
        }
        const message = result.errorMessage || `浏览器步骤执行失败: ${step.action}`;
        if (result.shouldTakeover) {
          state.preserveRuntimeSession = true;
        }
        state.logs.push(`[BrowserRuntime][Error] ${message}`);
        return context.failWithAudit({
          message,
          summary: `运行时调用 Browser Recording Skill 失败: ${context.skillId}`,
          details: {
            stepId: step.id,
            action: step.action,
            target: step.target || null,
            shouldTakeover: result.shouldTakeover || false,
            browserTakeoverReason: result.takeoverReason || null,
          },
        });
      }

      if (step.action === 'goto') {
        const navigationUrl =
          (typeof step.args?.url === 'string' && step.args.url.trim()) ||
          (typeof step.target === 'string' && step.target.trim()) ||
          undefined;
        if (navigationUrl) {
          state.currentPageUrl = navigationUrl;
        }
      }

      this.browserRuntimeStepResultStateService.recordWorkerResult({
        state,
        step,
        attempt,
        result: result as Record<string, unknown>,
        metadata: {
          riskLevel: actionAssessment.riskLevel,
          riskReason: actionAssessment.reason,
          ...(state.runtimeEvidence.currentLoopIteration ? { iteration: state.runtimeEvidence.currentLoopIteration } : {}),
        },
      });
    }

    return null;
  }

  private async executeReadValueStep(
    context: BrowserRuntimeExecutionContext,
    step: BrowserRecordingRuntimeStep,
    riskLevel: string,
    riskReason: string,
    state: BrowserRuntimeMutableState
  ): Promise<{ failure: ExecuteCapabilityRuntimeResultDTO | null }> {
    const readAction = step.target ? 'get_text' : 'read_page';
    const attempt = this.browserRuntimeStepResultStateService.nextAttempt(state, step.id);
    const response = await axios.post<{
      success: boolean;
      snapshotId?: string;
      output?: Record<string, unknown>;
      errorCode?: string;
      errorMessage?: string;
      pageState?: Record<string, unknown>;
      artifacts?: Array<Record<string, unknown>>;
      attemptedAt?: string;
      observedAt?: string;
      warningCodes?: string[];
    }>(
      `${context.browserWorkerUrl}/browser/execute-step`,
      {
        executionId: context.runtimeExecutionId,
        runtimeSessionId: context.runtimeSessionId,
        backend: context.backend,
        stepId: `${context.options?.stepId || context.release.id}:${step.id}`,
        attempt,
        action: readAction,
        ...(step.target ? { target: step.target } : {}),
        ...(step.args && Object.keys(step.args).length > 0 ? { args: step.args } : {}),
      },
      { timeout: 120000 }
    );
    const result = response.data;
    if (!result.success) {
      this.browserRuntimeStepResultStateService.recordWorkerResult({
        state,
        step,
        attempt,
        result: result as Record<string, unknown>,
        metadata: { riskLevel, riskReason },
      });
      const message = result.errorMessage || `浏览器步骤执行失败: ${step.action}`;
      state.logs.push(`[BrowserRuntime][Error] ${message}`);
      return {
        failure: await context.failWithAudit({
          message,
          summary: `运行时调用 Browser Recording Skill 失败: ${context.skillId}`,
          details: {
            stepId: step.id,
            action: step.action,
            target: step.target || null,
          },
        }),
      };
    }

    const textValue = this.capabilityReleaseBrowserRuntimeSupportService.extractBrowserStepText(
      result.output
    );
    if (step.outputVar) {
      state.variables[step.outputVar] = textValue;
    }
    this.capabilityReleaseBrowserRuntimeSupportService.reportApproveThresholdDebug(
      'D',
      'browser recording read_value captured output',
      {
        skillId: context.skillId,
        runtimeSessionId: context.runtimeSessionId,
        stepId: step.id,
        action: step.action,
        target: step.target || null,
        outputVar: step.outputVar || null,
        textValue,
        variables: { ...state.variables },
        rawOutput: result.output || null,
      }
    );
    state.runtimeEvidence.lastReadValue = {
      var: step.outputVar || null,
      value: textValue,
    };
    this.browserRuntimeStepResultStateService.recordWorkerResult({
      state,
      step,
      attempt,
      result: result as Record<string, unknown>,
      metadata: { riskLevel, riskReason, text: textValue },
    });
    return { failure: null };
  }

  private async executeBranchStep(
    context: BrowserRuntimeExecutionContext,
    step: BrowserRecordingRuntimeStep,
    riskLevel: string,
    riskReason: string,
    state: BrowserRuntimeMutableState
  ): Promise<ExecuteCapabilityRuntimeResultDTO | null> {
    const branchResult = this.capabilityReleaseBrowserRuntimeSupportService.evaluateBrowserBranchStep(
      step,
      state.variables
    );
    state.runtimeEvidence.lastBranchDecision = {
      condition: step.branch?.conditionFn || null,
      result: branchResult.outcome,
    };
    this.capabilityReleaseBrowserRuntimeSupportService.reportApproveThresholdDebug(
      'C',
      'browser recording branch evaluated',
      {
        skillId: context.skillId,
        runtimeSessionId: context.runtimeSessionId,
        grossMarginThreshold: context.runtimeInput.grossMarginThreshold ?? null,
        threshold: context.runtimeInput.threshold ?? null,
        branchCondition: step.branch?.conditionFn || null,
        variables: state.variables,
        outcome: branchResult.outcome,
        message: branchResult.message || null,
        error: branchResult.error || null,
        takeoverReason: branchResult.takeoverReason || null,
      }
    );
    state.stepResults.push({
      stepId: step.id,
      name: step.name,
      action: step.action,
      target: step.target || null,
      output: null,
      riskLevel,
      riskReason,
      ...(branchResult.message ? { message: branchResult.message } : {}),
      ...(branchResult.error ? { error: branchResult.error } : {}),
      ...(branchResult.takeover
        ? { takeover: true, takeoverReason: branchResult.takeoverReason || null }
        : {}),
    });

    if (branchResult.outcome === 'continue') {
      return null;
    }
    if (branchResult.outcome === 'takeover') {
      state.preserveRuntimeSession = true;
      const takeoverReason = branchResult.takeoverReason || '条件未满足，需要人工接管';
      state.runtimeEvidence.takeoverReason = takeoverReason;
      await this.capabilityReleaseBrowserRuntimeSupportService.freezeBrowserRuntimeSession(
        context.browserWorkerUrl,
        context.runtimeSessionId,
        context.backend,
        takeoverReason
      );
      state.logs.push(`[BrowserRuntime][Takeover] ${takeoverReason}`);
      return context.failWithAudit({
        message: takeoverReason,
        status: 'takeover_required',
        takeoverReason,
        eventType: 'skill_runtime_takeover_required_by_branch',
        summary: `运行时接管：Browser Recording 条件分支要求人工介入: ${context.skillId}`,
        details: {
          stepId: step.id,
          action: step.action,
          target: step.target || null,
          branchCondition: step.branch?.conditionFn || null,
        },
      });
    }

    const message = branchResult.error || '浏览器分支步骤停止执行';
    state.logs.push(`[BrowserRuntime][Error] ${message}`);
    return context.failWithAudit({
      message,
      status: 'blocked',
      eventType: 'skill_runtime_blocked_by_branch',
      summary: `运行时阻断：Browser Recording 条件分支停止执行: ${context.skillId}`,
      details: {
        stepId: step.id,
        action: step.action,
        target: step.target || null,
        branchCondition: step.branch?.conditionFn || null,
      },
    });
  }
}
