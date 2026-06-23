/**
 * Param Collect Tool
 * 收集和验证Skill所需的参数
 */

import { Injectable } from '@nestjs/common';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, ParamProperty, ParamsSchema } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';
import { ModelService } from '../../model/model.service';

@Injectable()
@Tool({
  name: 'param_collect',
  description:
    '收集并验证技能执行所需的参数。检查参数是否完整，提取缺失参数列表。支持双语参数(_cn/_jp)自动对齐与批量翻译。',
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
  constructor(private readonly modelService: ModelService) {
    super(
      'param_collect',
      '收集并验证技能执行所需的参数。检查参数是否完整，提取缺失参数列表。支持双语参数(_cn/_jp)自动对齐与批量翻译。',
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
      }
    );
  }

  async execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult> {
    const userInput = params.userInput as string;
    const existingParams = (params.existingParams as Record<string, unknown>) || {};
    const collectedParams = { ...existingParams };

    if (!context.skill || !context.skill.paramsSchema) {
      return {
        success: false,
        output: '未找到Skill配置，无法收集参数',
        data: { error: 'skill_not_found' },
      };
    }

    const schema = context.skill.paramsSchema;
    const bilingualPairs = this.identifyBilingualPairs(schema);
    const isBilingualMode = bilingualPairs.length > 0;

    // 1. 使用 AI 语义提取
    this.logger.debug(`Using AI to extract params from: "${userInput}"`);
    const aiExtracted = await this.aiExtractParams(userInput, schema);
    for (const [key, value] of Object.entries(aiExtracted)) {
      if (value !== undefined && value !== null && collectedParams[key] === undefined) {
        collectedParams[key] = value;
      }
    }

    // 2. 正则提取兜底
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (collectedParams[key] !== undefined) continue;
      const extracted = await this.extractParam(userInput, key, prop);
      if (extracted !== null) {
        collectedParams[key] = extracted;
      }
    }

    // 3. 计算缺失参数 (逻辑层面)
    let missingParams = schema.required.filter(
      (key) => collectedParams[key] === undefined || collectedParams[key] === null
    );

    // 4. 双语对齐逻辑
    if (isBilingualMode) {
      missingParams = missingParams.filter((key) => {
        const pair = bilingualPairs.find((p) => p.cn === key || p.jp === key);
        if (pair) {
          return collectedParams[pair.cn] === undefined && collectedParams[pair.jp] === undefined;
        }
        return true;
      });
    }

    // 5. 兜底处理：单字段回答
    if (missingParams.length === 1) {
      const fallbackKey = missingParams[0];
      if (fallbackKey) {
        const fallbackProp = schema.properties[fallbackKey];
        if (fallbackProp?.type === 'string' && this.isLikelySingleFieldAnswer(userInput)) {
          collectedParams[fallbackKey] = userInput.trim();
          missingParams = [];
        }
      }
    }

    // 6. 最终判定
    if (missingParams.length === 0) {
      if (isBilingualMode) {
        await this.syncAndTranslateBilingualParams(collectedParams, bilingualPairs, schema);
      }
      return {
        success: true,
        output: `参数收集完成，共收集 ${Object.keys(collectedParams).length} 个参数。`,
        data: { params: collectedParams, allParamsReady: true },
      };
    } else {
      const prompts = this.generateDeDupedPrompts(missingParams, bilingualPairs, schema);
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

  private async aiExtractParams(
    text: string,
    schema: ParamsSchema
  ): Promise<Record<string, unknown>> {
    const prompt = `你是一个精准的参数提取助手。请从用户的输入中提取文档所需的参数。
用户输入：
"${text}"
参数定义 (JSON Schema):
${JSON.stringify(schema, null, 2)}
要求：
1. 仅提取明确提到的信息，不要猜测。
2. 返回一个干净的 JSON 对象，Key 必须与参数定义一致。
3. 如果是日期，请转换为 YYYY-MM-DD 格式。
4. 如果是双语参数对（如 _cn 和 _jp 结尾），优先将提取到的内容填入其对应的语言字段中。
5. 不要返回任何解释或 Markdown 代码块标签。
直接返回 JSON：`;

    try {
      const response = await this.modelService.callModel('default', prompt, 'auxiliary');
      const cleanContent = response.content.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanContent);
    } catch (e) {
      this.logger.warn(
        `AI Parameter extraction failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return {};
    }
  }

  private identifyBilingualPairs(
    schema: ParamsSchema
  ): Array<{ base: string; cn: string; jp: string }> {
    const pairs: Array<{ base: string; cn: string; jp: string }> = [];
    const keys = Object.keys(schema.properties);
    keys.forEach((key) => {
      if (key.endsWith('_cn')) {
        const base = key.slice(0, -3);
        const jpKey = `${base}_jp`;
        if (keys.includes(jpKey)) {
          pairs.push({ base, cn: key, jp: jpKey });
        }
      }
    });
    return pairs;
  }

  private generateDeDupedPrompts(
    missingParams: string[],
    pairs: Array<{ base: string; cn: string; jp: string }>,
    schema: ParamsSchema
  ): string[] {
    const processedBases = new Set<string>();
    const prompts: string[] = [];
    missingParams.forEach((key) => {
      const pair = pairs.find((p) => p.cn === key || p.jp === key);
      if (pair) {
        if (processedBases.has(pair.base)) return;
        processedBases.add(pair.base);
        const prop = schema.properties[pair.cn] || schema.properties[pair.jp];
        const desc = prop?.description || pair.base;
        const cleanDesc = desc.replace(/（中文）|\(中文\)|（日文）|\(日文\)|_cn|_jp/g, '').trim();
        prompts.push(`- ${cleanDesc}`);
      } else {
        const prop = schema.properties[key];
        prompts.push(`- ${prop?.description || key}`);
      }
    });
    return prompts;
  }

  private async syncAndTranslateBilingualParams(
    params: Record<string, unknown>,
    pairs: Array<{ base: string; cn: string; jp: string }>,
    schema: ParamsSchema
  ): Promise<void> {
    const translateBatch: Record<string, string> = {};
    const jpToCnBatch: Record<string, string> = {};
    for (const pair of pairs) {
      const cnValue = params[pair.cn];
      const jpValue = params[pair.jp];
      const prop = schema.properties[pair.cn];
      if (cnValue !== undefined && jpValue === undefined) {
        if (prop && (prop.type === 'number' || prop.type === 'date' || prop.type === 'boolean')) {
          params[pair.jp] = cnValue;
        } else if (typeof cnValue === 'string' && cnValue.trim()) {
          translateBatch[pair.jp] = cnValue;
        }
      } else if (jpValue !== undefined && cnValue === undefined) {
        if (prop && (prop.type === 'number' || prop.type === 'date' || prop.type === 'boolean')) {
          params[pair.cn] = jpValue;
        } else if (typeof jpValue === 'string' && jpValue.trim()) {
          jpToCnBatch[pair.cn] = jpValue;
        }
      }
    }
    if (Object.keys(translateBatch).length > 0) {
      const results = await this.batchTranslate(translateBatch, 'zh', 'ja');
      Object.assign(params, results);
    }
    if (Object.keys(jpToCnBatch).length > 0) {
      const results = await this.batchTranslate(jpToCnBatch, 'ja', 'zh');
      Object.assign(params, results);
    }
  }

  private async batchTranslate(
    data: Record<string, string>,
    sourceLang: string,
    targetLang: string
  ): Promise<Record<string, string>> {
    const sourceName = sourceLang === 'zh' ? '中文' : '日语';
    const targetName = targetLang === 'ja' ? '日语' : '中文';
    const prompt = `你是一个专业的合同翻译助手。请将以下 JSON 对象中的值从${sourceName}翻译成${targetName}。
要求：
1. 保持 JSON 结构不变，只翻译值。
2. 翻译应准确、专业，符合法律/商务合同语境。
3. 直接返回翻译后的 JSON 对象，不要包含任何解释或代码块标签。
待翻译内容：
${JSON.stringify(data, null, 2)}`;
    try {
      const response = await this.modelService.callModel('default', prompt, 'auxiliary');
      const cleanContent = response.content.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanContent);
    } catch (error) {
      this.logger.error(
        `Batch translation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      const fallback: Record<string, string> = {};
      Object.entries(data).forEach(([key, value]) => {
        fallback[key] = value;
      });
      return fallback;
    }
  }

  private async extractParam(
    text: string,
    paramName: string,
    prop: ParamProperty
  ): Promise<unknown | null> {
    const patterns: Record<string, RegExp[]> = {
      date: [/\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}[日]?/, /\d{4}-\d{2}-\d{2}/],
      number: [/[\d,]+\.?\d*/],
      amount: [/[\d,]+\.?\d*元/, /[\d,]+\.?\d*万/, /[\d,]+\.?\d*美元/],
    };
    const typePatterns = patterns[prop.type] || [];
    for (const pattern of typePatterns) {
      const match = text.match(pattern);
      if (match) return this.formatValue(match[0], prop.type);
    }
    return null;
  }

  private isLikelySingleFieldAnswer(text: string): boolean {
    const normalized = text.trim();
    if (!normalized || normalized.length > 12) return false;
    const excludedKeywords = ['查询', '帮我', '请', '?', '？', '怎么', '如何'];
    return !excludedKeywords.some((keyword) => normalized.includes(keyword));
  }

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
