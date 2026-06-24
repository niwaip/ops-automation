/**
 * User Ask Tool
 * 向用户追问缺失信息或确认参数
 */

import { Injectable } from '@nestjs/common';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';

@Injectable()
@Tool({
  name: 'user_ask',
  description: '当需要向用户询问缺失信息或澄清需求时使用。会暂停执行并等待用户回复。',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: '要向用户询问的问题',
        required: true,
      },
      parameterName: {
        type: 'string',
        description: '正在询问的参数名称（可选）',
        required: false,
      },
    },
    required: ['question'],
  },
  category: 'discovery',
  isDefault: true,
})
export class UserAskTool extends BaseTool {
  constructor() {
    super(
      'user_ask',
      '当需要向用户询问缺失信息或澄清需求时使用。会暂停执行并等待用户回复。',
      {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '要向用户询问的问题',
            required: true,
          },
          parameterName: {
            type: 'string',
            description: '正在询问的参数名称（可选）',
            required: false,
          },
        },
        required: ['question'],
      },
      { category: 'discovery' }
    );
  }

  async execute(params: Record<string, unknown>, _context: ExecutionContext): Promise<ToolResult> {
    const question = params.question as string;
    const questionType = (params.questionType as string) || 'input';
    const options = (params.options as string[]) || [];
    const paramsToConfirm = (params.paramsToConfirm as Record<string, unknown>) || {};

    // 构建问询结果
    const askData = {
      question,
      questionType,
      options,
      paramsToConfirm,
      timestamp: new Date().toISOString(),
    };

    // 根据问题类型构建不同的输出
    let output = question;

    if (questionType === 'confirm' && Object.keys(paramsToConfirm).length > 0) {
      output = `${question}\n\n请确认以下参数:\n`;
      for (const [key, value] of Object.entries(paramsToConfirm)) {
        output += `- ${key}: ${value}\n`;
      }
    } else if (questionType === 'select' && options.length > 0) {
      output = `${question}\n选项:\n`;
      options.forEach((opt, idx) => {
        output += `${idx + 1}. ${opt}\n`;
      });
    }

    return {
      success: false, // 需要用户输入才算成功
      output,
      data: askData,
      requiresUserInput: true,
      userInputPrompt: output,
    };
  }
}
