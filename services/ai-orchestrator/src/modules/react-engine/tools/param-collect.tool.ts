/**
 * Param Collect Tool
 * 收集和验证Skill所需的参数
 */

import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, SkillMatchResult, ParamProperty } from '../interfaces';

export class ParamCollectTool extends BaseTool {
  constructor() {
    super(
      'param_collect',
      '收集并验证技能执行所需的参数。检查参数是否完整，提取缺失参数列表。',
      {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            description: '技能ID',
            required: true,
          },
          userInput: {
            type: 'string',
            description: '用户输入，从中提取参数',
            required: true,
          },
          existingParams: {
            type: 'object',
            description: '已收集的参数',
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
    const existingParams = (params.existingParams as Record<string, unknown>) || {};

    // 合并已有参数
    const collectedParams = { ...existingParams };

    // 使用AI从用户输入中提取参数
    // 这里需要结合上下文中的skill信息
    if (context.skill && context.skill.paramsSchema) {
      const schema = context.skill.paramsSchema;

      // 遍历参数schema，尝试从输入中提取
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (collectedParams[key] !== undefined) continue;

        const extracted = await this.extractParam(userInput, key, prop);
        if (extracted !== null) {
          collectedParams[key] = extracted;
        }
      }

      // 更新缺失参数列表
      const missingParams = schema.required.filter(
        (key) => collectedParams[key] === undefined || collectedParams[key] === null,
      );

      const result: Partial<SkillMatchResult> = {
        skillId,
        collectedParams,
        missingParams,
      };

      if (missingParams.length === 0) {
        return {
          success: true,
          output: `参数收集完成，共收集 ${Object.keys(collectedParams).length} 个参数`,
          data: { params: collectedParams, allParamsReady: true },
        };
      } else {
        const prompts = missingParams.map((key) => {
          const prop = schema.properties[key];
          return `请提供${prop.description || key}`;
        });

        return {
          success: false,
          output: `参数不完整，缺少: ${missingParams.join(', ')}`,
          data: { params: collectedParams, missingParams, prompts },
          requiresUserInput: true,
          userInputPrompt: prompts.join('\n'),
        };
      }
    }

    return {
      success: false,
      output: '未找到Skill配置，无法收集参数',
      data: { error: 'skill_not_found' },
    };
  }

  /**
   * 从文本中提取特定参数
   */
  private async extractParam(
    text: string,
    paramName: string,
    prop: ParamProperty,
  ): Promise<unknown | null> {
    // 简单的模式匹配，后续可以增强为AI提取
    const patterns: Record<string, RegExp[]> = {
      date: [
        /\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?/,
        /\d{4}-\d{2}-\d{2}/,
      ],
      number: [/[\d,]+\.?\d*/],
      amount: [/[\d,]+\.?\d*元/, /[\d,]+\.?\d*万/, /[\d,]+\.?\d*美元/],
    };

    const typePatterns = patterns[prop.type] || [];

    for (const pattern of typePatterns) {
      const match = text.match(pattern);
      if (match) {
        return this.formatValue(match[0], prop.type);
      }
    }

    // 对于string类型，尝试关键词匹配
    if (prop.type === 'string' && prop.extractionPrompt) {
      // 使用提示词进行智能提取（这里简化处理）
      const keywords = this.extractKeywords(text, paramName);
      if (keywords) {
        return keywords;
      }
    }

    return null;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string, paramName: string): string | null {
    // 针对特定参数名进行匹配
    const paramPatterns: Record<string, RegExp> = {
      甲方: /甲方[是为：:]*([^，。,\n]+)/,
      乙方: /乙方[是为：:]*([^，。,\n]+)/,
      公司名称: /公司[名为：:]*([^，。,\n]+)/,
      项目名称: /项目[名为：:]*([^，。,\n]+)/,
    };

    const pattern = paramPatterns[paramName];
    if (pattern) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * 格式化提取的值
   */
  private formatValue(value: string, type: string): unknown {
    switch (type) {
      case 'date':
        return value.replace(/[年月日]/g, '-').replace(/[^\d-]/g, '');
      case 'number':
        return parseFloat(value.replace(/,/g, ''));
      case 'amount':
        const num = parseFloat(value.replace(/[,元万美元]/g, ''));
        if (value.includes('万')) return num * 10000;
        if (value.includes('美元')) return { value: num, currency: 'USD' };
        return { value: num, currency: 'CNY' };
      default:
        return value;
    }
  }
}