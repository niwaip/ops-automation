/**
 * Skill Match Tool
 * 根据用户输入匹配合适的Skill
 */

import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, SkillMatchResult } from '../interfaces';

export class SkillMatchTool extends BaseTool {
  constructor() {
    super(
      'skill_match',
      '根据用户输入匹配合适的技能(Skill)。返回匹配的skillId、置信度和已识别的参数。',
      {
        type: 'object',
        properties: {
          userInput: {
            type: 'string',
            description: '用户的输入文本',
            required: true,
          },
          context: {
            type: 'string',
            description: '额外的上下文信息（可选）',
            required: false,
          },
        },
        required: ['userInput'],
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const userInput = params.userInput as string;

    // 这里需要调用SkillService进行匹配
    // 暂时返回模拟结果，后续集成SkillService
    const result: SkillMatchResult = {
      skillId: 'pending',
      skillName: 'pending',
      matchedKeywords: [],
      confidence: 0,
      collectedParams: {},
      missingParams: [],
      paramsSchema: { properties: {}, required: [] },
    };

    // 检查是否已有匹配的skill
    if (context.skill) {
      return {
        success: true,
        output: `已匹配技能: ${context.skill.skillName}`,
        data: { skill: context.skill },
      };
    }

    return {
      success: false,
      output: '未匹配到合适的技能，请提供更多信息或直接提问。',
      data: { needsSkillMatch: true, userInput },
    };
  }
}