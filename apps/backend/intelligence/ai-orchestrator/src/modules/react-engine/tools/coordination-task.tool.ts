/**
 * Coordination Task Tool
 * 支持 AI 对话识别并自动发起多人协同任务 / 审批承认流
 */

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';
import { getAuthServiceUrl } from '../../../config/service-endpoints';

@Injectable()
@Tool({
  name: 'coordination_task',
  description:
    '发起多人协同或审批承认任务。当用户希望在业务流程中给某人布置作业、或者向主管/同事申请承认或审批时使用。系统会自动查找组织成员并将任务直接打入对方的 GTD 收集箱。',
  parameters: {
    type: 'object',
    properties: {
      assigneeName: {
        type: 'string',
        description: '被指派人姓名、工号或用户名（例如：张三、王经理、alice）',
        required: true,
      },
      taskType: {
        type: 'string',
        description: '任务类型：approval(审批承认) | assignment(作业布置) | review(查阅复核)',
        required: false,
      },
      title: {
        type: 'string',
        description: '任务标题',
        required: true,
      },
      content: {
        type: 'string',
        description: '具体任务要求、审核内容或交付说明',
        required: true,
      },
      priority: {
        type: 'string',
        description: '优先级：low | medium | high | urgent，默认为 medium',
        required: false,
      },
      dueDate: {
        type: 'string',
        description: '截止时间（ISO时间字符串或具体时间文本）',
        required: false,
      },
    },
    required: ['assigneeName', 'title', 'content'],
  },
  isDefault: true,
})
export class CoordinationTaskTool extends BaseTool {
  constructor() {
    super(
      'coordination_task',
      '发起多人协同或审批承认任务。当用户希望在业务流程中给某人布置作业、或者向主管/同事申请承认或审批时使用。系统会自动查找组织成员并将任务直接打入对方的 GTD 收集箱。',
      {
        type: 'object',
        properties: {
          assigneeName: {
            type: 'string',
            description: '被指派人姓名、工号或用户名（例如：张三、王经理、alice）',
            required: true,
          },
          taskType: {
            type: 'string',
            description: '任务类型：approval(审批承认) | assignment(作业布置) | review(查阅复核)',
            required: false,
          },
          title: {
            type: 'string',
            description: '任务标题',
            required: true,
          },
          content: {
            type: 'string',
            description: '具体任务要求、审核内容或交付说明',
            required: true,
          },
          priority: {
            type: 'string',
            description: '优先级：low | medium | high | urgent，默认为 medium',
            required: false,
          },
          dueDate: {
            type: 'string',
            description: '截止时间（ISO时间字符串或具体时间文本）',
            required: false,
          },
        },
        required: ['assigneeName', 'title', 'content'],
      }
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const assigneeName = String(params.assigneeName || '').trim();
    const title = String(params.title || '').trim();
    const content = String(params.content || '').trim();
    const taskType = (params.taskType as string) || 'approval';
    const priority = (params.priority as string) || 'medium';
    const dueDate = params.dueDate ? String(params.dueDate) : undefined;

    if (!assigneeName || !title || !content) {
      return {
        success: false,
        output: '缺少必要参数：assigneeName、title 和 content 必须提供。',
        severity: 'error',
      };
    }

    const platformBaseUrl = getAuthServiceUrl();
    const headers: Record<string, string> = {};
    if (context.userId) {
      headers['x-user-id'] = context.userId;
    }

    try {
      // 1. 查找匹配的协同成员
      const searchRes = await axios.get(
        `${platformBaseUrl}/api/workbench-coordination/collaborators`,
        {
          params: { keyword: assigneeName },
          headers,
          timeout: 5000,
        }
      );

      const candidates = Array.isArray(searchRes.data) ? searchRes.data : [];
      if (candidates.length === 0) {
        return {
          success: false,
          output: `在组织架构中未找到名为 "${assigneeName}" 的成员，请核对姓名或让用户明确人员。`,
          severity: 'warning',
        };
      }

      const targetUser = candidates[0];

      // 2. 发起协同任务
      const createRes = await axios.post(
        `${platformBaseUrl}/api/workbench-coordination/tasks`,
        {
          assigneeId: targetUser.id,
          assigneeName: targetUser.username,
          taskType,
          title,
          content,
          priority,
          dueDate,
          metadata: {
            fromAiConversation: true,
            sessionId: context.sessionId,
          },
        },
        {
          headers,
          timeout: 5000,
        }
      );

      const task = (createRes.data || {}) as Record<string, any>;
      const typeLabel =
        taskType === 'approval'
          ? '审批承认'
          : taskType === 'assignment'
          ? '作业布置'
          : '查阅复核';
      const outputMsg = `已成功为 @${targetUser.username} 发起【${typeLabel}】任务「${task.title || title}」，该事项已直接同步至其 GTD 收集箱。`;

      return {
        success: true,
        output: outputMsg,
        data: {
          taskId: task.taskId,
          title: task.title || title,
          taskType: typeLabel,
          assignee: targetUser.username,
          status: 'pending',
          message: outputMsg,
        },
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to create coordination task via AI tool: ${err.message}`,
        err.stack
      );
      return {
        success: false,
        output: `协同任务发起失败：${err.response?.data?.message || err.message}`,
        severity: 'error',
      };
    }
  }
}
