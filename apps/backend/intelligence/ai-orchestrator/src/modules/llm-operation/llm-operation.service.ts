import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import { LLM_OPERATION_TEMPLATES } from './llm-operation.registry';
import { LlmOperationCatalogProjector, LlmOperationCatalogProjection } from './llm-operation-catalog.projector';
import { LlmOperationRegistryService } from './registry/llm-operation-registry.service';
import { PromptRendererService } from './runtime/prompt-renderer.service';
import type { Environment } from './registry/types';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';

export interface ExecuteLlmOperationDto {
  executionId: string;
  stepId: string;
  operationId: LlmOperationIdV1;
  promptTemplateId?: string;
  promptTemplateVersion?: string;
  modelPolicyId?: string;
  environment?: Environment;
  input: Record<string, any>;
}

/**
 * Machine-readable operation definition (functions stripped) exposed so the
 * control plane can freeze the authoritative input/output schemas at plan
 * freeze time — see docs/design/unified-capability-contract-and-validation-design.md §6.4.
 */
export interface LlmOperationDefinitionV1 {
  operationId: LlmOperationIdV1;
  promptTemplateId: string;
  version: string;
  modelPolicyId: string;
  temperature: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
}

@Injectable()
export class LlmOperationService {
  private readonly logger = new Logger(LlmOperationService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly catalogProjector: LlmOperationCatalogProjector,
    private readonly registry: LlmOperationRegistryService,
    private readonly promptRenderer: PromptRendererService,
  ) {}

  public async listOperationCatalog(): Promise<LlmOperationCatalogProjection[]> {
    return this.catalogProjector.projectAll();
  }

  public async getCatalogEntry(operationId: string): Promise<LlmOperationCatalogProjection | null> {
    return this.catalogProjector.projectOne(operationId);
  }

  public getOperationDefinition(operationId: string): LlmOperationDefinitionV1 {
    const template = LLM_OPERATION_TEMPLATES[operationId as LlmOperationIdV1];
    if (!template) {
      throw new BadRequestException(`LLM operation '${operationId}' is not registered`);
    }
    return {
      operationId: template.operationId,
      promptTemplateId: template.promptTemplateId,
      version: template.version,
      modelPolicyId: template.modelPolicyId,
      temperature: template.temperature,
      maxInputTokens: template.maxInputTokens,
      maxOutputTokens: template.maxOutputTokens,
      inputSchema: template.inputSchema || null,
      outputSchema: template.outputSchema || null,
    };
  }

