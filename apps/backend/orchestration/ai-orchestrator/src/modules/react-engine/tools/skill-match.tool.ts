/**
 * Skill Match Tool
 * 根据用户输入匹配合适的Skill（支持AI语义匹配和权限管控）
 */

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../../config/service-endpoints';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext, SkillMatchResult } from '../interfaces';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { Tool } from '../decorators/tool.decorator';
const AUTH_SERVICE_URL = getAuthServiceUrl();

@Injectable()
@Tool({
  name: 'skill_match',
  description: '根据用户输入匹配合适的技能(Skill)。使用AI语义匹配，自动过滤用户无权限的技能。返回匹配的skillId、置信度和匹配原因。',
  parameters: {
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
  category: 'discovery',
  isDefault: true,
})
export class SkillMatchTool extends BaseTool {
  constructor() {
    super(
      'skill_match',
      '根据用户输入匹配合适的技能(Skill)。使用AI语义匹配，自动过滤用户无权限的技能。返回匹配的skillId、置信度和匹配原因。',
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
      { category: 'discovery' },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const userInput = params.userInput as string;
    const userId = context.userId;

    // 检查是否已有匹配的skill
    if (context.skill) {
      return {
        success: true,
        output: `已匹配技能: ${context.skill.skillName}`,
        data: { skill: context.skill },
      };
    }

    // 必须有 userId 才能进行匹配（权限管控）
    if (!userId) {
      return {
        success: false,
        output: '无法进行技能匹配：缺少用户身份信息。请确保已登录。',
        data: { error: 'no_user_id', needsSkillMatch: true, userInput },
      };
    }

    try {
      // 调用Auth服务的Skill匹配API（带userId，进行权限过滤和AI语义匹配）
      const response = await axios.post<{ match: SkillMatchResult | null }>(`${AUTH_SERVICE_URL}/skills/match`, {
        userInput,
        userId,  // 新增：传递用户ID进行权限过滤
      }, {
        headers: {
          ...(context.traceId ? { [TRACE_ID_HEADER]: context.traceId } : {}),
          ...(context.authToken ? { Authorization: context.authToken } : {}),
        },
      });

      const matchResult = response.data.match;

      if (!matchResult || matchResult.confidence <= 0) {
        return {
          success: false,
          output: `未能匹配到合适的技能。请尝试更清晰地描述您的需求。`,
          data: { error: 'no_match_found', userInput },
        };
      }

      const flowTemplateId = matchResult.executionFlowTemplateId
        || matchResult.executionFlowTemplateIds?.[0];

      // 文档技能统一收敛为最终渲染步骤，参数识别与补参由主链路负责
      if (matchResult.carboneSkillId) {
        matchResult.executionFlow = ['document_render'];
      }

      // 更新context中的skill信息
      context.skill = matchResult;
      context.currentFlowStep = 0; // 重置流程步骤

      // 构建输出信息（支持AI匹配原因）
      let outputMsg = `成功匹配技能: ${matchResult.skillName} (置信度: ${matchResult.confidence.toFixed(2)})`;

      // AI语义匹配时显示匹配原因
      if (matchResult.matchReason) {
        outputMsg += `\n匹配原因: ${matchResult.matchReason}`;
      } else if (matchResult.matchedKeywords && matchResult.matchedKeywords.length > 0) {
        outputMsg += `\n匹配关键词: ${matchResult.matchedKeywords.join(', ')}`;
      }

      // 构建结果和下一步信息
      const result: ToolResult = {
        success: true,
        output: outputMsg,
        data: {
          skill: matchResult,
          needsSkillMatch: false,
        },
      };

      // 如果有流程模板，需要执行流程模板步骤
      if (flowTemplateId) {
        outputMsg += `\n此技能已关联执行流程模板，将按模板步骤执行。`;
        // 设置下一步为执行流程模板
        result.nextAction = 'flow_execute';
        result.nextActionParams = {
          templateId: flowTemplateId,
          stepIndex: 0,
          params: matchResult.collectedParams || {},
        };
        result.data!.hasFlowTemplate = true;
        result.data!.flowTemplateId = flowTemplateId;
      }
      return result;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      // 如果API调用失败（可能是403权限错误）
      const statusCode = typeof error === 'object' && error && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
      if (statusCode === 403) {
        return {
          success: false,
          output: '您没有权限使用技能匹配功能，请联系管理员。',
          data: { error: 'permission_denied', needsSkillMatch: true, userInput },
        };
      }
      return {
        success: false,
        output: `技能匹配服务调用失败: ${errorMsg}`,
        data: { error: 'service_error', needsSkillMatch: true, userInput },
      };
    }
  }
}
