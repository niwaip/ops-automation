import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../config/service-endpoints';
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
  readonly runtimeType = 'custom' as const;
  readonly routeKeys = [buildRuntimeAdapterRouteKey('custom', 'skill.runtime')] as const;
  private readonly authServiceUrl = getAuthServiceUrl();

  supports(request: RuntimeStepInvokeRequest): boolean {
    return request.capabilityType === 'skill.runtime';
  }

  async invokeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult> {
    const response = await axios.post<CapabilityRuntimeExecuteResult>(
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
      }
    );

    const runtimeResult = response.data;
    const output = runtimeResult.output || runtimeResult.result || undefined;
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

  private extractArtifacts(
    runtimeResult: CapabilityRuntimeExecuteResult
  ): ArtifactRef[] | undefined {
    const output = runtimeResult.output || runtimeResult.result;
    if (!output || typeof output !== 'object') {
      return undefined;
    }

    const phaseResults = Array.isArray((output as Record<string, unknown>).phaseResults)
      ? ((output as Record<string, unknown>).phaseResults as Array<Record<string, unknown>>)
      : [];

    const artifacts: ArtifactRef[] = [];
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
