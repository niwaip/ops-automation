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

const findWeatherPayload = (value: unknown, depth = 0): Record<string, unknown> | undefined => {
  if (depth > 4) {
    return undefined;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const weatherKeys = ['province', 'city', 'weather', 'temperature', 'wind_direction', 'wind_power', 'humidity', 'report_time'];
  if (weatherKeys.some((key) => record[key] !== undefined && record[key] !== null)) {
    return record;
  }

  for (const nestedValue of Object.values(record)) {
    const nestedPayload = findWeatherPayload(nestedValue, depth + 1);
    if (nestedPayload) {
      return nestedPayload;
    }
  }

  return undefined;
};

const formatWeatherFinalAnswer = (
  collectedParams: Record<string, unknown> | undefined,
  execParams: Record<string, unknown>,
): string | undefined => {
  const apiResult = collectedParams
    ? Object.entries(collectedParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .find(([key]) => /^step_\d+_result$/.test(key))?.[1]
    : undefined;

  const payload = findWeatherPayload(apiResult);
  if (!payload) {
    return undefined;
  }

  const city = String(payload.city ?? execParams.city ?? '').trim();
  const province = String(payload.province ?? '').trim();
  const location = [province, city].filter(Boolean).join('');

  const weather = String(payload.weather ?? '').trim();
  const temperature = String(payload.temperature ?? '').trim();
  const humidity = String(payload.humidity ?? '').trim();
  const windDirection = String(payload.wind_direction ?? '').trim();
  const windPower = String(payload.wind_power ?? '').trim();
  const reportTime = String(payload.report_time ?? '').trim();

  const lines = [
    `${location || city || '该城市'}天气查询结果：`,
    weather ? `天气：${weather}` : '',
    temperature ? `温度：${temperature}${temperature.includes('C') || temperature.includes('℃') ? '' : '℃'}` : '',
    humidity ? `湿度：${humidity}${humidity.includes('%') ? '' : '%'}` : '',
    windDirection || windPower ? `风况：${[windDirection, windPower].filter(Boolean).join(' ')}` : '',
    reportTime ? `更新时间：${reportTime}` : '',
  ].filter(Boolean);

  return lines.length > 1 ? lines.join('\n') : undefined;
};

const buildFinalAnswer = (
  templateName: string,
  collectedParams: Record<string, unknown> | undefined,
  execParams: Record<string, unknown>,
  fallbackOutput: string,
): string => {
  if (templateName.includes('天气')) {
    return formatWeatherFinalAnswer(collectedParams, execParams) || fallbackOutput;
  }
  return fallbackOutput;
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

    try {
      // 1. 获取流程步骤定义
      const authUrl = getAuthServiceUrl();
      let template: FlowTemplate;

      if (templateId) {
        const url = `${authUrl}/execution-flow-templates/${templateId}`;
        this.logger.debug(`Fetching template from: ${url}`);
        try {
          const response = await axios.get(url);
          template = response.data as FlowTemplate;
        } catch (fetchError: any) {
          this.logger.error(`Failed to fetch template ${templateId}: ${fetchError.message}`);
          return {
            success: false,
            output: `无法加载流程模板 (ID: ${templateId})，请确认模板是否存在。错误: ${fetchError.message}`,
            data: { error: 'template_fetch_failed', templateId, status: fetchError.response?.status },
          };
        }
      } else {
        const response = await axios.get(`${authUrl}/skills/${skillId}`);
        const skill = response.data as { name: string; executionFlow: FlowStep[] };
        template = {
          name: skill.name,
          steps: skill.executionFlow || [],
        };
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
        const finalAnswer = buildFinalAnswer(
          template.name,
          context.collectedParams,
          execParams,
          '流程模板所有步骤已执行完成',
        );
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
          let endpoint = resolvedEndpoint;

          // 兼容历史天气模板：wttr.in 稳定性较差，统一切换到可用的天气查询接口
          if (endpoint.includes('wttr.in/') && endpoint.includes('format=j1')) {
            const city = String(
              getValueByPath(execParams, 'city') ??
              getValueByPath(execParams, 'flow_input.city') ??
              '',
            ).trim();

            if (city) {
              endpoint = `https://uapis.cn/api/v1/misc/weather?city=${encodeURIComponent(city)}&lang=zh`;
              usedKeys.add('city');
            }
          }

          try {
            const apiResponse = await axios({
              method: currentStep.api.method || 'GET',
              url: endpoint,
              headers: currentStep.api.headers || {},
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
        const finalAnswer = buildFinalAnswer(
          template.name,
          context.collectedParams,
          execParams,
          `${stepResult}\n\n流程执行完成！`,
        );
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
