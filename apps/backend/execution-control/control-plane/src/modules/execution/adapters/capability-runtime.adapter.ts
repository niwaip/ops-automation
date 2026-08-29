import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import { OutputNormalizerService } from '../plan-runtime/output-normalizer.service';
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

  constructor(private readonly outputNormalizer: OutputNormalizerService) {}

  supports(request: RuntimeStepInvokeRequest): boolean {
    return request.capabilityType === 'skill.runtime';
  }

  async invokeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult> {
    let response;
    try {
      const internalSecret =
        process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
      const tracedUserId = request.traceContext?.userId;
      const requestConfig = {
        timeout: 300_000,
        ...(internalSecret && tracedUserId
          ? {
              headers: {
                'x-internal-auth': internalSecret,
                'x-user-id': tracedUserId,
              },
            }
          : {}),
      };
      const captureProfile =
        (request.input?.captureProfile as Record<string, unknown>) ||
        (request.input?.capture_profile as Record<string, unknown>) ||
        (request.metadata?.captureProfile as Record<string, unknown>) ||
        (request.metadata?.capture_profile as Record<string, unknown>) ||
        {
          schemaVersion: 'capture-profile/v1',
          profile: 'article',
          capture: { screenshot: true, html: true, mainContent: true },
        };
      const metadata = {
        ...(request.metadata || {}),
        captureProfile,
      };
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
          metadata,
        },
        requestConfig
      );
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.message ||
        err?.response?.data?.errorMessage ||
        err?.response?.data?.error ||
        err?.message ||
        'Capability runtime call failed';
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
    const output = this.outputNormalizer.normalize(
      runtimeResult.output || runtimeResult.result || undefined
    );
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

  // Output alias/normalization (searchResults synthesis + businessData
  // surfacing) moved to OutputNormalizerService — the single authority.

  private extractArtifacts(
    runtimeResult: CapabilityRuntimeExecuteResult
  ): ArtifactRef[] | undefined {
    const output = runtimeResult.output || runtimeResult.result;
    if (!output || typeof output !== 'object') {
      return undefined;
    }

    const artifacts: ArtifactRef[] = [];

    const outputRecord = output as Record<string, unknown>;
    const browserRunOutput = outputRecord.browserRunOutput;
    const browserArtifacts =
      browserRunOutput && typeof browserRunOutput === 'object' && !Array.isArray(browserRunOutput)
        ? (browserRunOutput as Record<string, unknown>).artifacts
        : undefined;
    const directArtifacts = Array.isArray(outputRecord.artifacts)
      ? (outputRecord.artifacts as ArtifactRef[])
      : Array.isArray(browserArtifacts)
        ? (browserArtifacts as ArtifactRef[])
        : outputRecord.artifact
          ? [outputRecord.artifact as ArtifactRef]
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
