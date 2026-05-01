/**
 * Browser Step Tool
 * 执行标准化的浏览器步骤，支持人工接管流程
 */

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { Tool } from '../decorators/tool.decorator';

// Browser Worker service URL
const getBrowserWorkerUrl = () => {
  if (process.env.BROWSER_WORKER_URL) {
    return process.env.BROWSER_WORKER_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-browser-worker:3004';
  }
  return 'http://localhost:3004';
};

// Control Plane service URL
const getControlPlaneUrl = () => {
  if (process.env.CONTROL_PLANE_URL) {
    const url = process.env.CONTROL_PLANE_URL;
    return url.endsWith('/api') ? url : `${url}/api`;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-control-plane:3003/api';
  }
  return 'http://localhost:3003/api';
};

interface ExecuteStepDto {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  action: string;
  target?: string;
  args?: Record<string, unknown>;
  assertion?: {
    type: string;
    expected?: string;
  };
}

interface ExecuteStepResultDto {
  success: boolean;
  snapshotId?: string;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  shouldTakeover: boolean;
  takeoverReason?: string;
}

@Injectable()
@Tool({
  name: 'browser_step',
  description: '执行标准化的浏览器自动化步骤。支持页面跳转、点击、输入、滚动、截图等操作。',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '动作类型：goto, click, fill, scroll, screenshot, wait, extract',
        required: true,
      },
      target: {
        type: 'string',
        description: '动作目标：URL或CSS选择器',
        required: false,
      },
      args: {
        type: 'object',
        description: '动作参数（如输入内容）',
        required: false,
      },
      stepId: {
        type: 'string',
        description: '步骤ID（可选）',
        required: false,
      },
    },
    required: ['action'],
  },
  category: 'execution',
  isDefault: true,
})
export class BrowserStepTool extends BaseTool {
  constructor() {
    super(
      'browser_step',
      '执行标准化的浏览器自动化步骤。支持页面跳转、点击、输入、滚动、截图等操作。',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '动作类型：goto, click, fill, scroll, screenshot, wait, extract',
            required: true,
          },
          target: {
            type: 'string',
            description: '动作目标：URL或CSS选择器',
            required: false,
          },
          args: {
            type: 'object',
            description: '动作参数（如输入内容）',
            required: false,
          },
          stepId: {
            type: 'string',
            description: '步骤ID（可选）',
            required: false,
          },
        },
        required: ['action'],
      },
      { category: 'execution' },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const runtimeSessionId = params.runtimeSessionId as string;
    const stepId = params.stepId as string;
    const action = params.action as string;
    const target = params.target as string | undefined;
    const args = params.args as Record<string, unknown> | undefined;
    const assertion = params.assertion as { type: string; expected?: string } | undefined;

    // Use executionId from context if available
    const executionId = context.executionId || 'unknown';

    const browserWorkerUrl = getBrowserWorkerUrl();
    const controlPlaneUrl = getControlPlaneUrl();
    const traceHeaders = context.traceId ? { [TRACE_ID_HEADER]: context.traceId } : undefined;

    const stepDto: ExecuteStepDto = {
      executionId,
      runtimeSessionId,
      stepId,
      action,
      target,
      args,
      assertion,
    };

    this.logger.debug(`Executing browser step: ${action} for execution ${executionId}, step ${stepId}`);

    try {
      // Call browser-worker execute-step endpoint
      const response = await axios.post<ExecuteStepResultDto>(
        `${browserWorkerUrl}/browser/execute-step`,
        stepDto,
        {
          timeout: 60000, // 60秒超时
          headers: {
            'Content-Type': 'application/json',
            ...(traceHeaders || {}),
          },
        },
      );

      const result = response.data;

      // Build output message
      let output = `浏览器步骤执行${result.success ? '成功' : '失败'}: ${action}`;
      if (result.snapshotId) {
        output += `\n快照ID: ${result.snapshotId}`;
      }
      if (result.errorMessage) {
        output += `\n错误: ${result.errorMessage}`;
      }
      if (result.output) {
        output += `\n输出: ${JSON.stringify(result.output).slice(0, 500)}`;
      }

      // Check if takeover is required
      if (result.shouldTakeover) {
        this.logger.log(`Takeover required for execution ${executionId}: ${result.takeoverReason}`);

        // Call control-plane to trigger takeover
        try {
          await axios.post(
            `${controlPlaneUrl}/api/executions/${executionId}/takeover`,
            { reason: result.takeoverReason || 'Human takeover required' },
            {
              timeout: 10000,
              headers: {
                'Content-Type': 'application/json',
                ...(traceHeaders || {}),
              },
            },
          );
          this.logger.log(`Takeover triggered for execution ${executionId}`);
          output += `\n\n[自动触发人工接管: ${result.takeoverReason || '未知原因'}]`;
        } catch (takeoverError) {
          const errorMsg = takeoverError instanceof Error ? takeoverError.message : 'Unknown error';
          this.logger.error(`Failed to trigger takeover: ${errorMsg}`);
          output += `\n\n[警告: 触发人工接管失败，请手动处理]`;
        }

        return {
          success: false, // Step didn't complete normally
          output,
          data: {
            stepId,
            action,
            success: result.success,
            snapshotId: result.snapshotId,
            shouldTakeover: true,
            takeoverReason: result.takeoverReason,
            takeoverTriggered: true,
          },
          nextAction: undefined, // Stop execution
        };
      }

      return {
        success: result.success,
        output,
        data: {
          stepId,
          action,
          success: result.success,
          snapshotId: result.snapshotId,
          output: result.output,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          shouldTakeover: false,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Browser step execution failed: ${errorMsg}`);

      let errorDetail = errorMsg;
      const axiosLikeError = error as { response?: { status?: number; data?: unknown } } | undefined;
      if (axiosLikeError?.response) {
        errorDetail = `HTTP ${axiosLikeError.response.status}: ${JSON.stringify(axiosLikeError.response.data)}`;
      }

      return {
        success: false,
        output: `浏览器步骤执行失败: ${errorDetail}`,
        data: {
          stepId,
          action,
          error: errorDetail,
        },
      };
    }
  }
}
