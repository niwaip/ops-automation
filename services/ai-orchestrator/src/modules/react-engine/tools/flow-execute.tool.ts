/**
 * Flow Execute Tool
 * 执行流程模板步骤，支持text、api、tool、script类型步骤
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';

// Auth服务地址
const getAuthServiceUrl = () => {
  if (process.env.AUTH_SERVICE_URL) {
    return process.env.AUTH_SERVICE_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-auth:3001';
  }
  return 'http://localhost:3001';
};

export class FlowExecuteTool extends BaseTool {
  constructor() {
    super(
      'flow_execute',
      '执行流程模板步骤。根据模板ID获取步骤定义，并按顺序执行每个步骤。支持API调用、文本指导、工具调用等步骤类型。',
      {
        type: 'object',
        properties: {
          templateId: {
            type: 'string',
            description: '流程模板ID',
            required: true,
          },
          stepIndex: {
            type: 'number',
            description: '从第几步开始执行（可选，默认从0开始）',
            required: false,
          },
          params: {
            type: 'object',
            description: '执行参数（用于填充步骤中的变量）',
            required: false,
          },
        },
        required: ['templateId'],
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    const templateId = params.templateId as string;
    const stepIndex = (params.stepIndex as number) || 0;
    const execParams = params.params as Record<string, unknown> || {};

    this.logger.debug(`Executing flow template: ${templateId}, starting from step ${stepIndex}`);

    try {
      // 1. 获取流程模板
      const authUrl = getAuthServiceUrl();
      const response = await axios.get(`${authUrl}/execution-flow-templates/${templateId}`);
      const template = response.data;

      if (!template || !template.steps) {
        return {
          success: false,
          output: `流程模板不存在或没有步骤定义: ${templateId}`,
          data: { error: 'template_not_found' },
        };
      }

      const steps = template.steps as Array<{
        id?: string;
        type: 'text' | 'api' | 'tool' | 'script';
        name: string;
        content?: string;
        api?: {
          endpoint: string;
          method: 'GET' | 'POST' | 'PUT' | 'DELETE';
          headers?: Record<string, string>;
          body?: Record<string, unknown>;
          timeout?: number;
        };
        tool?: {
          name: string;
          params?: Record<string, unknown>;
        };
        script?: {
          language: 'bash' | 'python' | 'javascript';
          code: string;
        };
      }>;

      if (stepIndex >= steps.length) {
        return {
          success: true,
          output: '流程模板所有步骤已执行完成',
          data: { taskComplete: true, templateId },
        };
      }

      // 2. 执行当前步骤
      const currentStep = steps[stepIndex];
      if (!currentStep) {
        return {
          success: false,
          output: `步骤索引 ${stepIndex} 超出范围`,
          data: { error: 'invalid_step_index', stepIndex },
        };
      }
      let stepResult: string;
      let nextStepIndex = stepIndex + 1;

      this.logger.debug(`Executing step ${stepIndex}: ${currentStep.name} (${currentStep.type})`);

      switch (currentStep.type) {
        case 'text':
          // 文本指导步骤 - 直接返回内容给用户
          stepResult = `[步骤 ${stepIndex + 1}/${steps.length}] ${currentStep.name}\n${currentStep.content || '无指导内容'}`;
          break;

        case 'api':
          // API调用步骤
          if (!currentStep.api?.endpoint) {
            stepResult = `步骤"${currentStep.name}"缺少API端点配置`;
            return {
              success: false,
              output: stepResult,
              data: { error: 'missing_api_endpoint', stepIndex },
            };
          }

          // 替换参数变量（如 {city} 替换为实际值）
          let endpoint = currentStep.api.endpoint;
          for (const [key, value] of Object.entries(execParams)) {
            endpoint = endpoint.replace(`{${key}}`, String(value));
          }

          try {
            const apiResponse = await axios({
              method: currentStep.api.method || 'GET',
              url: endpoint,
              headers: currentStep.api.headers || {},
              data: currentStep.api.method === 'GET' ? undefined : { ...currentStep.api.body, ...execParams },
              params: currentStep.api.method === 'GET' ? execParams : undefined,
              timeout: currentStep.api.timeout || 30000,
            });

            // 格式化API响应
            const responsePreview = JSON.stringify(apiResponse.data, null, 2).slice(0, 1000);
            stepResult = `[步骤 ${stepIndex + 1}/${steps.length}] ${currentStep.name} - API调用成功\n响应: ${responsePreview}`;

            // 保存API结果到context.collectedParams
            if (context.collectedParams) {
              context.collectedParams[`step_${stepIndex}_result`] = apiResponse.data;
            } else {
              context.collectedParams = { [`step_${stepIndex}_result`]: apiResponse.data };
            }
          } catch (apiError) {
            const errorMsg = apiError instanceof Error ? apiError.message : 'Unknown error';
            stepResult = `[步骤 ${stepIndex + 1}/${steps.length}] ${currentStep.name} - API调用失败: ${errorMsg}`;
            return {
              success: false,
              output: stepResult,
              data: { error: 'api_error', stepIndex, message: errorMsg },
            };
          }
          break;

        case 'tool':
          // 工具调用步骤 - 返回提示，让ReAct引擎调用对应工具
          if (!currentStep.tool?.name) {
            stepResult = `步骤"${currentStep.name}"缺少工具名称配置`;
            return {
              success: false,
              output: stepResult,
              data: { error: 'missing_tool_name', stepIndex },
            };
          }

          // 合并参数
          const toolParams = { ...currentStep.tool.params, ...execParams };

          // 返回结果，并设置nextAction让引擎调用对应工具
          stepResult = `[步骤 ${stepIndex + 1}/${steps.length}] ${currentStep.name} - 需要调用工具 ${currentStep.tool.name}`;

          return {
            success: true,
            output: stepResult,
            data: {
              templateId,
              stepIndex,
              nextStepIndex,
              needsToolCall: true,
              toolName: currentStep.tool.name,
              toolParams,
            },
            nextAction: currentStep.tool.name,
            nextActionParams: toolParams,
          };

        case 'script':
          // 脚本执行步骤 - 目前只返回脚本内容（实际执行需要安全考虑）
          stepResult = `[步骤 ${stepIndex + 1}/${steps.length}] ${currentStep.name}\n脚本类型: ${currentStep.script?.language || 'unknown'}\n脚本内容:\n${currentStep.script?.code || '无脚本内容'}`;
          break;

        default:
          stepResult = `[步骤 ${stepIndex + 1}/${steps.length}] ${currentStep.name} - 未知步骤类型: ${currentStep.type}`;
      }

      // 3. 构建返回结果
      const isLastStep = nextStepIndex >= steps.length;

      const result: ToolResult = {
        success: true,
        output: stepResult,
        data: {
          templateId,
          templateName: template.name,
          stepIndex,
          totalSteps: steps.length,
          currentStep: currentStep.name,
          nextStepIndex,
          isLastStep,
          collectedParams: context.collectedParams,
        },
      };

      // 如果不是最后一步，设置nextAction继续执行下一步
      if (!isLastStep) {
        result.nextAction = 'flow_execute';
        result.nextActionParams = {
          templateId,
          stepIndex: nextStepIndex,
          params: context.collectedParams || execParams,
        };
      } else {
        // 最后一步完成
        result.data!.taskComplete = true;
        result.output += '\n\n流程执行完成！';
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return {
            success: false,
            output: `流程模板不存在: ${templateId}`,
            data: { error: 'template_not_found', templateId },
          };
        }
      }

      return {
        success: false,
        output: `流程执行失败: ${errorMsg}`,
        data: { error: 'execution_error', templateId, stepIndex },
      };
    }
  }
}