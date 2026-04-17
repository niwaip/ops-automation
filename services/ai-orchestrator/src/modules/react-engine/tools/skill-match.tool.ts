/**
 * Skill Match Tool
 * 根据用户输入匹配合适的Skill
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, SkillMatchResult } from '../interfaces';

// Auth服务地址（SkillService所在）
// Docker环境使用服务名，本地使用localhost
const getAuthServiceUrl = () => {
  if (process.env.AUTH_SERVICE_URL) {
    return process.env.AUTH_SERVICE_URL;
  }
  // Docker环境下使用服务名
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-auth:3001';
  }
  return 'http://localhost:3001';
};
const AUTH_SERVICE_URL = getAuthServiceUrl();

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

    // 检查是否已有匹配的skill
    if (context.skill) {
      return {
        success: true,
        output: `已匹配技能: ${context.skill.skillName}`,
        data: { skill: context.skill },
      };
    }

    try {
      // 调用Auth服务的Skill匹配API
      const response = await axios.post(`${AUTH_SERVICE_URL}/skills/match`, {
        userInput,
      });

      const matchResult = response.data.match as SkillMatchResult | null;

      if (matchResult && matchResult.confidence > 0) {
        // 更新context中的skill信息
        context.skill = matchResult;

        // 构建输出信息
        let outputMsg = `成功匹配技能: ${matchResult.skillName} (置信度: ${matchResult.confidence.toFixed(2)}, 关键词: ${matchResult.matchedKeywords.join(', ')})`;

        // 如果有Carbone配置，提示下一步
        if (matchResult.carboneSkillId) {
          outputMsg += `\n此技能已配置Carbone AI参数生成，下一步请调用 generate_parameters 工具。
Carbone Skill ID: ${matchResult.carboneSkillId}
Carbone Template ID: ${matchResult.carboneTemplateId || '无'}
调用参数: {"skillId": "${matchResult.carboneSkillId}", "description": "${userInput}"}`;
        }

        return {
          success: true,
          output: outputMsg,
          data: {
            skill: matchResult,
            needsSkillMatch: false,
            useCarbone: !!matchResult.carboneSkillId,
          },
        };
      }

      return {
        success: false,
        output: '未匹配到合适的技能，请提供更多信息或直接提问。',
        data: { needsSkillMatch: true, userInput },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      // 如果API调用失败，返回错误信息
      return {
        success: false,
        output: `技能匹配服务调用失败: ${errorMsg}`,
        data: { error: 'service_error', needsSkillMatch: true, userInput },
      };
    }
  }
}