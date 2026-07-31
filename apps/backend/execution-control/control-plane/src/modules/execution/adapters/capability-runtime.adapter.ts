import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import {
  ArtifactRef,
  SnapshotRef,
  buildRuntimeAdapterRouteKey,
  RuntimeAdapter,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
} from './runtime-adapter.interface';

interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface CapabilityRuntimeExecuteResult {
  releaseId: string;
  capabilityId: string;
  capabilityVersion?: string | null;
  publishedSkillId: string;
  runtime: string;
  status?: 'completed' | 'failed' | 'blocked' | 'waiting' | 'takeover_required';
  fn?: string;
  taskQueue?: string;
  success: boolean;
  output?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: LLMUsage;
  retryable?: boolean;
  requiresTakeover?: boolean;
  takeoverReason?: string | null;
  logs: string[];
  error?: string | null;
}

interface RuntimeArtifactRecord {
  command?: unknown;
  status?: unknown;
  snapshot?: {
    id?: unknown;
    path?: unknown;
  } | null;
  artifact?: {
    path?: unknown;
  } | null;
}

@Injectable()
export class CapabilityRuntimeAdapter implements RuntimeAdapter {
  private readonly logger = new Logger(CapabilityRuntimeAdapter.name);
  readonly runtimeType = 'custom' as const;
  readonly routeKeys = [buildRuntimeAdapterRouteKey('custom', 'skill.runtime')] as const;
  private readonly authServiceUrl = getAuthServiceUrl();

  supports(request: RuntimeStepInvokeRequest): boolean {
    return request.capabilityType === 'skill.runtime';
  }

  async invokeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult> {
    let response;
    try {
      response = await axios.post<CapabilityRuntimeExecuteResult>(
        `${this.authServiceUrl}/capabilities/runtime/execute`,
        {
          capabilityId: request.publishedSkillId || request.skillId,
          capabilityVersion:
            typeof request.metadata?.capabilityVersion === 'string'
              ? request.metadata.capabilityVersion
              : undefined,
          executionId: request.executionId,
          stepId: request.stepId,
          runtimeSessionId: request.runtimeSessionId || undefined,
          phaseKey:
            typeof request.metadata?.phaseKey === 'string' ? request.metadata.phaseKey : undefined,
          input: request.input,
          metadata: request.metadata,
        },
        { timeout: 300_000 }
      );
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err?.message || 'Capability runtime call failed';
      const status = err?.response?.status;
      this.logger.error(`Capability runtime call failed (status=${status}): ${errMsg}`);
      return {
        success: false,
        status: 'failed',
        errorCode: 'CAPABILITY_RUNTIME_FAILED',
        errorMessage: errMsg,
        retryable: status ? status >= 500 : false,
      };
    }

    const runtimeResult = response.data;
    if (process.env.DEBUG_RUNTIME_OUTPUT === 'true') {
      this.logger.warn(
        `runtimeResult raw: success=${runtimeResult.success}, status=${runtimeResult.status}, outputKeys=${runtimeResult.output && typeof runtimeResult.output === 'object' ? Object.keys(runtimeResult.output) : 'n/a'}`
      );
      this.logger.warn(
        `runtimeResult.output preview: ${JSON.stringify(runtimeResult.output).slice(0, 1200)}`
      );
    }
    const output = this.normalizeOutput(
      runtimeResult.output || runtimeResult.result || undefined
    );
    if (process.env.DEBUG_RUNTIME_OUTPUT === 'true') {
      this.logger.warn(
        `normalizeOutput result keys: ${output && typeof output === 'object' ? Object.keys(output) : 'n/a'}`
      );
      this.logger.warn(`normalizeOutput preview: ${JSON.stringify(output).slice(0, 1200)}`);
    }
    const artifacts = this.extractArtifacts(runtimeResult);
    const snapshot = this.extractSnapshot(artifacts);
    const requiresTakeover =
      runtimeResult.requiresTakeover === true || runtimeResult.status === 'takeover_required';
    const status = requiresTakeover
      ? 'takeover_required'
      : runtimeResult.status === 'waiting'
        ? 'waiting'
        : runtimeResult.status === 'blocked'
          ? 'blocked'
          : runtimeResult.success
            ? 'completed'
            : 'failed';

    return {
      success: runtimeResult.success,
      status,
      output: output || undefined,
      artifacts,
      snapshot,
      errorCode: runtimeResult.success ? undefined : 'CAPABILITY_RUNTIME_FAILED',
      errorMessage: runtimeResult.error || undefined,
      retryable: runtimeResult.retryable,
      requiresTakeover,
      takeoverReason: runtimeResult.takeoverReason || undefined,
      rawResult: runtimeResult as unknown as Record<string, unknown>,
    };
  }

