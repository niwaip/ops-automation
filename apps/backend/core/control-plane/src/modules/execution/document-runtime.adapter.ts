import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import {
  ArtifactRef,
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
  fn?: string;
  taskQueue?: string;
  success: boolean;
  downloadUrl?: string | null;
  output?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: LLMUsage;
  logs: string[];
  error?: string | null;
}

@Injectable()
export class DocumentRuntimeAdapter implements RuntimeAdapter {
  readonly runtimeType = 'document' as const;
  readonly routeKeys = [buildRuntimeAdapterRouteKey('document', 'document.render')] as const;
  private readonly authServiceUrl = getAuthServiceUrl();

  supports(request: RuntimeStepInvokeRequest): boolean {
    return request.runtimeType === 'document' && request.capabilityType === 'document.render';
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
        runtimeType: request.runtimeType,
        input: request.input,
      },
    );

    const runtimeResult = response.data;
    const output = runtimeResult.output || runtimeResult.result || undefined;
    const artifacts = this.buildArtifacts(output, runtimeResult.downloadUrl);

    return {
      success: runtimeResult.success,
      status: runtimeResult.success ? 'completed' : 'failed',
      output: output || undefined,
      errorCode: runtimeResult.success ? undefined : 'CAPABILITY_RUNTIME_FAILED',
      errorMessage: runtimeResult.error || undefined,
      artifacts,
      rawResult: runtimeResult as unknown as Record<string, unknown>,
    };
  }

  private buildArtifacts(
    output: Record<string, unknown> | undefined,
    explicitDownloadUrl?: string | null,
  ): ArtifactRef[] | undefined {
    const downloadUrl = this.pickFirstString(
      explicitDownloadUrl,
      output?.downloadUrl,
      output?.download_url,
      output?.url,
    );
    if (!downloadUrl) {
      return undefined;
    }

    return [
      {
        type: 'document',
        name: this.pickFirstString(output?.fileName, output?.file_name, output?.name),
        url: downloadUrl,
        mimeType: this.resolveMimeType(output),
        sizeBytes: this.pickFirstPositiveNumber(output?.sizeBytes, output?.size, output?.fileSize),
        metadata: output,
      },
    ];
  }

  private resolveMimeType(output: Record<string, unknown> | undefined): string | undefined {
    const explicitMimeType = this.pickFirstString(output?.mimeType, output?.mime_type);
    if (explicitMimeType) {
      return explicitMimeType;
    }

    const format = this.pickFirstString(output?.format, output?.outputFormat)?.toLowerCase();
    switch (format) {
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'html':
        return 'text/html';
      default:
        return undefined;
    }
  }

  private pickFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstPositiveNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return undefined;
  }
}
