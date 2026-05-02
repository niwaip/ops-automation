/**
 * Param Collect Tool
 * 收集和验证Skill所需的参数
 */

import { Injectable } from '@nestjs/common';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, ParamProperty } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';

@Injectable()
@Tool({
  name: 'param_collect',
  description: '收集并验证技能执行所需的参数。检查参数是否完整，提取缺失参数列表。',
  parameters: {
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
  isDefault: true,
})
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
    // skillId is kept for API compatibility but not used directly
    const _skillId = params.skillId as string;
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
      let missingParams = schema.required.filter(
        (key) => collectedParams[key] === undefined || collectedParams[key] === null,
      );

      // 兜底：用户补充轮次中，若仅缺一个字符串参数，且输入像“上海”这种直接答案，则自动填充
      if (missingParams.length === 1) {
        const fallbackKey = missingParams[0];
        if (fallbackKey) {
          const fallbackProp = schema.properties[fallbackKey];
          if (fallbackProp?.type === 'string' && this.isLikelySingleFieldAnswer(userInput)) {
            collectedParams[fallbackKey] = userInput.trim();
            missingParams = schema.required.filter(
              (key) => collectedParams[key] === undefined || collectedParams[key] === null,
            );
          }
        }
      }

      if (missingParams.length === 0) {
        return {
          success: true,
          output: `参数收集完成，共收集 ${Object.keys(collectedParams).length} 个参数。`,
          data: { params: collectedParams, allParamsReady: true },
        };
      } else {
        const prompts = missingParams.map((key) => {
          const prop = schema.properties[key];
          return `- ${prop?.description || key}`;
        });

        const output = `为了执行技能 "${context.skill.skillName}"，我还需要以下信息：\n${prompts.join('\n')}\n\n请补充这些参数。`;

        return {
          success: false,
          output,
          data: { params: collectedParams, missingParams, prompts },
          requiresUserInput: true,
          userInputPrompt: output,
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
    // 针对特定参数名进行匹配 - 改进的中文语境识别
    const paramPatterns: Record<string, RegExp[]> = {
      '甲方名称': [
        /和\s*([^，。,\n]+?)\s*签订/,  // "和X签订"
        /甲方[是为：:]*([^，。,\n]+)/,
        /与\s*([^，。,\n]+?)\s*签订/,  // "与X签订"
      ],
      '乙方名称': [
        /我是乙方[^，。,\n]*在[^，。,\n]*的\s*([^，。,\n]+)/,  // "我是乙方，在XX的恒生银行" -> 恒生银行
        /我是乙方[^，。,\n]*在\s*([^，。,\n]+)/,  // "我是乙方，在恒生银行" -> 恒生银行
        /乙方[是为：:]*([^，。,\n]+)/,
        /乙方\s*[:：]?\s*([^，。,\n]+)/,
      ],
      '签订日期': [
        /签订日[是为是：:]*([^，。,\n]+)/,
        /签订日期[是为是：:]*([^，。,\n]+)/,
        /日期[是为：:]*([^，。,\n]+)/,
      ],
      '保密期限': [
        /保密[期间期限][是为：:]*([^，。,\n]+)/,
        /保密期间\s*([^\s，。,\n]+)/,
        /期限\s*[:：]?\s*([^，。,\n]+)/,
      ],
      '保密范围': [
        /签订关于\s*([^，。,\n]+?)\s*的\s*保密/,  // "签订关于X的保密协议"
        /保密范围[是为：:]*([^，。,\n]+)/,
      ],
      '甲方地址': [
        /甲方[^，。,\n]*地址[是为：:]*([^，。,\n]+)/,
        /甲方[^，。,\n]*在\s*([^，。,\n]+)/,
      ],
      '乙方地址': [
        /乙方[^，。,\n]*地址[是为：:]*([^，。,\n]+)/,
        /乙方[^，。,\n]*在\s*([^，。,\n]+)/,
        /我是乙方[^，。,\n]*在\s*([^，。,\n]+)/,  // "我是乙方，在X" -> X是地址
      ],
      '用人单位名称': [
        /用人单位[是为：:]*([^，。,\n]+)/,
        /公司[名为：:]*([^，。,\n]+)/,
      ],
      '劳动者姓名': [
        /劳动者[姓名是为：:]*([^，。,\n]+)/,
        /员工[姓名是为：:]*([^，。,\n]+)/,
        /姓名[是为：:]*([^，。,\n]+)/,
      ],
      '项目名称': [
        /项目[名为：:]*([^，。,\n]+)/,
        /关于\s*([^，。,\n]+?)\s*的/,  // "关于X的"
      ],
    };

    const patterns = paramPatterns[paramName] || [];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  private isLikelySingleFieldAnswer(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) return false;
    if (normalized.length > 12) return false;

    // 排除明显“整句提问/指令”，避免把完整请求句误当成单字段答案
    const excludedKeywords = ['查询', '帮我', '请', '?', '？', '怎么', '如何'];
    if (excludedKeywords.some((keyword) => normalized.includes(keyword))) {
      return false;
    }

    return true;
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