  /**
   * Published Skills may keep a presentation-oriented result envelope internally,
   * while deterministic plans require stable, top-level contract fields.
   *
   * Strategy: surface every field declared on `result.businessData` (and the
   * legacy search aliases) onto the top level so downstream output-contract
   * validation can find them regardless of where the workflow nested them.
   * The searchResults alias chain stays first so existing alias lookups
   * (results/news_item_list/data) still behave the same.
   */
  private normalizeOutput(
    output: Record<string, unknown> | null | undefined
  ): Record<string, unknown> | undefined {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return output || undefined;
    }

    const normalized = { ...output };

    const nestedResult = this.asRecord(normalized.result);
    const businessData =
      this.asRecord(nestedResult?.businessData) ||
      this.asRecord(normalized.businessData);

    // Legacy search aliases: top-level results/news_item_list/data first, then
    // nested result.results, then businessData.results, then businessData.searchResults.
    const searchResults =
      normalized.results ??
      normalized.news_item_list ??
      normalized.data ??
      nestedResult?.results ??
      businessData?.results ??
      businessData?.searchResults;
    if (searchResults !== undefined && searchResults !== null) {
      normalized.searchResults ??= searchResults;
    }

    // Generic fallback: surface any field declared on businessData onto the
    // top level when the workflow envelope nests it there. Avoids a hardcoded
    // per-field alias table that drifts as plans declare new output fields
    // (e.g. responseMetadata, totalResults, query).
    if (businessData) {
      for (const [key, value] of Object.entries(businessData)) {
        if (normalized[key] === undefined && value !== undefined && value !== null) {
          normalized[key] = value;
        }
      }
    }

    return normalized;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private extractArtifacts(
    runtimeResult: CapabilityRuntimeExecuteResult
  ): ArtifactRef[] | undefined {
    const output = runtimeResult.output || runtimeResult.result;
    if (!output || typeof output !== 'object') {
      return undefined;
    }

    const artifacts: ArtifactRef[] = [];

    const directArtifacts = Array.isArray((output as Record<string, unknown>).artifacts)
      ? ((output as Record<string, unknown>).artifacts as ArtifactRef[])
      : (output as Record<string, unknown>).artifact
        ? [((output as Record<string, unknown>).artifact as ArtifactRef)]
        : [];

    for (const art of directArtifacts) {
      if (art && (art.url || art.id)) {
        artifacts.push(art);
      }
    }
    const phaseResults = Array.isArray((output as Record<string, unknown>).phaseResults)
      ? ((output as Record<string, unknown>).phaseResults as Array<Record<string, unknown>>)
      : [];

    for (const phaseResult of phaseResults) {
      const phaseOutput = phaseResult?.result;
      if (!phaseOutput || typeof phaseOutput !== 'object') {
        continue;
      }

      const runtimeArtifacts = Array.isArray((phaseOutput as Record<string, unknown>).artifacts)
        ? ((phaseOutput as Record<string, unknown>).artifacts as RuntimeArtifactRecord[])
        : [];

      runtimeArtifacts.forEach((artifact, index) => {
        const snapshotId =
          typeof artifact.snapshot?.id === 'string' ? artifact.snapshot.id : undefined;
        const snapshotPath =
          typeof artifact.snapshot?.path === 'string' ? artifact.snapshot.path : undefined;
        const artifactPath =
          typeof artifact.artifact?.path === 'string' ? artifact.artifact.path : undefined;
        const command = typeof artifact.command === 'string' ? artifact.command : undefined;
        const status = typeof artifact.status === 'string' ? artifact.status : undefined;

        if (!snapshotId && !snapshotPath && !artifactPath) {
          return;
        }

        artifacts.push({
          type: snapshotId ? 'snapshot' : 'browser_artifact',
          id: snapshotId,
          name: command ? `${command}-${index + 1}` : undefined,
          metadata: {
            ...(command ? { command } : {}),
            ...(status ? { status } : {}),
            ...(snapshotPath ? { snapshotPath } : {}),
            ...(artifactPath ? { artifactPath } : {}),
          },
        });
      });
    }

    return artifacts.length > 0 ? artifacts : undefined;
  }

  private extractSnapshot(artifacts?: ArtifactRef[]): SnapshotRef | null | undefined {
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      return undefined;
    }

    const lastSnapshotArtifact = [...artifacts].reverse().find((artifact) => artifact.id);
    if (!lastSnapshotArtifact?.id) {
      return undefined;
    }

    return {
      id: lastSnapshotArtifact.id,
      type: 'browser',
      metadata: lastSnapshotArtifact.metadata,
    };
  }
}
