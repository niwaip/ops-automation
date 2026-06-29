import { Injectable } from '@nestjs/common';
import { TemporalWorkflowConfigService } from './temporal-workflow-config.service';

@Injectable()
export class TemporalWorkflowConfigOrchestrationService {
  constructor(private readonly workflowConfigService: TemporalWorkflowConfigService) {}

  async optimizeHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {},
    userRequest?: string
  ): Promise<{
    success: boolean;
    optimizedConfig?: Record<string, any>;
    previewResponse?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    return this.workflowConfigService.optimizeHttpRequestConfig(
      stepConfig,
      inputParams,
      userRequest
    );
  }

  async previewHttpRequestConfig(
    stepConfig: Record<string, any>,
    inputParams: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    baseConfig?: Record<string, any>;
    resolvedRequest?: Record<string, any>;
    previewResponse?: Record<string, any>;
    error?: string;
  }> {
    return this.workflowConfigService.previewHttpRequestConfig(stepConfig, inputParams);
  }

  async generateStructuredTransformConfig(
    sourceSample: Record<string, any> | string,
    userRequest: string,
    existingConfig?: Record<string, any>
  ): Promise<{
    success: boolean;
    config?: Record<string, any>;
    explanation?: string;
    error?: string;
  }> {
    return this.workflowConfigService.generateStructuredTransformConfig(
      sourceSample,
      userRequest,
      existingConfig
    );
  }
}
