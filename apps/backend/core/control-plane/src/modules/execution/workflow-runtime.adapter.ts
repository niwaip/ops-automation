import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import {
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
  output?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: LLMUsage;
  logs: string[];
  error?: string | null;
}

@Injectable()
export class WorkflowRuntimeAdapter implements RuntimeAdapter {
  readonly runtimeType = 'workflow' as const;
  readonly routeKeys = [buildRuntimeAdapterRouteKey('workflow', 'workflow.run')] as const;
  private readonly authServiceUrl = getAuthServiceUrl();

  supports(request: RuntimeStepInvokeRequest): boolean {
    return request.runtimeType === 'workflow' && request.capabilityType === 'workflow.run';
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

    return {
      success: runtimeResult.success,
      status: runtimeResult.success ? 'completed' : 'failed',
      output: output || undefined,
      errorCode: runtimeResult.success ? undefined : 'CAPABILITY_RUNTIME_FAILED',
      errorMessage: runtimeResult.error || undefined,
      rawResult: runtimeResult as unknown as Record<string, unknown>,
    };
  }
}
