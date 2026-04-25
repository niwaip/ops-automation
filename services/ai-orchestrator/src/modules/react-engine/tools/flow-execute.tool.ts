/**
 * Flow Execute Tool
 * 执行流程模板步骤，支持text、api、tool、script类型步骤
 */

import axios from 'axios';
import { BaseTool } from './base.tool';
import { ToolResult, ExecutionContext } from '../interfaces';
import { TRACE_ID_HEADER } from '../../../common/trace.util';

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

// Carbone服务地址
const getCarboneServiceUrl = () => {
  if (process.env.CARBONE_SERVICE_URL) {
    return process.env.CARBONE_SERVICE_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://carbone-engine:3009';
  }
  return 'http://localhost:3009';
};

// 解析API端点URL，添加必要的base URL
const resolveApiUrl = (endpoint: string): string => {
  // 如果是完整URL，直接返回
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  // 如果是相对路径，需要添加base URL
  if (endpoint.startsWith('/')) {
    // 检测是否是carbone API
    if (endpoint.startsWith('/api/carbone/') || endpoint.startsWith('/studio/')) {
      return getCarboneServiceUrl() + endpoint;
    }
    // 其他相对路径默认使用auth服务
    return getAuthServiceUrl() + endpoint;
  }
  // 已经是完整路径
  return endpoint;
};

const getValueByPath = (
  source: Record<string, unknown>,
  path: string,
): unknown => {
  const normalizedPath = path.startsWith('flow_input.')
    ? path.slice('flow_input.'.length)
    : path;
  return normalizedPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
};

const resolveEndpointTemplate = (
  template: string,
  execParams: Record<string, unknown>,
): { endpoint: string; usedKeys: Set<string> } => {
  const usedKeys = new Set<string>();
  let endpoint = template;

  endpoint = endpoint.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawPath: string) => {
    const path = rawPath.trim();
    const value = getValueByPath(execParams, path);
    if (value === undefined || value === null) {
      return '';
    }
    const topLevelKey = path.replace(/^flow_input\./, '').split('.')[0] || path;
    usedKeys.add(topLevelKey);
    return encodeURIComponent(String(value));
  });

  endpoint = endpoint.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, rawPath: string) => {
    const path = rawPath.trim();
    const value = getValueByPath(execParams, path);
    if (value === undefined || value === null) {
      return '';
    }
    const topLevelKey = path.split('.')[0] || path;
    usedKeys.add(topLevelKey);
    return encodeURIComponent(String(value));
  });

  return { endpoint, usedKeys };
};

const buildGetParams = (
  execParams: Record<string, unknown>,
  usedKeys: Set<string>,
): Record<string, unknown> | undefined => {
  const remainingParams = Object.fromEntries(
    Object.entries(execParams).filter(([key, value]) => {
      return !usedKeys.has(key) && value !== undefined && value !== null;
    }),
  );
  return Object.keys(remainingParams).length > 0 ? remainingParams : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const formatRuntimeSummary = (skillName: string, runtimeData: Record<string, unknown>): string => {
  const lines = [`Temporal Workflow 执行成功: ${skillName}`];
  const result = asRecord(runtimeData.result);
  const logs = Array.isArray(runtimeData.logs)
    ? runtimeData.logs.filter((item): item is string => typeof item === 'string')
    : [];
  const workflowSteps = Array.isArray(runtimeData.workflowSteps)
    ? runtimeData.workflowSteps.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];

  if (result && Object.keys(result).length > 0) {
    lines.push('');
    lines.push('返回结果:');
    lines.push(JSON.stringify(result, null, 2));
  }

  if (workflowSteps.length > 0) {
    lines.push('');
    lines.push('Workflow 步骤:');
    lines.push(...workflowSteps.map((step) => {
      const stepId = typeof step.id === 'string' ? step.id : 'unknown_step';
      const stepName = typeof step.name === 'string' ? step.name : stepId;
      const stepType = typeof step.type === 'string' ? step.type : 'unknown';
      const activityName = typeof step.activityName === 'string' ? ` -> ${step.activityName}` : '';
      return `- ${stepId}: ${stepName} (${stepType}${activityName})`;
    }));
  }

  if (logs.length > 0) {
    lines.push('');
    lines.push('执行过程:');
    lines.push(...logs.slice(-5).map((log) => `- ${log}`));
  }

  return lines.join('\n');
};

