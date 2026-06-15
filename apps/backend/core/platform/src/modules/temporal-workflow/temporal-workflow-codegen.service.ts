import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import type { ActivityDsl, WorkflowDsl } from './temporal-workflow.types';

export interface TemporalWorkflowCodegenSupport {
  buildDeterministicWorkflowCode(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): string | null;
}

@Injectable()
export class TemporalWorkflowCodegenService {
  async generateWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean,
    support: TemporalWorkflowCodegenSupport,
    onProgress?: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts?: number; autoRetried?: boolean; generationMode?: 'deterministic' | 'ai' }> {
    const pushLog = (message: string) => {
      if (typeof onProgress === 'function') {
        onProgress(`[${new Date().toISOString()}] ${message}`);
      }
    };
    pushLog(`开始生成 Workflow 代码: ${workflowDsl.name || workflowDsl.workflowClassName || '未命名工作流'}`);

    const shouldPreferAiFix = forceAiGeneration || Boolean(errorContext?.trim());
    if (forceAiGeneration) {
      pushLog('已启用“强制 AI 生成”，跳过固定模板编译路径');
    }
    const deterministicCode = shouldPreferAiFix
      ? null
      : support.buildDeterministicWorkflowCode(workflowDsl, activityDsl);
    if (deterministicCode) {
      pushLog('命中固定模板编译路径，跳过 AI 生成');
      return {
        success: true,
        code: deterministicCode,
        attempts: 0,
        autoRetried: false,
        generationMode: 'deterministic',
      };
    }

    try {
      pushLog('未命中固定模板编译路径，进入 AI 生成');
      const aiGeneration = await this.generateWorkflowCodeViaAi(workflowDsl, activityDsl, errorContext, pushLog);
      if (!aiGeneration.success) {
        pushLog(`AI 生成失败: ${aiGeneration.error || 'unknown error'}`);
        return {
          success: false,
          error: aiGeneration.error,
          attempts: aiGeneration.attempts,
          autoRetried: aiGeneration.autoRetried,
          generationMode: 'ai',
        };
      }
      pushLog(`AI 生成完成，共尝试 ${aiGeneration.attempts} 次`);
      return {
        success: true,
        code: aiGeneration.code,
        attempts: aiGeneration.attempts,
        autoRetried: aiGeneration.autoRetried,
        generationMode: 'ai',
      };
    } catch (error: any) {
      pushLog(`生成异常: ${error.message}`);
      return { success: false, error: `生成失败: ${error.message}`, generationMode: 'ai' };
    }
  }

  async generateWorkflowCodeStreaming(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean | undefined,
    support: TemporalWorkflowCodegenSupport,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts?: number; autoRetried?: boolean; generationMode?: 'deterministic' | 'ai' }> {
    onLog(`[${new Date().toISOString()}] 准备生成 Workflow 代码流`);
    return this.generateWorkflowCode(
      workflowDsl,
      activityDsl,
      errorContext,
      Boolean(forceAiGeneration),
      support,
      onLog,
    );
  }

  private buildRepeatedStepGuidance(workflowDsl: WorkflowDsl): string[] {
    const lines: string[] = [];
    const steps = Array.isArray(workflowDsl.steps) ? workflowDsl.steps : [];

    steps.forEach((step, index) => {
      if (step?.type !== 'activity') {
        return;
      }
      const stepName = String(step.name || '').trim() || `步骤 ${index + 1}`;
      const rawInput = step.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? step.input as Record<string, any>
        : {};

      if (step.activityRef === 'builtin:httpRequest') {
        const httpConfig = rawInput.__httpRequest && typeof rawInput.__httpRequest === 'object'
          ? rawInput.__httpRequest as Record<string, any>
          : {};
        lines.push(`- ${stepName}: 这是 builtin:httpRequest 步骤，必须把 __httpRequest 编译成 Workflow 内部常量，只能用业务参数渲染 urlTemplate/queryTemplate。`);
        if (httpConfig.responseMode) {
          lines.push(`- ${stepName}: responseMode 已确认 = ${String(httpConfig.responseMode)}，代码生成时必须保持一致。`);
        }
      }

      if (step.activityRef === 'builtin:structuredTransform' || step.activityRef === 'builtin:aiStructuredTransform') {
        const transformConfig = rawInput.__structuredTransform && typeof rawInput.__structuredTransform === 'object'
          ? rawInput.__structuredTransform as Record<string, any>
          : {};
        const outputMode = String(transformConfig.outputMode || '').trim() || 'json';
        const contentType = String(transformConfig.contentType || '').trim() || 'text';
        const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
        lines.push(`- ${stepName}: 这是 ${isAiTransform ? 'builtin:aiStructuredTransform' : 'builtin:structuredTransform'} 步骤，必须把 __structuredTransform 编译成 Workflow 内部常量，且内容输入默认来自上一步结果。`);
        lines.push(`- ${stepName}: contentType 已确认 = ${contentType}，outputMode 已确认 = ${outputMode}。`);
        if (isAiTransform) {
          lines.push(`- ${stepName}: 这是 AI 转换步骤，必须保留 instructionTemplate，并显式通过共享 AI Activity 执行转换。`);
        } else {
          lines.push(`- ${stepName}: 这是固定规则转换步骤，优先使用 fieldMappings/textTemplate 等固定配置完成转换，不要在 Workflow 中自行写 AI 调用逻辑。`);
        }
        if (outputMode === 'text') {
          lines.push(`- ${stepName}: 这是文本格式化步骤，最终返回必须是纯文本，不要输出 JSON，不要使用 workflow.unsafe。`);
        } else {
          lines.push(`- ${stepName}: 这是结构化提取步骤，最终返回必须遵守 outputSchema，不要跳过字段映射。`);
        }
      }
    });

    return lines;
  }

  private buildWorkflowCodePrompt(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl, errorContext?: string): string {
    const lines: string[] = [];
    const workflowClassName = workflowDsl.workflowClassName?.trim()
      || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName = workflowDsl.workflowDefnName?.trim()
      || workflowDsl.name
      || workflowClassName;
    const workflowInputParams = workflowDsl.inputParams || {};
    const inputParamEntries = Object.entries(workflowInputParams);

    lines.push('你是一个 Temporal Python 开发专家。请根据以下 Workflow DSL 和 Activity 定义生成一个符合生产标准的 Temporal 工作流。');

    if (errorContext) {
      lines.push('');
      lines.push('【上次生成的问题（请修复）】：');
      lines.push(errorContext);
    }

    const hasCompilationError = /Compilation Error|SyntaxError|invalid syntax|IndentationError|NameError/i.test(errorContext || '');
    const hasWorkflowUnsafeError = /workflow\.unsafe|is_replaying\(\)|module temporalio\.workflow has no attribute unsafe/i.test(errorContext || '');
    if (hasCompilationError) {
      lines.push('');
      lines.push('【编译错误专项修复要求】');
      lines.push('1. 本次输出的第一优先级是生成一个可以直接通过 Python 编译的完整模块，先修复语法、缩进、括号、引号、装饰器和函数定义问题，再考虑业务细节。');
      lines.push('2. 输出内容必须从合法 Python 代码开始，开头只能是 import、from、@activity.defn、@workflow.defn、class、def、async def 之一，禁止输出任何解释、前言、Markdown 标记、残缺字符串或 JSON 片段。');
      lines.push('3. 如果上次报错发生在 activity.py 第 1 行，重点检查输出开头是否混入了代码块围栏、反引号、说明文字或截断片段。');
      lines.push('4. 严禁输出 ```、```python、`python`、`json`、`text` 等 fenced code block 标记，也不要输出类似 `json", "").replace("` 这种残缺内容。');
      lines.push('5. 生成结束前请自检：所有字符串引号、括号、方括号、花括号、三引号、f-string 与缩进块必须成对闭合。');
    }
    if (hasWorkflowUnsafeError) {
      lines.push('');
      lines.push('【workflow.unsafe 专项修复要求】');
      lines.push('1. 本次严禁输出 `workflow.unsafe`、`workflow.unsafe.is_replaying()` 或任何 replay 检测分支。');
      lines.push('2. “历史回放安全”并不意味着要手动判断 replay 状态；正确做法是让 Workflow 逻辑天然保持确定性，而不是在代码中写 replay guard。');
      lines.push('3. 不要为了避免重复日志、重复执行或版本兼容而写 `if workflow.unsafe.is_replaying(): ...`。日志可直接写，外部副作用必须放到 Activity。');
      lines.push('4. 如果你想表达“等待条件成立”，请使用 `workflow.wait_condition`；如果你想表达“执行步骤”，请直接使用 `await workflow.execute_activity(...)`。');
      lines.push('5. 如果你想表达“版本演进”，当前也不要使用 `workflow.patch()` 或 `workflow.deprecate_patch()`；先输出最简单、稳定、可回放的实现。');
    }

    lines.push('');
    lines.push('【Workflow DSL】');
    lines.push(JSON.stringify(workflowDsl, null, 2));
    lines.push('');

    const repeatedStepGuidance = this.buildRepeatedStepGuidance(workflowDsl);
    if (repeatedStepGuidance.length > 0) {
      lines.push('【已确认的内置步骤约束（请重复遵守）】');
      repeatedStepGuidance.forEach((line) => lines.push(line));
      lines.push('');
    }

    if (inputParamEntries.length > 0) {
      lines.push('【Workflow 入口参数定义（必须使用）】');
      inputParamEntries.forEach(([key, config]) => {
        lines.push(`- 参数名: ${key}; required=${config?.required ? 'true' : 'false'}; default=${config?.defaultValue ?? '<none>'}; description=${config?.description ?? '<none>'}`);
      });
      lines.push('');
    }

    lines.push('【Activity 实现指导】');
    activityDsl.activities.forEach((activity) => {
      if (activity.generatedCode) {
        lines.push(`- Activity "${activity.name}" (函数名: ${activity.fn}): 已有验证过的代码，请【原样包含】在你的 Python 输出中，不要修改其逻辑；并确保 Activity 装饰器名与函数名一致，例如 @activity.defn(name="${activity.fn}") + async def ${activity.fn}(...)。`);
        lines.push('--- 已有代码开始 ---');
        lines.push(activity.generatedCode);
        lines.push('--- 已有代码结束 ---');
      } else {
        lines.push(`- Activity "${activity.name}" (函数名: ${activity.fn}): 尚未实现，请根据 DSL 生成一个标准的 @activity.defn 实现，并强制使用 @activity.defn(name="${activity.fn}") 且函数名必须是 ${activity.fn}。`);
      }
    });

    lines.push('');
    lines.push('【必须遵守的准则】：');
    lines.push('1. 【组合输出】：你的输出必须包含所有 Activity 的实现代码（已有的或新生成的）以及 Workflow 类的定义。严禁使用任何形式的内部导入（如 `from activities import ...` 或 `from your_module import ...`），严禁使用 `workflow.unsafe`。');
    lines.push(`2. 【类名强制】：Workflow 类名必须完全等于 \`${workflowClassName}\`。`);
    lines.push(`3. 【显示名强制】：必须使用 \`@workflow.defn(name="${workflowDisplayName}")\`。`);
    lines.push('4. 【结构】：入口必须为 `async def run(self, params: dict)`，严禁为 Workflow 类定义 `__init__` 方法。');
    lines.push('5. 【参数使用强制】：如果 Workflow DSL 提供了 `inputParams`，必须在 `run()` 中从 `params` 逐项读取这些参数并用于业务流程/Activity 入参；不得忽略这些参数定义。');
    lines.push('6. 【参数校验强制】：对 `required=true` 的参数必须显式校验缺失并抛出 `ApplicationError(..., non_retryable=True)`；若配置了 `defaultValue`，读取参数时必须应用默认值。');
    lines.push('7. 【执行配置落地强制】：如果 Workflow DSL 提供了 `workflowExecutionTimeout`、`workflowRunTimeout`、`workflowTaskTimeout`，必须在生成代码中定义同名或语义等价的 `timedelta` 常量（例如 `WORKFLOW_EXECUTION_TIMEOUT`），并在 Workflow 日志中输出这些配置值，禁止忽略这些配置。');
    lines.push('8. 【确定性强制】：Workflow 代码中禁止直接做非确定性副作用（HTTP/DB/文件 I/O、系统时间、随机数、线程、进程、全局可变状态）；这些操作必须在 Activity 中完成。');
    lines.push('9. 【历史回放安全】：代码必须稳定可回放，避免根据运行时环境分支改变命令顺序；需要等待条件请用 `workflow.wait_condition`，不要 busy loop。');
    lines.push('10. 【沙箱稳定性】：如果代码涉及外部 HTTP 请求，请保持实现通用，不要在代码中写死任何业务实例、接口域名或返回值；需要兼容沙箱时，请依赖运行环境提供的 mock 请求能力。');
    lines.push('11. 【调用】：使用 `await workflow.execute_activity(activity_fn, input, start_to_close_timeout=timedelta(...))`。如果步骤 DSL 中还提供了 `scheduleToCloseTimeout` 或 `heartbeatTimeout`，也必须分别映射为 `schedule_to_close_timeout=timedelta(...)`、`heartbeat_timeout=timedelta(...)`。所有超时都必须与步骤 DSL 一致，未配置的项不要硬编码。');
    lines.push('12. 【重试策略】：优先使用 DSL 指定的 retryPolicy；未指定时再使用合理默认值，禁止无限重试。若需要显式构造 RetryPolicy，只允许使用 `from temporalio.common import RetryPolicy` 或 `import temporalio.common as temporal_common` 后调用 `temporal_common.RetryPolicy(...)`。严禁使用 `activity.RetryPolicy(...)`、`workflow.RetryPolicy(...)`、`temporalio.activity.RetryPolicy(...)` 等不存在的命名空间。');
    lines.push('13. 【重试策略最小化】：如果 DSL 没有明确要求在 `workflow.execute_activity()` 上显式传 `retry_policy=`，请优先省略，不要为了“看起来完整”额外构造 RetryPolicy。');
    lines.push('14. 【日志】：必须使用 `workflow.logger.info()` 输出关键执行阶段与参数摘要。');
    lines.push('15. 【版本演进提示】：在关键逻辑处添加简短注释，提示后续变更需考虑历史运行中的工作流回放兼容性。');
    lines.push('16. 【内置步骤配置边界】：`step.input.__httpRequest` 和 `step.input.__structuredTransform` 属于步骤内部编排配置，不属于 Workflow 对外输入参数。不要在 `run()` 中读取 `params["httpRequestStepConfig"]`、`params["structuredTransformStepConfig"]` 或任何等价的内部配置参数。');
    lines.push('17. 【内置 HTTP/结构化转换落地】：如果 DSL 中使用了 builtin:httpRequest、builtin:structuredTransform 或 builtin:aiStructuredTransform，必须把对应 step config 编译为 Workflow 内部常量或固定配置，并仅用业务输入参数去渲染模板，不要把内部 step config 透传给工作流调用者。');
    lines.push('18. 【禁止手动构造请求】：对于 builtin:httpRequest，禁止在 Workflow 中手动拼接 URL 或使用 `requests` 库。必须将 DSL 中的 `__httpRequest` 配置完整映射到 Activity 的 `activity_input` 中。Workflow 的职责仅限于渲染模板变量并调用 Activity。');
    lines.push('19. 【禁止客户端代码】：不要在生成的 Workflow 文件中引入 `temporalio.client.Client`、`temporalio.worker.Worker`，也不要在代码里主动连接 Temporal 或启动 Worker。只生成 Workflow 与 Activity 定义本身。');
    lines.push('20. 【文档下载地址】：如果 Activity 返回了 `downloadUrl`，请确保 Workflow 的最终返回结果中包含此下载地址，以便用户直接点击下载。');
    lines.push('21. 【严格禁用的 Temporal API】：严禁生成 `workflow.unsafe`、`workflow.unsafe.is_replaying()`、`workflow.patch()`、`workflow.deprecate_patch()`、`activity.RetryPolicy(...)`、`workflow.RetryPolicy(...)`、`temporalio.activity.RetryPolicy(...)`。遇到回放、版本或重试问题时，只能使用标准 `workflow` API、`workflow.execute_activity(...)` 与 `temporalio.common.RetryPolicy`。');
    lines.push('22. 【默认优先固定规则转换】：如果目标可通过字段映射、路径提取、模板拼接、文本模板实现，优先沿用 builtin:structuredTransform（固定规则版）；只有当 DSL 已明确使用 builtin:aiStructuredTransform 时，才生成 AI 转换调用路径。');
    lines.push('23. 【不要发明 replay guard】：不要写 `if workflow.unsafe.is_replaying()`、不要写任何 `is_replaying` 判断、不要为了日志或分支控制去探测 replay 状态。');
    lines.push('24. 【最终输出协议强制】：Workflow `run()` 的最终返回值必须是统一的 `WorkflowResultEnvelope` 风格字典，不能直接返回裸字符串、裸数组、裸 downloadUrl 或裸 activity result。');
    lines.push('25. 【最终输出结构强制】：最终返回值至少包含 `execution`、`trigger`、`result`、`artifacts`、`presentation` 五个顶层字段；允许字段值为 `None`，但字段结构不得缺失。');
    lines.push('26. 【execution 字段强制】：必须返回 `execution.status`，成功时使用 `"success"`，失败或取消时也要有明确状态。');
    lines.push('27. 【trigger 字段强制】：默认返回 `{"type": "manual"}`；如果 DSL 或上下文明确是定时任务，可返回 `schedule` 并补充调度信息。');
    lines.push('28. 【result 字段强制】：必须返回 `result.resultType`、`result.title`、`result.summary`、`result.businessData`。其中 `businessData` 可以直接使用最终业务结果。');
    lines.push('29. 【artifacts 字段强制】：如果任一步骤结果中存在 `downloadUrl`、`url`、文件路径或文档产物，必须提取到 `artifacts` 数组中，而不是只留在 `businessData` 里。');
    lines.push('30. 【presentation 字段强制】：必须返回 `presentation.preferAiSummary`、`presentation.preferStructuredView`、`presentation.summaryFormat`、`presentation.detailFormat`，并优先补充 `presentation.chatSummary`、`presentation.notificationSummary`、`presentation.detailText`。');
    lines.push('31. 【用户可读输出强制】：如果结果需要给用户直接阅读，必须把“简洁摘要”放进 `result.summary`，把“完整可读正文”放进 `presentation.detailText`，并用 `summaryFormat/detailFormat` 明确声明是 `plain_text` 还是 `markdown`。禁止只返回一坨原始 JSON 让前端自己猜。');
    lines.push('32. 【建议实现方式】：请在 Workflow 类中实现 `_extract_summary()`、`_extract_detail_text()`、`_collect_artifacts()`、`_build_workflow_result()` 之类的辅助方法，在 `run()` 末尾统一封装最终结果。');
    lines.push('33. 【兼容已有 activity 返回值】：如果 Activity 返回的是 `{ status, result, raw }`、`{ downloadUrl }`、`{ summary }` 或其他对象，请先归一化，再封装为 `WorkflowResultEnvelope`。不要把 activity 原始对象直接作为 Workflow 最终返回值。');
    lines.push('34. 【聊天与详情页兼容】：生成的最终输出必须让聊天窗口和执行详情页都可以直接消费，因此摘要、完整正文、业务数据和产物链接必须分层表达，不要把所有信息混在一个字符串里。');
    lines.push('35. 【文本型步骤特殊规则】：即使业务结果本身是纯文本，Workflow 最终返回也必须放到 `result.summary` / `presentation.detailText` / `result.businessData` 中，并仍返回完整 envelope。');
    lines.push('36. 【下载型步骤特殊规则】：如果结果主要是文件或文档，请在 `result.summary` 中说明“已生成结果”，并在 `artifacts` 中提供下载链接或路径。');

    if (workflowDsl.errorHandling?.type === 'saga') {
      lines.push('37. 【Saga 模式】：必须维护 compensations 列表，在失败时逆序执行补偿任务。');
    }

    if (workflowDsl.extraPrompt) {
      lines.push('');
      lines.push('【补足情报（额外指导）】：');
      lines.push(workflowDsl.extraPrompt);
    }

    lines.push('');
    lines.push('【输出】：只返回完整的 Python 代码，包含所有 import 语句。不要包含 Markdown 代码块标记。');

    return lines.join('\n');
  }

  private extractCodeFromMarkdown(content: string): string | null {
    const normalized = String(content || '').replace(/^\uFEFF/, '').trim();
    if (!normalized) {
      return null;
    }

    const codeBlockMatches = Array.from(normalized.matchAll(/```(?:python|py|json|text)?\s*([\s\S]*?)```/gi));
    for (const match of codeBlockMatches) {
      const candidate = this.sanitizeExtractedPythonCode(match[1] || '');
      if (candidate) {
        return candidate;
      }
    }

    return this.sanitizeExtractedPythonCode(normalized);
  }

  private sanitizeExtractedPythonCode(content: string): string | null {
    const normalized = String(content || '')
      .replace(/^\uFEFF/, '')
      .replace(/^```[a-z]*\s*/gi, '')
      .replace(/```$/g, '')
      .trim();

    if (!normalized) {
      return null;
    }

    const lines = normalized.split('\n');
    const firstCodeLineIndex = lines.findIndex((line) => {
      const trimmed = line.trim();
      return /^(import\s+|from\s+|@activity\.defn|@workflow\.defn|class\s+|def\s+|async\s+def\s+)/.test(trimmed)
        && !trimmed.startsWith('`')
        && !trimmed.startsWith('#');
    });

    const startLine = firstCodeLineIndex >= 0 ? firstCodeLineIndex : 0;
    const candidateLines = lines.slice(startLine);

    let lastCodeLine = candidateLines.length - 1;
    for (let i = 0; i < candidateLines.length; i += 1) {
      const line = candidateLines[i].trim();
      if (line && !line.startsWith('#') && !/^[a-zA-Z0-9_]/.test(line) && !line.startsWith('@') && !candidateLines[i].startsWith(' ')) {
        if (line.split(' ').length > 5 && !line.includes('(') && !line.includes('=') && !line.includes(':')) {
          lastCodeLine = i - 1;
          break;
        }
      }
    }

    const finalLines = candidateLines.slice(0, lastCodeLine + 1);
    const candidate = finalLines.join('\n').trim();
    if (!candidate) {
      return null;
    }

    const looksLikePythonModule = finalLines.some((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('import ')
        || trimmed.startsWith('from ')
        || trimmed.startsWith('@activity.defn')
        || trimmed.startsWith('@workflow.defn')
        || trimmed.startsWith('class ')
        || trimmed.startsWith('def ')
        || trimmed.startsWith('async def ');
    });

    if (!looksLikePythonModule) {
      return null;
    }

    return candidate;
  }

  private validateGeneratedPythonCodeShape(code: string): { success: boolean; error?: string } {
    const bannedPatterns: Array<{ pattern: RegExp; message: string }> = [
      {
        pattern: /\bactivity\.RetryPolicy\s*\(/,
        message: '检测到 `activity.RetryPolicy(...)`。Temporal Python SDK 中不存在该 API，只允许使用 `temporalio.common.RetryPolicy(...)`。',
      },
      {
        pattern: /\bworkflow\.RetryPolicy\s*\(/,
        message: '检测到 `workflow.RetryPolicy(...)`。请改为 `from temporalio.common import RetryPolicy` 后使用 `RetryPolicy(...)`。',
      },
      {
        pattern: /\btemporalio\.activity\.RetryPolicy\s*\(/,
        message: '检测到 `temporalio.activity.RetryPolicy(...)`。正确命名空间应为 `temporalio.common.RetryPolicy(...)`。',
      },
      {
        pattern: /\bfrom\s+temporalio\.activity\s+import\s+RetryPolicy\b/,
        message: '检测到 `from temporalio.activity import RetryPolicy`。正确导入应为 `from temporalio.common import RetryPolicy`。',
      },
      {
        pattern: /\bworkflow\.unsafe\b/,
        message: '检测到 `workflow.unsafe`。生成的 Workflow 禁止依赖 `workflow.unsafe`，请仅使用标准的 `workflow` API 与 `workflow.execute_activity(...)`。',
      },
    ];

    for (const rule of bannedPatterns) {
      if (rule.pattern.test(code)) {
        return { success: false, error: rule.message };
      }
    }

    return { success: true };
  }

  private validateGeneratedWorkflowOutputContract(code: string): { success: boolean; error?: string } {
    const requiredFields = ['execution', 'trigger', 'result', 'artifacts', 'presentation'];
    const missingFields = requiredFields.filter((field) => {
      const pattern = new RegExp(`["']${field}["']\\s*:`);
      return !pattern.test(code);
    });

    if (missingFields.length > 0) {
      return {
        success: false,
        error: `Workflow 最终输出缺少统一结果协议字段: ${missingFields.join(', ')}。最终返回值必须是 WorkflowResultEnvelope。`,
      };
    }

    const hasWorkflowResultBuilder = /def\s+_build_workflow_result\s*\(/.test(code);
    const hasEnvelopeReturn = /return\s+\{[\s\S]*["']execution["']\s*:[\s\S]*["']presentation["']\s*:/.test(code)
      || /return\s+self\._build_workflow_result\s*\(/.test(code)
      || /return\s+cls\._build_workflow_result\s*\(/.test(code);

    if (!hasWorkflowResultBuilder && !hasEnvelopeReturn) {
      return {
        success: false,
        error: 'Workflow 代码未检测到统一结果封装逻辑。请实现 `_build_workflow_result()` 或在 `run()` 末尾直接返回包含 execution/trigger/result/artifacts/presentation 的字典。',
      };
    }

    const requiredPresentationFields = ['preferAiSummary', 'preferStructuredView', 'summaryFormat', 'detailFormat'];
    const missingPresentationFields = requiredPresentationFields.filter((field) => {
      const pattern = new RegExp(`["']${field}["']\\s*:`);
      return !pattern.test(code);
    });

    if (missingPresentationFields.length > 0) {
      return {
        success: false,
        error: `Workflow presentation 字段缺失: ${missingPresentationFields.join(', ')}。请明确声明可读文本格式，避免前端猜测渲染方式。`,
      };
    }

    return { success: true };
  }

  private buildSdkViolationRepairContext(errorMessage: string): string {
    const normalized = String(errorMessage || '').trim();
    if (!normalized) {
      return 'AI 生成的代码违反 Temporal Python SDK 约束，请重新生成。';
    }
    if (/workflow\.unsafe|is_replaying\(\)/i.test(normalized)) {
      return [
        'AI 生成的代码违反 Temporal Python SDK 约束，请根据以下问题重新生成完整代码：',
        normalized,
        '',
        '强制修复要求：',
        '1. 删除所有 `workflow.unsafe`、`workflow.unsafe.is_replaying()`、`is_replaying` 相关分支。',
        '2. 不要为了“历史回放安全”手动判断 replay；直接保持 Workflow 逻辑确定性即可。',
        '3. 不要使用 `workflow.patch()`、`workflow.deprecate_patch()` 作为替代方案。',
        '4. 日志可直接保留；外部副作用必须放在 Activity 中，而不是依赖 replay guard。',
        '5. 最终代码只能使用标准 `workflow` API、`await workflow.execute_activity(...)`、`workflow.wait_condition(...)` 等安全接口。',
      ].join('\n');
    }
    return `AI 生成的代码违反 Temporal Python SDK 约束，请根据以下问题重新生成完整代码：\n${normalized}`;
  }

  private buildWorkflowOutputContractRepairContext(errorMessage: string): string {
    const normalized = String(errorMessage || '').trim();
    return [
      'AI 生成的 Workflow 最终输出不符合统一结果协议，请根据以下问题重新生成完整代码：',
      normalized || '缺少 WorkflowResultEnvelope 输出结构。',
      '',
      '强制修复要求：',
      '1. `run()` 的最终返回值必须是 WorkflowResultEnvelope 风格字典，而不是裸字符串、裸数组或裸 activity result。',
      '2. 最终返回值必须包含 `execution`、`trigger`、`result`、`artifacts`、`presentation` 五个顶层字段。',
      '3. 请在 Workflow 类中实现 `_extract_summary()`、`_extract_detail_text()`、`_collect_artifacts()`、`_build_workflow_result()` 之类的辅助方法，并在 `run()` 末尾统一调用。',
      '4. `result` 中必须包含 `resultType`、`title`、`summary`、`businessData`。',
      '5. 若存在下载链接、文档或文件路径，必须提取到 `artifacts` 数组中。',
      '6. `presentation` 中必须包含 `preferAiSummary`、`preferStructuredView`、`summaryFormat`、`detailFormat`，并优先补充 `chatSummary`、`notificationSummary`、`detailText`。',
    ].join('\n');
  }

  private async generateWorkflowCodeViaAi(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    initialErrorContext?: string,
    onProgress?: (log: string) => void,
  ): Promise<{ success: boolean; code?: string; error?: string; attempts: number; autoRetried: boolean }> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    let errorContext = initialErrorContext;
    let attempts = 0;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      attempts += 1;
      onProgress?.(`[${new Date().toISOString()}] 开始第 ${attempts} 次 AI 代码生成`);
      const prompt = this.buildWorkflowCodePrompt(workflowDsl, activityDsl, errorContext);
      const response = await axios.post<{ result: string }>(`${aiOrchestratorUrl}/ai/model/call`, {
        modelId: 'default',
        prompt,
      }, { timeout: 180000 });
      onProgress?.(`[${new Date().toISOString()}] AI 已返回候选代码，开始提取与静态检查`);

      const content = response.data?.result || '';
      const code = this.extractCodeFromMarkdown(content);
      if (!code) {
        onProgress?.(`[${new Date().toISOString()}] AI 输出中未提取到有效 Python 代码`);
        if (attempt === 0) {
          errorContext = this.mergeErrorContext(
            initialErrorContext,
            'AI 返回内容中未提取到有效 Python 代码。请只输出完整 Python 模块，不要包含 Markdown、解释、JSON 或残缺片段。',
          );
          continue;
        }
        return { success: false, error: 'AI 未能生成有效代码', attempts, autoRetried: attempts > 1 };
      }

      const codeShapeCheck = this.validateGeneratedPythonCodeShape(code);
      if (!codeShapeCheck.success) {
        onProgress?.(`[${new Date().toISOString()}] 静态约束检查失败: ${codeShapeCheck.error}`);
        if (attempt === 0) {
          errorContext = this.mergeErrorContext(
            initialErrorContext,
            this.buildSdkViolationRepairContext(codeShapeCheck.error || ''),
          );
          continue;
        }
        return {
          success: false,
          error: `AI 生成的代码违反 Temporal Python SDK 约束: ${codeShapeCheck.error}`,
          attempts,
          autoRetried: attempts > 1,
        };
      }

      const outputContractCheck = this.validateGeneratedWorkflowOutputContract(code);
      if (!outputContractCheck.success) {
        onProgress?.(`[${new Date().toISOString()}] Workflow output contract 检查失败: ${outputContractCheck.error}`);
        if (attempt === 0) {
          errorContext = this.mergeErrorContext(
            initialErrorContext,
            this.buildWorkflowOutputContractRepairContext(outputContractCheck.error || ''),
          );
          continue;
        }
        return {
          success: false,
          error: `AI 生成的代码未满足 WorkflowResultEnvelope 输出协议: ${outputContractCheck.error}`,
          attempts,
          autoRetried: attempts > 1,
        };
      }

      const compilationCheck = this.precompileGeneratedPython(code);
      if (compilationCheck.success) {
        onProgress?.(`[${new Date().toISOString()}] Python 编译预检查通过`);
        return { success: true, code, attempts, autoRetried: attempts > 1 };
      }

      onProgress?.(`[${new Date().toISOString()}] Python 编译预检查失败: ${compilationCheck.error}`);
      if (attempt === 0) {
        errorContext = this.mergeErrorContext(
          initialErrorContext,
          `AI 生成的代码未通过 Python 编译预检查，请根据以下错误重新生成完整代码：\n${compilationCheck.error}`,
        );
        continue;
      }

      return {
        success: false,
        error: `AI 生成的代码未通过 Python 编译预检查: ${compilationCheck.error}`,
        attempts,
        autoRetried: attempts > 1,
      };
    }

    return { success: false, error: 'AI 未能生成有效代码', attempts, autoRetried: attempts > 1 };
  }

  private mergeErrorContext(baseContext: string | undefined, appendedContext: string): string {
    const base = String(baseContext || '').trim();
    const extra = String(appendedContext || '').trim();
    if (!base) {
      return extra;
    }
    if (!extra) {
      return base;
    }
    return `${base}\n\n${extra}`;
  }

  private precompileGeneratedPython(code: string): { success: boolean; error?: string } {
    const tempDir = mkdtempSync(join(tmpdir(), 'ops-workflow-compile-'));
    const tempFile = join(tempDir, 'generated_workflow.py');

    try {
      writeFileSync(tempFile, code, 'utf-8');
      const result = spawnSync(
        'python3',
        [
          '-c',
          [
            'import pathlib',
            'import sys',
            'source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")',
            'compile(source, sys.argv[1], "exec")',
          ].join('\n'),
          tempFile,
        ],
        {
          encoding: 'utf-8',
          timeout: 15000,
        },
      );

      if (result.error) {
        return { success: false, error: `python3 不可用或执行失败: ${result.error.message}` };
      }

      if (result.status === 0) {
        return { success: true };
      }

      const error = String(result.stderr || result.stdout || 'unknown compile error').trim();
      return { success: false, error };
    } catch (error: any) {
      return { success: false, error: error.message || 'unknown compile error' };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