  public async executeOperation(dto: ExecuteLlmOperationDto): Promise<{
    success: boolean;
    operationId: string;
    templateVersion: string;
    source: 'database' | 'legacy_registry';
    operationDigest: string;
    output: Record<string, any>;
    usage?: any;
    errorMessage?: string;
  }> {
    const environment = dto.environment ?? 'production';
    const resolved = await this.registry.resolveActiveVersion(dto.operationId, environment);

    if (resolved.source === 'legacy_registry') {
      this.logger.warn(
        `LLM operation '${dto.operationId}' served from legacy code registry — ` +
        `LLM_OPERATION_LEGACY_REGISTRY_FALLBACK. environment=${environment}, ` +
        `digest=${resolved.version.operationDigest}`
      );
    }

    if (dto.promptTemplateVersion && dto.promptTemplateVersion !== resolved.version.version) {
      throw new BadRequestException(
        `LLM operation version mismatch for '${dto.operationId}': expected '${dto.promptTemplateVersion}', got '${resolved.version.version}'`
      );
    }
    if (dto.modelPolicyId && dto.modelPolicyId !== (resolved.version.manifestJson as any).modelPolicyId) {
      throw new BadRequestException(
        `LLM operation modelPolicyId mismatch for '${dto.operationId}': expected '${dto.modelPolicyId}', got '${(resolved.version.manifestJson as any).modelPolicyId}'`
      );
    }

    let systemPrompt: string;
    let userPrompt: string;

    if (resolved.source === 'database') {
      const promptTemplates = (resolved.version.manifestJson as any).prompt ?? {};
      systemPrompt = promptTemplates.systemTemplate ?? '';
      userPrompt = this.promptRenderer.renderUserTemplate(promptTemplates.userTemplate ?? '', dto.input || {});
    } else {
      const template = LLM_OPERATION_TEMPLATES[dto.operationId];
      const built = template.buildPrompt(dto.input || {});
      systemPrompt = built.systemPrompt;
      userPrompt = built.userPrompt;
    }

    const activeModel = this.modelService.getPreferredDefaultModel({ mode: 'task' });
    if (!activeModel) {
      throw new Error('No active AI model configured for task operations');
    }

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    this.logger.log(`Executing LLM operation '${dto.operationId}' with model '${activeModel.name}' (step: ${dto.stepId})`);

    let response;
    try {
      response = await this.modelService.callModel(activeModel.id, fullPrompt, 'reasoning');
    } catch (callErr: any) {
      const errMsg = callErr?.message || String(callErr || '');
      this.logger.error(`Model call failed for LLM operation '${dto.operationId}': ${errMsg}`);

      if (errMsg.includes('new_sensitive') || errMsg.includes('sensitive') || errMsg.includes('1026')) {
        this.logger.warn(`Sensitive content filter triggered for '${dto.operationId}', retrying with sanitized prompt...`);
        const sanitizedPrompt = `${systemPrompt}\n\n【搜索新闻摘要】\n${userPrompt.replace(/(http[s]?:\/\/[^\s]+)/g, '').replace(/[^\w\s\u4e00-\u9fa5,。.!！?？:："“"”'‘'’\-\n\r]/g, ' ')}`;
        try {
          response = await this.modelService.callModel(activeModel.id, sanitizedPrompt, 'reasoning');
        } catch (retryErr: any) {
          return {
            success: false,
            operationId: dto.operationId,
            templateVersion: resolved.version.version,
            source: resolved.source,
            operationDigest: resolved.version.operationDigest,
            output: {},
            errorMessage: `LLM API 内容安全拦截: ${retryErr?.message || errMsg}`,
          };
        }
      } else {
        return {
          success: false,
          operationId: dto.operationId,
          templateVersion: resolved.version.version,
          source: resolved.source,
          operationDigest: resolved.version.operationDigest,
          output: {},
          errorMessage: `LLM 模型调用失败: ${errMsg}`,
        };
      }
    }

    let rawContent = response.content;

    const template = LLM_OPERATION_TEMPLATES[dto.operationId];
    try {
      const output = template.parseAndValidateOutput(rawContent);
      return {
        success: true,
        operationId: dto.operationId,
        templateVersion: resolved.version.version,
        source: resolved.source,
        operationDigest: resolved.version.operationDigest,
        output,
        usage: response.usage,
      };
    } catch (firstErr) {
      this.logger.warn(`Output format parsing failed for operation '${dto.operationId}', attempting single format repair...`);
      const repairPrompt = `${systemPrompt}\n\n你的上次输出未能符合 JSON 要求：\n${rawContent}\n\n请重新严格输出 JSON 格式。`;
      try {
        response = await this.modelService.callModel(activeModel.id, repairPrompt, 'reasoning');
        const repairedOutput = template.parseAndValidateOutput(response.content);
        return {
          success: true,
          operationId: dto.operationId,
          templateVersion: resolved.version.version,
          source: resolved.source,
          operationDigest: resolved.version.operationDigest,
          output: repairedOutput,
          usage: response.usage,
        };
      } catch (repairErr: any) {
        this.logger.error(`Format repair failed for operation '${dto.operationId}': ${repairErr.message}`);
        return {
          success: false,
          operationId: dto.operationId,
          templateVersion: resolved.version.version,
          source: resolved.source,
          operationDigest: resolved.version.operationDigest,
          output: {},
          errorMessage: `LLM operation output failed validation after repair: ${repairErr.message}`,
        };
      }
    }
  }
}
