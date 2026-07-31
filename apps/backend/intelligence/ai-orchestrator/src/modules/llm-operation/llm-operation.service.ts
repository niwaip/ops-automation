import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import { LLM_OPERATION_TEMPLATES } from './llm-operation.registry';
import type { LlmOperationIdV1 } from '@ops/backend-deterministic-plan';

export interface ExecuteLlmOperationDto {
  executionId: string;
  stepId: string;
  operationId: LlmOperationIdV1;
  promptTemplateId: string;
  promptTemplateVersion: string;
  modelPolicyId: string;
  input: Record<string, any>;
}

@Injectable()
export class LlmOperationService {
  private readonly logger = new Logger(LlmOperationService.name);

  constructor(private readonly modelService: ModelService) {}

  public async executeOperation(dto: ExecuteLlmOperationDto): Promise<{
    success: boolean;
    operationId: string;
    templateVersion: string;
    output: Record<string, any>;
    usage?: any;
    errorMessage?: string;
  }> {
    const template = LLM_OPERATION_TEMPLATES[dto.operationId];
    if (!template) {
      throw new BadRequestException(`LLM operation '${dto.operationId}' is not registered`);
    }

    if (dto.promptTemplateId && dto.promptTemplateId !== template.promptTemplateId) {
      throw new BadRequestException(
        `LLM operation promptTemplateId mismatch for '${dto.operationId}': expected '${template.promptTemplateId}', got '${dto.promptTemplateId}'`,
      );
    }

    if (dto.promptTemplateVersion && dto.promptTemplateVersion !== template.version) {
      throw new BadRequestException(
        `LLM operation promptTemplateVersion mismatch for '${dto.operationId}': expected '${template.version}', got '${dto.promptTemplateVersion}'`,
      );
    }

    if (dto.modelPolicyId && dto.modelPolicyId !== template.modelPolicyId) {
      throw new BadRequestException(
        `LLM operation modelPolicyId mismatch for '${dto.operationId}': expected '${template.modelPolicyId}', got '${dto.modelPolicyId}'`,
      );
    }

    const activeModel = this.modelService.getPreferredDefaultModel({ mode: 'task' });
    if (!activeModel) {
      throw new Error('No active AI model configured for task operations');
    }

    const { systemPrompt, userPrompt } = template.buildPrompt(dto.input || {});
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
            templateVersion: template.version,
            output: {},
            errorMessage: `LLM API 内容安全拦截: ${retryErr?.message || errMsg}`,
          };
        }
      } else {
        return {
          success: false,
          operationId: dto.operationId,
          templateVersion: template.version,
          output: {},
          errorMessage: `LLM 模型调用失败: ${errMsg}`,
        };
      }
    }

    let rawContent = response.content;

    try {
      const output = template.parseAndValidateOutput(rawContent);
      return {
        success: true,
        operationId: dto.operationId,
        templateVersion: template.version,
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
          templateVersion: template.version,
          output: repairedOutput,
          usage: response.usage,
        };
      } catch (repairErr: any) {
        this.logger.error(`Format repair failed for operation '${dto.operationId}': ${repairErr.message}`);
        return {
          success: false,
          operationId: dto.operationId,
          templateVersion: template.version,
          output: {},
          errorMessage: `LLM operation output failed validation after repair: ${repairErr.message}`,
        };
      }
    }
  }
}
