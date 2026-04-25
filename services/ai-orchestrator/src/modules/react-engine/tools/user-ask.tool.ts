/**
 * User Ask Tool
 * 向用户追问缺失信息或确认参数
 */

import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';

export class UserAskTool extends BaseTool {
  constructor() {
    super(
      'user_ask',
      '向用户提问以获取缺失信息或确认操作。' +
      '当参数收集不完整时，优先使用 param_collect；' +
      '当需要用户做二选一或多选一决策时，使用 select 类型；' +
      '当需要用户对即将执行的关键操作或已收集的参数做最终确认时，使用 confirm 类型；' +
      '如果是向用户报告错误，请直接在 Thought 中分析并作为 Final Answer 回复，或者使用 input 类型询问用户后续操作。',
      {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '向用户提出的问题',
            required: true,
          },
          questionType: {
            type: 'string',
            description: '问题类型：confirm(确认), input(输入), select(选择)',
            required: false,
          },
          options: {
            type: 'array',
            description: '如果是select类型，提供的选项列表',
            required: false,
          },
          paramsToConfirm: {
            type: 'object',
            description: '如果是confirm类型，展示给用户确认的参数',
            required: false,
          },
        },
        required: ['question'],
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<ToolResult> {
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