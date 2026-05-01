import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';
import { ToolExecutor } from '../tool-executor';

@Injectable()
@Tool({
  name: 'script_execute',
  description: '执行多步串行操作。允许在一轮对话中连续调用多个工具，并将前置步骤的输出结果传递给后续步骤。',
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: '按顺序执行的步骤列表',
        items: {
          type: 'object',
          properties: {
            toolName: {
              type: 'string',
              description: '要调用的工具名称',
            },
            params: {
              type: 'object',
              description: '传递给工具的参数。可以使用 {{stepN.output}} 引用第 N 步的输出（N从0开始）。',
            },
            comment: {
              type: 'string',
              description: '步骤说明',
            },
          },
          required: ['toolName', 'params'],
        },
      },
    },
    required: ['steps'],
  },
  category: 'flow',
  isDefault: true,
})
export class ScriptTool extends BaseTool {
  constructor(
    @Inject(forwardRef(() => ToolExecutor))
    private readonly toolExecutor: ToolExecutor,
  ) {
    super(
      'script_execute',
      '执行多步串行操作。允许在一轮对话中连续调用多个工具，并将前置步骤的输出结果传递给后续步骤。',
      {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: '按顺序执行的步骤列表',
            items: {
              type: 'object',
              properties: {
                toolName: { type: 'string', description: '工具名称' },
                params: { type: 'object', description: '参数' },
              },
              required: ['toolName', 'params'],
            },
          },
        },
        required: ['steps'],
      },
      { category: 'flow' },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const steps = params.steps as Array<{ toolName: string; params: Record<string, unknown> }>;
    if (!steps || steps.length === 0) {
      return { success: false, output: '未提供步骤' };
    }

    const results: any[] = [];
    let combinedOutput = '';

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      
      // 变量替换：将 {{stepN.output}} 替换为之前的输出
      const resolvedParams = this.resolveVariables(step.params, results);

      this.logger.log(`Executing step ${i}: ${step.toolName}`);
      const tool = this.toolExecutor.getTool(step.toolName);
      if (!tool) {
        return {
          success: false,
          output: `步骤 ${i} 失败：找不到工具 ${step.toolName}`,
          data: { failedStep: i, toolName: step.toolName },
        };
      }

      const result = await tool.execute(resolvedParams, context);
      results.push(result);
      combinedOutput += `--- Step ${i} (${step.toolName}) ---\n${result.output}\n\n`;

      if (!result.success) {
        return {
          success: false,
          output: `脚本在第 ${i} 步中断：${result.output}`,
          data: { failedStep: i, results, combinedOutput },
        };
      }
    }

    return {
      success: true,
      output: combinedOutput,
      data: { steps: results.length, results },
    };
  }

  private resolveVariables(params: Record<string, unknown>, results: any[]): Record<string, unknown> {
    const jsonStr = JSON.stringify(params);
    const resolvedStr = jsonStr.replace(/\{\{step(\d+)\.output\}\}/g, (match, index) => {
      const idx = parseInt(index, 10);
      if (idx >= 0 && idx < results.length) {
        const result = results[idx];
        return typeof result.output === 'string' ? result.output : JSON.stringify(result.data || {});
      }
      return match;
    });
    
    // 也支持路径引用 {{step0.data.key}}
    const resolvedStrDeep = resolvedStr.replace(/\{\{step(\d+)\.data\.(.+?)\}\}/g, (match, index, path) => {
      const idx = parseInt(index, 10);
      if (idx >= 0 && idx < results.length) {
        const data = results[idx].data;
        if (data) {
          const value = path.split('.').reduce((obj: any, key: string) => obj?.[key], data);
          return value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : match;
        }
      }
      return match;
    });

    try {
      return JSON.parse(resolvedStrDeep);
    } catch (e: any) {
      this.logger.error(`Failed to parse resolved params: ${e.message}`);
      return params;
    }
  }
}
