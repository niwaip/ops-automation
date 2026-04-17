/**
 * Generate Parameters Tool
 * 使用Carbone引擎的AI技能生成参数数据
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';

// Carbone引擎服务地址
const CARBONE_SERVICE_URL = process.env.CARBONE_SERVICE_URL || 'http://carbone-engine:3009';

export class GenerateParametersTool extends BaseTool {
  constructor() {
    super(
      'generate_parameters',
      '使用AI技能从用户输入中生成模板参数数据。调用Carbone引擎的generate-parameters API。',
      {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: 'Carbone引擎中的Skill ID',
            required: true,
          },
          userInput: {
            type: 'string',
            description: '用户的原始输入文本',
            required: true,
          },
          templateId: {
            type: 'string',
            description: '模板ID（可选）',
            required: false,
          },
        },
        required: ['skillId', 'userInput'],
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const skillId = params.skillId as string;
    const userInput = params.userInput as string;
    const templateId = params.templateId as string | undefined;

    try {
      // 调用Carbone引擎的generate-parameters API
      const response = await axios.post(`${CARBONE_SERVICE_URL}/studio/generate-parameters`, {
        skillId,
        userInput,
        templateId,
      });

      const generatedData = response.data;

      if (generatedData && generatedData.data) {
        // 更新context中的参数
        context.collectedParams = generatedData.data;

        return {
          success: true,
          output: `参数生成成功，提取了 ${Object.keys(generatedData.data).length} 个参数`,
          data: {
            params: generatedData.data,
            skillId,
            templateId: generatedData.templateId,
          },
        };
      }

      return {
        success: false,
        output: '参数生成失败，未能提取有效参数',
        data: { error: 'no_data_generated' },
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