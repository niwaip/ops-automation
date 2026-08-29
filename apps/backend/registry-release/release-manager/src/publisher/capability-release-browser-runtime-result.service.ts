import { Injectable } from '@nestjs/common';
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
import { BrowserLegacyOutputAdapter } from './browser-runtime-result/browser-legacy-output.adapter';
import { BrowserRunOutputMaterializerService } from './browser-runtime-result/browser-run-output-materializer.service';

@Injectable()
export class CapabilityReleaseBrowserRuntimeResultService {
  constructor(
    private readonly browserRunOutputMaterializerService: BrowserRunOutputMaterializerService,
    private readonly browserLegacyOutputAdapter: BrowserLegacyOutputAdapter
  ) {}

  buildRuntimePayload(input: {
    runtimeSessionId: string;
    runtimeExecutionId: string;
    backend: string;
    planValidation: BrowserRuntimePlanValidation;
    runtimeTrace: Record<string, unknown>;
    state: BrowserRuntimeMutableState;
  }): Record<string, unknown> {
    const legacy = this.browserLegacyOutputAdapter.build(input);
    const compositionRecord = input.planValidation.composition as Record<string, any> | undefined;
    const hasComposition = Boolean(
      (Array.isArray(compositionRecord?.postProcessingSteps) && compositionRecord.postProcessingSteps.length > 0) ||
      (Array.isArray(compositionRecord?.outputDeclarations) && compositionRecord.outputDeclarations.length > 0)
    );
    if (
      process.env.BROWSER_RUN_OUTPUT_V2_ENABLED !== 'true' ||
      (!input.planValidation.browserRunOutputV2 && !hasComposition)
    ) {
      return legacy;
    }
    const browserRunOutput = this.browserRunOutputMaterializerService.materialize({
        executionId: input.runtimeExecutionId,
        runtimeSessionId: input.runtimeSessionId,
        backend: input.backend,
        state: input.state,
        outputNames: input.planValidation.outputNames.filter((name) => name !== 'browserRunOutput'),
      });
    const declaredOutputs = Object.fromEntries(
      Object.entries(browserRunOutput.outputs).map(([name, output]) => [name, output.value])
    );
    const contentCandidates = this.attachDeclaredContentOutputs(
      input.state.contentCandidates || [],
      input.planValidation.composition,
    );
    const declaredContentOutputs = Object.fromEntries(
      contentCandidates
        .filter((candidate) => typeof candidate.outputName === 'string')
        .map((candidate) => [
          candidate.outputName as string,
          candidate,
        ]),
    );
    return {
      browserRunOutput,
      ...declaredOutputs,
      ...declaredContentOutputs,
      ...(process.env.BROWSER_CONTENT_REF_ENABLED === 'true' && input.state.contentCandidates?.length
        ? { contentCandidates }
        : {}),
      ...(process.env.BROWSER_RUN_OUTPUT_V2_DUAL_WRITE !== 'false' ? legacy : {}),
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

  private attachDeclaredContentOutputs(
    candidates: Array<Record<string, unknown>>,
    composition?: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const aliases = Array.isArray(composition?.pageAliases) ? composition.pageAliases : [];
    const declarations = Array.isArray(composition?.outputDeclarations)
      ? composition.outputDeclarations
      : [];
    return candidates.map((candidate) => {
      const alias = aliases.find((item) => this.pageMatches(item, candidate));
      const declaration = alias && declarations.find((item) =>
        isRecord(item) && item.kind === 'content' && item.sourcePageAlias === alias.alias,
      );
      return isRecord(declaration) && typeof declaration.name === 'string'
        ? { ...candidate, outputName: declaration.name }
        : candidate;
    });
  }

  private pageMatches(alias: unknown, candidate: Record<string, unknown>): boolean {
    if (!isRecord(alias)) return false;
    if (
      typeof alias.sourceStepId === 'string' &&
      alias.sourceStepId !== candidate.sourceStepId
    ) {
      return false;
    }
    const match = isRecord(alias.match) ? alias.match : {};
    return this.matchesPattern(match.urlPattern, candidate.finalUrl || candidate.sourceUrl)
      && this.matchesPattern(match.titlePattern, candidate.title);
  }

  private matchesPattern(pattern: unknown, value: unknown): boolean {
    if (typeof pattern !== 'string' || !pattern) return true;
    if (typeof value !== 'string') return false;
    try { return new RegExp(pattern, 'u').test(value); } catch { return false; }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
