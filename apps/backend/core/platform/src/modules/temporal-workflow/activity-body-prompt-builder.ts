import {
  getCarboneExternalUrl,
  getCarboneServiceUrl,
} from '../../config/service-endpoints';
import { normalizeInputParams } from './temporal-activity-input-params.utils';
import { ActivityFormData } from './temporal-activity.types';

/**
 * Builds a concise, strict prompt for AI to generate a single Temporal Activity function body.
 * Reduced from 38 legacy workflow rules to 12 core Activity rules.
 */
export function buildActivityBodyPrompt(
  config: ActivityFormData,
  errorContext?: string
): string {
  const description = config.config?.description || '';
  const steps = config.config?.steps || [];
  const heartbeatTimeout = config.config?.heartbeatTimeout;
  const retryPolicy = config.retryPolicy;
  const idempotencyKey = config.config?.idempotencyKey;

  const promptParts: string[] = [
    '你是一个 Temporal Python 开发专家。请为指定的 Activity 生成一个标准的、可独立在 Temporal Worker 执行的 Python 函数实现。',
    '',
    '【必须遵守的 12 条 Activity 核心规则】：',
    '1. 【基础导入】：包含 `from temporalio import activity`, `from temporalio.exceptions import ApplicationError`, `from typing import Dict, Any` 以及必要的标准库导入。',
    `2. 【装饰器与命名】：函数必须带 \`@activity.defn(name="${config.fn}")\` 装饰器，且 Python 函数名必须等于 \`${config.fn}\`。`,
    `3. 【函数签名】：签名必须严格为 \`async def ${config.fn}(input_data: Dict[str, Any]) -> Dict[str, Any]:\`。`,
    '4. 【禁止 Workflow 结构】：严禁生成 `@workflow.defn` 类、`@workflow.run` 方法或任何 Temporal Workflow 编排逻辑。只生成 Activity 定义本身。',
    '5. 【禁止 Worker 客户端】：严禁包含 `temporalio.client.Client` 或 `Worker` 连接/启动代码。',
    '6. 【日志规范】：严禁使用 `print()`，必须使用 `activity.logger.info()` 记录关键进度，使用 `activity.logger.error()` 记录异常。',
    '7. 【可重试异常】：遇到网络超时、临时服务不可用时，使用 `raise ApplicationError("描述", non_retryable=False)` 抛出可重试异常。',
    '8. 【不可重试异常】：遇到业务参数缺失、格式非法或永久不可恢复错误时，使用 `raise ApplicationError("描述", non_retryable=True)` 抛出不可重试异常。',
    '9. 【HTTP 状态检查】：所有 `requests` 请求后必须紧跟 `response.raise_for_status()`，确保 HTTP 4xx/5xx 能触发异常处理。',
  ];

  if (heartbeatTimeout) {
    promptParts.push(
      `10. 【心跳机制】：当前开启了心跳超时检测(${heartbeatTimeout})。你必须在 API 请求后或逻辑循环间调用 \`activity.heartbeat()\` 报告进度。`
    );
  } else {
    promptParts.push(
      '10. 【心跳机制】：若存在潜在长耗时 API 调用或处理循环，建议在关键节点调用 `activity.heartbeat()` 报告进度。'
    );
  }

  promptParts.push(
    '11. 【返回值字典】：返回值必须为 `Dict[str, Any]` 字典，且必须包含 `"status": "success"`。若返回结果包含列表，请放入具名字段（如 `"searchResults": [...]` 或 `"items": [...]`）。',
    '12. 【禁止信封伪造】：**严禁自行拼装 `execution` / `trigger` / `result` / `presentation` 等 Workflow 总结信封结构**；信封结构由上层 Workflow 编译器统一定义。',
    ''
  );

  if (config.handler === 'carbone' || steps.some((s: any) => s.type === 'carbone')) {
    promptParts.push(
      '【Carbone 渲染专项】：',
      `- 内部 API 地址：\`${getCarboneServiceUrl()}/studio/render-resolved\``,
      '- 拼接规则：必须使用环境变量 `CARBONE_EXTERNAL_URL` 作为前缀。',
      `- 默认外部基址：\`${getCarboneExternalUrl()}\``,
      '- 最终返回字典中必须包含 `downloadUrl` 字段。',
      ''
    );
  }

  if (errorContext) {
    promptParts.push(
      '【上次生成/执行失败，请修复以下问题】：',
      errorContext,
      '',
      '请根据上述错误信息修复 Activity 实现，确保可通过静态编译与 AST 分析。',
      ''
    );
  }

  promptParts.push(
    '请严格遵循以上要求，仅输出纯 Python 代码模块（包含所需 import 语句与 Activity 函数定义），不要包含 Markdown 解释说明。',
    '',
    'Activity 配置信息：',
    `- 名称：${config.name}`,
    `- 函数名：${config.fn}`,
    `- 描述：${description || '无'}`,
    `- 超时：${config.timeout || '30s'}`
  );

  if (heartbeatTimeout) {
    promptParts.push(`- 心跳超时：${heartbeatTimeout}`);
  }
  if (retryPolicy) {
    promptParts.push(`- 重试策略：最多 ${retryPolicy.maxRetries} 次`);
  }
  if (idempotencyKey) {
    promptParts.push(`- 幂等键：${idempotencyKey}`);
  }

  if (steps.length > 0) {
    promptParts.push('', `步骤内部逻辑配置（${steps.length} 个步骤）：`);
    steps.forEach((step: any, idx: number) => {
      let stepDesc = `步骤 ${idx + 1}: ${step.name || '未命名'}`;
      stepDesc += `\n  - 类型：${step.type || 'api'}`;
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
        stepDesc += `\n  - 输出格式要求：${step.formatPrompt}`;
      }
      const inputParams = normalizeInputParams(step.inputParams);
      if (inputParams.length > 0) {
        stepDesc += '\n  - 输入参数声明：';
        inputParams.forEach((param) => {
          stepDesc += `\n    - ${param.key || '未命名'} | 默认：${param.value || '无'} | ${param.required ? '必填' : '可选'}`;
        });
      }
      if (step.extraPrompt) {
        stepDesc += `\n  - 补充说明：${step.extraPrompt}`;
      }
      promptParts.push(stepDesc);
    });
  }

  return promptParts.join('\n');
}
