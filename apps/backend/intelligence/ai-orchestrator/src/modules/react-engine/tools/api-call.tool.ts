/**
 * API Call Tool
 * 执行外部API调用，用于流程模板中的API步骤
 */

import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { Tool } from '../decorators/tool.decorator';

type AxiosLikeError = {
  code?: string;
  response?: {
    status: number;
    statusText: string;
  };
};

@Injectable()
@Tool({
  name: 'api_call',
  description: '执行外部API调用。用于流程模板中的API步骤，可以调用GET或POST接口获取数据。',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'API的完整URL地址',
        required: true,
      },
      method: {
        type: 'string',
        description: 'HTTP方法：GET或POST',
        required: false,
      },
      params: {
        type: 'object',
        description: '请求参数（GET查询参数或POST请求体）',
        required: false,
      },
      headers: {
        type: 'object',
        description: '额外的请求头',
        required: false,
      },
    },
    required: ['url'],
  },
  isDefault: true,
})
export class ApiCallTool extends BaseTool {
  constructor() {
    super('api_call', '执行外部API调用。用于流程模板中的API步骤，可以调用GET或POST接口获取数据。', {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'API的完整URL地址',
          required: true,
        },
        method: {
          type: 'string',
          description: 'HTTP方法：GET或POST',
          required: false,
        },
        params: {
          type: 'object',
          description: '请求参数（GET查询参数或POST请求体）',
          required: false,
        },
        headers: {
          type: 'object',
          description: '额外的请求头',
          required: false,
        },
      },
      required: ['url'],
    });
  }

  async execute(params: Record<string, unknown>, context: ExecutionContext): Promise<ToolResult> {
    const url = params.url as string;
    const method = (params.method as string)?.toUpperCase() || 'GET';
    const queryParams = params.params as Record<string, unknown> | undefined;
    const headers = params.headers as Record<string, string> | undefined;

    this.logger.debug(`Calling API: ${method} ${url}`);

    try {
      let response;

      if (method === 'GET') {
        response = await axios.get(url, {
          params: queryParams,
          headers: headers || {},
          timeout: 30000, // 30秒超时
        });
      } else if (method === 'POST') {
        response = await axios.post(url, queryParams || {}, {
          headers: headers || {},
          timeout: 30000,
        });
      } else {
        return {
          success: false,
          output: `不支持的HTTP方法: ${method}`,
          data: { error: 'invalid_method' },
        };
      }

      // 构建结果输出
      const outputMsg = `API调用成功: ${url}\n响应数据: ${JSON.stringify(response.data, null, 2).slice(0, 1000)}...`;

      return {
        success: true,
        output: outputMsg,
        data: {
          apiResponse: response.data,
          statusCode: response.status,
          url,
          method,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const axiosError = error as AxiosLikeError;

      // 处理特定错误
      if (axiosError.response) {
        return {
          success: false,
          output: `API调用失败: ${axiosError.response.status} - ${axiosError.response.statusText}`,
          data: {
            error: 'api_error',
            statusCode: axiosError.response.status,
            url,
          },
        };
      }

      if (axiosError.code === 'ECONNABORTED') {
        return {
          success: false,
          output: `API调用超时: ${url}`,
          data: { error: 'timeout', url },
        };
      }

      return {
        success: false,
        output: `API调用失败: ${errorMsg}`,
        data: { error: 'request_failed', url },
      };
    }
  }
}
