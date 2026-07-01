import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ActivityFormData, GenerateCodeResult } from './temporal-activity.types';
import { normalizeInputParams } from './temporal-activity-input-params.utils';
import {
  getAiOrchestratorUrl,
  getCarboneExternalUrl,
  getCarboneServiceUrl,
} from '../../config/service-endpoints';

@Injectable()
export class ActivityCodegenService {
  private readonly logger = new Logger('ActivityCodegenService');

  /**
   * Generate Python code using AI
   */
  async generateCode(config: ActivityFormData, errorContext?: string): Promise<GenerateCodeResult> {
    // Build a detailed prompt for code generation
    const description = config.config?.description || '';
    const steps = config.config?.steps || [];
    const heartbeatTimeout = config.config?.heartbeatTimeout;
    const retryPolicy = config.retryPolicy;
    const idempotencyKey = config.config?.idempotencyKey;

    // Build prompt using array join to avoid template literal nesting issues
    const promptParts: string[] = [
      '你是一个 Temporal Python 开发专家。请根据以下配置生成一个标准的、可直接生产运行的 Temporal Activity。',
      '',
      '【遵守 Temporal Python SDK 黄金准则】：',
      '1. 【结构】：必须包含完整的 import 语句：`from temporalio import activity`, `from temporalio.exceptions import ApplicationError`, 以及 `from typing import Dict, Any`。',
      `2. 【声明】：使用 \`@activity.defn(name="${config.fn}")\` 装饰函数。`,
      `3. 【签名】：必须为 \`async def ${config.fn}(input_data: Dict[str, Any]) -> Dict[str, Any]:\`。`,
      '4. 【日志】：严禁使用 print()。必须使用 `activity.logger.info` 记录步骤，使用 `activity.logger.error` 记录异常。',
    ];

    // 5. 动态心跳指令
    if (heartbeatTimeout) {
      promptParts.push(
        `5. 【强制心跳】：当前 Activity 已开启心跳超时检测(${heartbeatTimeout})。你必须在每个 API 请求后或逻辑步骤间调用 \`activity.heartbeat()\` 报告进度。`
      );
    } else {
      promptParts.push(
        '5. 【心跳】：虽然未强制开启心跳，但建议在长耗时步骤间调用 `activity.heartbeat()`。'
      );
    }

    // 6. 动态异常与重试指令
    if (retryPolicy) {
      promptParts.push(
        `6. 【重试感知】：当前已配置重试策略（最多 ${retryPolicy.maxRetries} 次）。请在抛出 ApplicationError 时，根据错误性质决定是否重试。例如：网络超时应重试，业务参数错误应设置 non_retryable=True。`
      );
    } else {
      promptParts.push(
        '6. 【异常】：使用 `raise ApplicationError("描述", non_retryable=False)` 抛出业务异常。'
      );
    }

    promptParts.push(
      '7. 【状态检查】：在每次 `requests` 调用后，必须立即调用 `response.raise_for_status()`，以确保 HTTP 错误（如 404, 500）能被 `except` 块捕获。',
      '8. 【幂等】：尽可能确保代码是幂等的。如果返回包含多个字段的结果字典，请确保结果结构清晰。',
      '9. 【环境】：沙箱已 Mock `requests`，请放心使用同步的 `requests.get/post`，无需使用 aiohttp。',
      '10. 【Carbone 渲染】：如果步骤涉及 Carbone 渲染（type=carbone），必须调用 Carbone API。',
      `    - 内部 API 地址：\`${getCarboneServiceUrl()}/studio/render-resolved\`。`,
      '    - 拼接规则：必须使用环境变量 `CARBONE_EXTERNAL_URL` 作为前缀。',
      `    - 注意：如果 \`CARBONE_EXTERNAL_URL\` 未设置，默认使用 ${getCarboneExternalUrl()}。`,
      '    - 最终返回结果必须包含 `downloadUrl` 字段。',
      ''
    );

    // If there's error context, add it to help AI fix the issue
    if (errorContext) {
      promptParts.push(
        '',
        '【上次代码执行失败，请修复以下问题】：',
        errorContext,
        '',
        '请根据错误信息修复代码，确保生成的代码能正确执行。',
        ''
      );
    }

    promptParts.push(
      '请严格遵循以下要求，只返回 Python 代码，不要有其他解释。',
      '',
      'Activity 配置：',
      `- 名称：${config.name}`,
      `- 函数名：${config.fn}`,
      `- 描述：${description || '无'}`,
      `- Task Queue：${config.config?.taskQueue || 'SKILL_TASK_QUEUE'}`,
      `- 超时：${config.timeout || '30s'}`
    );

    if (heartbeatTimeout) {
      promptParts.push(`- 心跳超时：${heartbeatTimeout}`);
    } else {
      promptParts.push('- 心跳超时：不启用');
    }

    if (retryPolicy) {
      promptParts.push(`- 重试策略：最多 ${retryPolicy.maxRetries} 次`);
    } else {
      promptParts.push('- 重试策略：不启用');
    }

    if (idempotencyKey) {
      promptParts.push(`- 幂等键：${idempotencyKey}`);
    } else {
      promptParts.push('- 幂等键：不启用');
    }

    promptParts.push('');

    if (steps.length > 0) {
      promptParts.push(`步骤配置（${steps.length} 个步骤）：`);
    }

    // Add step descriptions
    steps.forEach((step: any, idx: number) => {
      let stepDesc = `步骤 ${idx + 1}: ${step.name}`;
      stepDesc += `\n  - 类型：${step.type}`;
      stepDesc += `\n  - 超时：${step.timeout || '30s'}`;
      if (step.type === 'api') {
        stepDesc += `\n  - 端点：${step.config?.endpoint || '未指定'}, 方法：${step.config?.method || 'GET'}`;
      } else if (step.type === 'script') {
        stepDesc += `\n  - 脚本：${(step.config?.script || '').substring(0, 100)}...`;
      } else if (step.type === 'carbone') {
        stepDesc += `\n  - 模板ID：${step.config?.templateId || '未指定'}`;
      } else if (step.type === 'browser') {
        stepDesc += `\n  - 操作：${step.config?.action || 'click'}, 选择器：${step.config?.selector || '未指定'}`;
      }
      if (step.formatPrompt) {
        stepDesc += `\n  - 输出格式：${step.formatPrompt}`;
      }
      const inputParams = normalizeInputParams(step.inputParams);
      if (inputParams.length > 0) {
        stepDesc += '\n  - 输入参数：';
        inputParams.forEach((param) => {
          stepDesc += `\n    - ${param.key || '未命名参数'} | 默认值：${param.value || '无'} | ${param.required ? '必填' : '可选'}`;
        });
      }
      if (step.extraPrompt) {
        stepDesc += `\n  - 情报补足：${step.extraPrompt}`;
      }
      promptParts.push(stepDesc);
    });

    const prompt = promptParts.join('\n');

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      this.logger.log(`Calling AI orchestrator at ${aiOrchestratorUrl}/ai/model/call`);

      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'default', // 使用系统默认模型
          prompt,
        },
        { timeout: 120000 }
      );

      let code = response.data?.result;
      if (code) {
        // More robust markdown stripping
        if (code.includes('```')) {
          const match = code.match(/```(?:python)?\n?([\s\S]*?)```/);
          if (match) {
            code = match[1].trim();
          } else {
            // Fallback for weird markdown
            code = code
              .replace(/```[a-zA-Z]*\n?/g, '')
              .replace(/```/g, '')
              .trim();
          }
        }

        this.logger.log('Successfully generated code');
        return { success: true, code };
      } else {
        return { success: false, error: 'AI returned empty response' };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI code generation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }
}
