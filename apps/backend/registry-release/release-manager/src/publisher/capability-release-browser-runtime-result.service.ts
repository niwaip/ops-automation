import { CapabilityReleaseDTO, ExecuteCapabilityRuntimeResultDTO } from '../interfaces';
import type {
  CapabilityReleaseRuntimeAccessors,
  CapabilityReleaseRuntimeExecutionOptions,
} from '../publisher/capability-release-runtime.service';
import {
  BrowserRuntimeFailWithAuditInput,
  BrowserRuntimeMutableState,
  BrowserRuntimePlanValidation,
} from './capability-release-browser-runtime.types';

export class CapabilityReleaseBrowserRuntimeResultService {
  buildRuntimePayload(input: {
    runtimeSessionId: string;
    backend: string;
    planValidation: BrowserRuntimePlanValidation;
    runtimeTrace: Record<string, unknown>;
    state: BrowserRuntimeMutableState;
  }): Record<string, unknown> {
    return {
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      stepResults: input.state.stepResults,
      variables: input.state.variables,
      executionPlanVersion: input.planValidation.executionPlanVersion || 'legacy/unknown',
      degradedMode: input.planValidation.degradedMode,
      degradeReason: input.planValidation.degradeReason,
      trace: input.runtimeTrace,
      runtimeEvidence: input.state.runtimeEvidence,
    };
  }

  buildFailureResult(input: {
    release: CapabilityReleaseDTO;
    skillId: string;
    options: CapabilityReleaseRuntimeExecutionOptions | undefined;
    runtimeSessionId: string;
    message: string;
    status?: 'blocked' | 'takeover_required';
    takeoverReason?: string;
    payload: Record<string, unknown> | null;
    logs: string[];
  }): ExecuteCapabilityRuntimeResultDTO {
    return {
      releaseId: input.release.id,
      capabilityId: input.skillId,
      capabilityVersion: input.options?.capabilityVersion || null,
      publishedSkillId: input.skillId,
      runtime: 'browser_recording',
      ...(input.status ? { status: input.status } : {}),
      success: false,
      runtimeSessionId: input.runtimeSessionId,
      ...(input.status === 'takeover_required' ? { requiresTakeover: true } : {}),
      ...(input.takeoverReason ? { takeoverReason: input.takeoverReason } : {}),
      output: input.payload,
      result: input.payload,
      logs: input.logs,
      error: input.message,
    };
  }

  buildAuditDetails(input: {
    skillId: string;
    options: CapabilityReleaseRuntimeExecutionOptions | undefined;
    runtimeSessionId: string;
    backend: string;
    planValidation: BrowserRuntimePlanValidation;
    details?: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      publishedSkillId: input.skillId,
      capabilityId: input.skillId,
      capabilityVersion: input.options?.capabilityVersion || null,
      runtime: 'browser_recording',
      requestedRuntimeType: input.options?.runtimeType || null,
      executionId: input.options?.executionId || null,
      stepId: input.options?.stepId || null,
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      executionPlanVersion: input.planValidation.executionPlanVersion || 'legacy/unknown',
      degradedMode: input.planValidation.degradedMode,
      degradeReason: input.planValidation.degradeReason,
      ...input.details,
    };
  }

  async failWithAudit(input: {
    release: CapabilityReleaseDTO;
    skillId: string;
    userId: string | undefined;
    options: CapabilityReleaseRuntimeExecutionOptions | undefined;
    runtimeSessionId: string;
    backend: string;
    planValidation: BrowserRuntimePlanValidation;
    accessors: CapabilityReleaseRuntimeAccessors;
    result: BrowserRuntimeFailWithAuditInput;
    payload: Record<string, unknown> | null;
    logs: string[];
  }): Promise<ExecuteCapabilityRuntimeResultDTO> {
    await input.accessors.insertAuditEvent(
      input.release.id,
      input.result.eventType ||
        (input.result.status === 'takeover_required'
          ? 'skill_runtime_takeover_required'
          : input.result.status === 'blocked'
            ? 'skill_runtime_blocked'
            : 'skill_runtime_invoked'),
      input.userId,
      false,
      input.result.summary || `运行时调用 Browser Recording Skill 失败: ${input.skillId}`,
      this.buildAuditDetails({
        skillId: input.skillId,
        options: input.options,
        runtimeSessionId: input.runtimeSessionId,
        backend: input.backend,
        planValidation: input.planValidation,
        details: {
          ...(input.result.takeoverReason
            ? { takeoverReason: input.result.takeoverReason }
            : {}),
          ...input.result.details,
        },
      })
    );

    return this.buildFailureResult({
      release: input.release,
      skillId: input.skillId,
      options: input.options,
      runtimeSessionId: input.runtimeSessionId,
      message: input.result.message,
      status: input.result.status,
      takeoverReason: input.result.takeoverReason,
      payload: input.payload,
      logs: input.logs,
    });
  }

  async insertSuccessAudit(input: {
    release: CapabilityReleaseDTO;
    skillId: string;
    userId: string | undefined;
    options: CapabilityReleaseRuntimeExecutionOptions | undefined;
    runtimeSessionId: string;
    backend: string;
    planValidation: BrowserRuntimePlanValidation;
    accessors: CapabilityReleaseRuntimeAccessors;
  }): Promise<void> {
    await input.accessors.insertAuditEvent(
      input.release.id,
      'skill_runtime_invoked',
      input.userId,
      true,
      `运行时调用 Browser Recording Skill 成功: ${input.skillId}`,
      this.buildAuditDetails({
        skillId: input.skillId,
        options: input.options,
        runtimeSessionId: input.runtimeSessionId,
        backend: input.backend,
        planValidation: input.planValidation,
      })
    );
  }

  normalizeUnexpectedError(error: unknown): string {
    const axiosLikeError = error as
      | { response?: { status?: number; data?: unknown }; message?: string }
      | undefined;
    if (axiosLikeError?.response) {
      const detail = axiosLikeError.response.data;
      if (detail !== undefined) {
        return `HTTP ${axiosLikeError.response.status || 500}: ${JSON.stringify(detail)}`;
      }
      return axiosLikeError.message || 'Browser recording runtime execution failed';
    }
    return error instanceof Error ? error.message : 'Browser recording runtime execution failed';
  }
}
