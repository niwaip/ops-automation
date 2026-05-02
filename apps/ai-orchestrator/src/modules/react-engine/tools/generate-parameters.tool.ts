/**
 * Generate Parameters Tool
 * 使用Carbone引擎的AI技能生成参数数据
 */

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';

// Carbone引擎服务地址
const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';

@Injectable()
@Tool({
  name: 'generate_parameters',
  description: '使用AI技能从用户描述中生成模板参数数据。调用Carbone引擎的generate-parameters API，参数为skillId和description。',
  parameters: {
    type: 'object',
    properties: {
      skillId: {
        type: 'string',
        description: 'Carbone引擎中的Skill ID',
        required: true,
      },
      description: {
        type: 'string',
        description: '用户的描述内容，包含需要填充的参数信息',
        required: true,
      },
      userInput: {
        type: 'string',
        description: '用户原始输入（兼容参数，等同于description）',
        required: false,
      },
    },
    required: ['skillId'],
  },
  isDefault: true,
})
export class GenerateParametersTool extends BaseTool {
  constructor() {
    super(
      'generate_parameters',
      '使用AI技能从用户描述中生成模板参数数据。调用Carbone引擎的generate-parameters API，参数为skillId和description。',
      {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: 'Carbone引擎中的Skill ID',
            required: true,
          },
          description: {
            type: 'string',
            description: '用户的描述内容，包含需要填充的参数信息',
            required: true,
          },
          userInput: {
            type: 'string',
            description: '用户原始输入（兼容参数，等同于description）',
            required: false,
          },
        },
        required: ['skillId'],
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const skillId = params.skillId as string;
    // 优先使用description，兼容userInput参数
    const description = (params.description || params.userInput) as string;
    // 获取templateId：优先使用传入的，其次从context.skill获取
    let templateId = params.templateId as string | undefined;
    if (!templateId && context.skill?.carboneTemplateId) {
      templateId = context.skill.carboneTemplateId;
    }

    if (!description) {
      return {
        success: false,
        output: '缺少必要参数：需要提供description（用户描述）',
        data: { error: 'missing_description' },
      };
    }

    try {
      // 调用Carbone引擎的generate-parameters API（使用description参数）
      const response = await axios.post<{ success: boolean; generatedData: Record<string, unknown> }>(
        `${CARBONE_SERVICE_URL}/studio/generate-parameters`,
        {
          skillId,
          description, // Carbone API使用description参数名
        },
      );

      const result = response.data;

      // Carbone API返回格式: {success: true, generatedData: {...}}
      if (result && result.success && result.generatedData) {
        // 更新context中的参数
        context.collectedParams = result.generatedData;

        const extractedParams = result.generatedData;
        // 使用context.skill中的templateId
        const extractedTemplateId = templateId || context.skill?.carboneTemplateId;
        const paramCount = Object.keys(extractedParams).length;

        return {
          success: true,
          output: `参数生成成功！已从用户描述中提取 ${paramCount} 个参数：
${JSON.stringify(extractedParams, null, 2)}

模板ID: ${extractedTemplateId || '未指定'}

【参数验证成功】下一步调用 document_render 工具继续执行。`,
          data: {
            params: extractedParams,
            skillId,
            templateId: extractedTemplateId,
          },
          // 直接跳转到document_render生成文档
          nextAction: 'document_render',
          nextActionParams: {
            templateId: extractedTemplateId,
            data: extractedParams,
          },
        };
      }

      return {
        success: false,
        output: '参数生成失败，未能提取有效参数',
        data: { error: 'no_data_generated', response: result },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        output: `参数生成服务调用失败: ${errorMsg}`,
        data: { error: 'service_error', message: errorMsg },
      };
    }
  }
}