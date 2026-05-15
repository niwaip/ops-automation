/**
 * Document Param Recover Tool
 * 文档渲染失败时，仅做参数层修复，不允许切换模板
 */

import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { getCarboneServiceUrl } from '../../../config/service-endpoints';
import { BaseTool } from './base.tool';
import { ExecutionContext, ToolResult } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';

interface GenerateParamsResponse {
  success?: boolean;
  generatedData?: Record<string, unknown>;
}

const isTemplateVisibleInSnapshot = (
  templateId: string | undefined,
  context: ExecutionContext,
): boolean => {
  if (!templateId || !context.capabilitySnapshot) {
    return true;
  }

  return context.capabilitySnapshot.visibleSkills.some((skill) => {
    return Boolean(
      skill.carboneTemplateId === templateId
      || skill.templateId === templateId
      || skill.executionFlowTemplateIds?.includes(templateId),
    );
  });
};

@Injectable()
@Tool({
  name: 'document_param_recover',
  description: '从会话历史或上下文中恢复已填写的文档参数，防止重复询问。',
  parameters: {
    type: 'object',
    properties: {
      skillId: {
        type: 'string',
        description: '技能ID；未传时可从上下文中继承',
        required: false,
      },
      userInput: {
        type: 'string',
        description: '用户补充的自然语言输入；未传时可回退到上下文中的 originalUserInput',
        required: false,
      },
      errorMessage: {
        type: 'string',
        description: '上一步渲染失败的错误信息',
        required: false,
      },
      currentParams: {
        type: 'object',
        description: '当前已收集的参数快照',
        required: false,
      },
    },
    required: [],
  },
  isDefault: true,
})
export class DocumentParamRecoverTool extends BaseTool {
  constructor() {
    super(
      'document_param_recover',
      '从会话历史或上下文中恢复已填写的文档参数，防止重复询问。',
      {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: '技能ID；未传时可从上下文中继承',
            required: false,
          },
          userInput: {
            type: 'string',
            description: '用户补充的自然语言输入；未传时可回退到上下文中的 originalUserInput',
            required: false,
          },
          errorMessage: {
            type: 'string',
            description: '上一步渲染失败的错误信息',
            required: false,
          },
          currentParams: {
            type: 'object',
            description: '当前已收集的参数快照',
            required: false,
          },
        },
        required: [],
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
        code: 'missing_document_binding',
        severity: 'error',
        data: {
          error: 'missing_document_binding',
          hasTemplateId: Boolean(lockedTemplateId),
          hasCarboneSkillId: Boolean(carboneSkillId),
        },
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: lockedTemplateId,
          selectedSkillId: context.skill?.skillId,
        },
      };
    }

    if (!userInput.trim()) {
      return {
        success: false,
        output: '无法执行参数修复：缺少用户原始需求描述。',
        code: 'missing_user_input',
        severity: 'warning',
        data: { error: 'missing_user_input' },
        requiresUserInput: true,
        userInputPrompt: '请补充完整文档需求描述，我将仅修复参数并继续渲染。',
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: lockedTemplateId,
          selectedSkillId: context.skill?.skillId,
        },
      };
    }

    if (!isTemplateVisibleInSnapshot(lockedTemplateId, context)) {
      return {
        success: false,
        output: `当前权限下不可修复模板 ${lockedTemplateId} 的参数。`,
        code: 'template_not_visible_in_capability_snapshot',
        severity: 'error',
        data: {
          error: 'template_not_visible_in_capability_snapshot',
          templateId: lockedTemplateId,
        },
        meta: {
          toolName: this.name,
          capabilityChecked: true,
          selectedTemplateId: lockedTemplateId,
          selectedSkillId: context.skill?.skillId,
        },
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
        `${getCarboneServiceUrl()}/studio/generate-parameters`,
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
          code: 'param_recover_failed',
          severity: 'warning',
          data: { error: 'param_recover_failed' },
          requiresUserInput: true,
          userInputPrompt: '参数自动修复失败，请手动补充或修正关键参数后再试。',
          meta: {
            toolName: this.name,
            capabilityChecked: Boolean(context.capabilitySnapshot),
            selectedTemplateId: lockedTemplateId,
            selectedSkillId: context.skill?.skillId,
          },
        };
      }

      context.collectedParams = repairedParams;

      return {
        success: true,
        output: `参数修复完成，将使用原模板 ${lockedTemplateId} 重新渲染。`,
        code: 'document_param_recover_completed',
        severity: 'info',
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
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: lockedTemplateId,
          selectedSkillId: context.skill?.skillId,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return {
        success: false,
        output: `参数修复服务调用失败：${message}`,
        code: 'service_error',
        severity: 'error',
        data: {
          error: 'service_error',
          message,
        },
        requiresUserInput: true,
        userInputPrompt: '参数修复失败，是否需要我引导你手动补充参数后重试？',
        meta: {
          toolName: this.name,
          capabilityChecked: Boolean(context.capabilitySnapshot),
          selectedTemplateId: lockedTemplateId,
          selectedSkillId: context.skill?.skillId,
        },
      };
    }
  }
}
