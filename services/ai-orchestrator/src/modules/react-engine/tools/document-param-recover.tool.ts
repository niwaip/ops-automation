/**
 * Document Param Recover Tool
 * 文档渲染失败时，仅做参数层修复，不允许切换模板
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ExecutionContext, ToolResult } from '../interfaces';

const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';

interface GenerateParamsResponse {
  success?: boolean;
  generatedData?: Record<string, unknown>;
}

export class DocumentParamRecoverTool extends BaseTool {
  constructor() {
    super(
      'document_param_recover',
      '文档渲染失败时进行参数修复。该工具只允许修复参数，不允许修改模板选择。',
      {
        type: 'object',
        properties: {
          errorMessage: {
            type: 'string',
            description: '渲染失败的错误信息',
            required: true,
          },
          userInput: {
            type: 'string',
            description: '用户原始需求描述，不传则使用上下文',
            required: false,
          },
          currentParams: {
            type: 'object',
            description: '当前参数快照，不传则使用上下文 collectedParams',
            required: false,
          },
        },
        required: ['errorMessage'],
      },
      { category: 'parameter' },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const lockedTemplateId = context.documentContext?.selectedTemplateId || context.skill?.carboneTemplateId;
    const carboneSkillId = context.skill?.carboneSkillId;
    const userInput = (params.userInput as string) || context.originalUserInput || '';
    const errorMessage = (params.errorMessage as string) || '渲染失败';
    const currentParams = (params.currentParams as Record<string, unknown>) || context.collectedParams || {};

    if (!lockedTemplateId || !carboneSkillId) {
      return {
        success: false,
        output: '无法执行参数修复：缺少模板或技能绑定信息。',
        data: {
          error: 'missing_document_binding',
          hasTemplateId: Boolean(lockedTemplateId),
          hasCarboneSkillId: Boolean(carboneSkillId),
        },
      };
    }

    if (!userInput.trim()) {
      return {
        success: false,
        output: '无法执行参数修复：缺少用户原始需求描述。',
        data: { error: 'missing_user_input' },
        requiresUserInput: true,
        userInputPrompt: '请补充完整文档需求描述，我将仅修复参数并继续渲染。',
      };
    }

    const recoverDescription = [
      `用户原始需求：${userInput}`,
      `渲染错误：${errorMessage}`,
      `当前参数：${JSON.stringify(currentParams)}`,
      '请仅修复参数内容，保持模板不变。',
    ].join('\n');

    try {
      const response = await axios.post<GenerateParamsResponse>(
        `${CARBONE_SERVICE_URL}/studio/generate-parameters`,
        {
          skillId: carboneSkillId,
          description: recoverDescription,
        },
      );

      const repairedParams = response.data?.generatedData;
      if (!repairedParams || typeof repairedParams !== 'object') {
        return {
          success: false,
          output: '参数修复失败：未返回有效参数。',
          data: { error: 'param_recover_failed' },
          requiresUserInput: true,
          userInputPrompt: '参数自动修复失败，请手动补充或修正关键参数后再试。',
        };
      }

      context.collectedParams = repairedParams;

      return {
        success: true,
        output: `参数修复完成，将使用原模板 ${lockedTemplateId} 重新渲染。`,
        data: {
          templateId: lockedTemplateId,
          repairedParams,
          recovered: true,
        },
        nextAction: 'document_render',
        nextActionParams: {
          templateId: lockedTemplateId,
          data: repairedParams,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return {
        success: false,
        output: `参数修复服务调用失败：${message}`,
        data: {
          error: 'service_error',
          message,
        },
        requiresUserInput: true,
        userInputPrompt: '参数修复失败，是否需要我引导你手动补充参数后重试？',
      };
    }
  }
}