export class FlowExecuteTool extends BaseTool {
  constructor() {
    super(
      'flow_execute',
      '执行流程模板步骤。根据模板ID或技能ID获取步骤定义，并按顺序执行每个步骤。支持API调用、文本指导、工具调用等步骤类型。',
      {
        type: 'object',
        properties: {
          templateId: {
            type: 'string',
            description: '流程模板ID（优先使用）',
            required: false,
          },
          skillId: {
            type: 'string',
            description: '技能ID（如果无模板ID，则执行技能内编排的流程）',
            required: false,
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
        required: [],
      },
    );
  }

  async execute(
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    type FlowStep = {
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
    };
    type FlowTemplate = {
      name: string;
      steps: FlowStep[];
    };

    const templateId = params.templateId as string;
    const skillId = params.skillId as string;
    const stepIndex = (params.stepIndex as number) || 0;
    const execParams = params.params as Record<string, unknown> || {};

    if (!templateId && !skillId) {
      return {
        success: false,
        output: '必须提供 templateId 或 skillId 之一',
        data: { error: 'missing_id' },
      };
    }

    this.logger.debug(`Executing flow: ${templateId || skillId}, starting from step ${stepIndex}`);
    const traceHeaders = {
      ...(context.traceId ? { [TRACE_ID_HEADER]: context.traceId } : {}),
      ...(context.authToken ? { Authorization: context.authToken } : {}),
    };

    try {
      // 1. 获取流程步骤定义
      const authUrl = getAuthServiceUrl();
      let template: FlowTemplate;
      const loadSkillExecution = async (resolvedSkillId: string): Promise<{ template?: FlowTemplate; result?: ToolResult }> => {
        const response = await axios.get(`${authUrl}/skills/${resolvedSkillId}`, { headers: traceHeaders });
        const skill = response.data as {
          name: string;
          executionFlow: FlowStep[];
          apiEndpoints?: {
            runtimeMetadata?: {
              sourceType?: string;
              workflowSteps?: Array<Record<string, unknown>>;
            };
          };
        };

        if (
          (!skill.executionFlow || skill.executionFlow.length === 0)
          && skill.apiEndpoints?.runtimeMetadata?.sourceType === 'temporal_workflow'
        ) {
          const runtimeResponse = await axios.post(
            `${authUrl}/capability-releases/runtime/skills/${resolvedSkillId}/execute`,
            { input: execParams },
            { headers: traceHeaders },
          );
          const runtimeData = runtimeResponse.data as Record<string, unknown>;
          const runtimeSummaryData = {
            ...runtimeData,
            workflowSteps: skill.apiEndpoints?.runtimeMetadata?.workflowSteps ?? [],
          };
          return {
            result: {
              success: Boolean(runtimeData.success),
              output: Boolean(runtimeData.success)
                ? formatRuntimeSummary(skill.name, runtimeSummaryData)
                : `Temporal Workflow 执行失败: ${String(runtimeData.error || '未知错误')}`,
              data: {
                runtime: 'temporal_workflow',
                taskComplete: Boolean(runtimeData.success),
                finalAnswer: Boolean(runtimeData.success)
                  ? formatRuntimeSummary(skill.name, runtimeSummaryData)
                  : undefined,
                result: runtimeData.result ?? null,
                logs: runtimeData.logs ?? [],
                workflowSteps: skill.apiEndpoints?.runtimeMetadata?.workflowSteps ?? [],
                error: runtimeData.error ?? null,
              },
            },
          };
        }

        return {
          template: {
            name: skill.name,
            steps: skill.executionFlow || [],
          },
        };
      };

      if (templateId) {
        const url = `${authUrl}/execution-flow-templates/${templateId}`;
        this.logger.debug(`Fetching template from: ${url}`);
        try {
          const response = await axios.get(url, { headers: traceHeaders });
          template = response.data as FlowTemplate;
        } catch (fetchError: any) {
          if (fetchError.response?.status === 404 && context.skill?.skillId) {
            this.logger.warn(
              `Template ${templateId} not found, falling back to matched skill ${context.skill.skillId}`,
            );
            const fallback = await loadSkillExecution(context.skill.skillId);
            if (fallback.result) {
              return fallback.result;
            }
            template = fallback.template as FlowTemplate;
          } else {
            this.logger.error(`Failed to fetch template ${templateId}: ${fetchError.message}`);
            return {
              success: false,
              output: `无法加载流程模板 (ID: ${templateId})，请确认模板是否存在。错误: ${fetchError.message}`,
              data: { error: 'template_fetch_failed', templateId, status: fetchError.response?.status },
            };
          }
        }
      } else {
        const resolvedSkillId = skillId || context.skill?.skillId;
        if (!resolvedSkillId) {
          return {
            success: false,
            output: '无法确定要执行的技能',
            data: { error: 'missing_skill_id' },
          };
        }
        const loaded = await loadSkillExecution(resolvedSkillId);
        if (loaded.result) {
          return loaded.result;
        }
        template = loaded.template as FlowTemplate;
      }

      if (!template || !template.steps || template.steps.length === 0) {
        return {
          success: false,
          output: `流程定义不存在或没有步骤: ${templateId || skillId}`,
          data: { error: 'flow_definition_empty' },
        };
      }

      const steps = template.steps;

      if (stepIndex >= steps.length) {
        const finalAnswer = '流程模板所有步骤已执行完成';
        return {
          success: true,
          output: finalAnswer,
          data: { taskComplete: true, templateId, finalAnswer },
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

          // 支持 {city}、{{city}}、{{flow_input.city}} 三种变量格式
          const { endpoint: resolvedEndpoint, usedKeys } = resolveEndpointTemplate(
            currentStep.api.endpoint,
            execParams,
          );
          let endpoint = resolveApiUrl(resolvedEndpoint);

          try {
            const apiResponse = await axios({
              method: currentStep.api.method || 'GET',
              url: endpoint,
              headers: {
                ...(currentStep.api.headers || {}),
                ...(traceHeaders || {}),
              },
              data: currentStep.api.method === 'GET' ? undefined : { ...currentStep.api.body, ...execParams },
              params: currentStep.api.method === 'GET' ? buildGetParams(execParams, usedKeys) : undefined,
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
        const finalAnswer = `${stepResult}\n\n流程执行完成！`;
        result.data!.taskComplete = true;
        result.data!.finalAnswer = finalAnswer;
        result.output = finalAnswer;
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response?: { status?: number } }).response;
        if (response?.status === 404) {
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
