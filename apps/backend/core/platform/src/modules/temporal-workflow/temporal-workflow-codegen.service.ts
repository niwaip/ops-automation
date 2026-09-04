import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { buildV2OutputResultBuilderLines } from './temporal-workflow-result-builder.helpers';
import type { ActivityDsl, WorkflowDsl } from './temporal-workflow.types';

export interface TemporalWorkflowCodegenSupport {
  buildDeterministicWorkflowCode(workflowDsl: WorkflowDsl, activityDsl: ActivityDsl): string | null;
  diagnoseDeterministicMiss?(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl
  ): { code: string; message: string };
}

export interface PythonGate1Violation {
  line: number;
  code: string;
  message: string;
}

export interface PythonGate1CheckResult {
  success: boolean;
  error?: string;
  violations: PythonGate1Violation[];
  /** Non-authoritative regex warnings (per §10.2: 正则可以作为快速提示，但不能作为发布裁决). */
  hintWarnings?: string[];
}

/**
 * Gate 1 (§10.2) inline Python AST analyzer — the authoritative static-analysis
 * arbiter for generated workflow code. Executed via `python3 -c` with the
 * generated code path as argv[1] and the DSL-declared required v2Output field
 * names as argv[2] (JSON array). Prints a single JSON line to stdout:
 * `{"success": bool, "errors": [{"line", "code", "message"}]}`.
 *
 * Stages: 1) ast.parse + compile; 2) import whitelist (three tiers per §10.2);
 * 3) locate the @workflow.defn class; 4) Workflow determinism bans (network,
 * file, DB, time, random, concurrency, workflow.unsafe, eval/exec, SDK API
 * misuse) — external I/O inside Activity code is allowed and untouched;
 * 5) Result Builder return check + envelope keys + required v2Output fields.
 */
const PYTHON_AST_GATE_SCRIPT = `
import ast
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")

required_v2_fields = []
if len(sys.argv) > 2:
    try:
        parsed = json.loads(sys.argv[2])
        if isinstance(parsed, list):
            required_v2_fields = [str(f) for f in parsed]
    except Exception:
        pass

errors = []
seen = set()


def add_error(line, code, message):
    key = (line, code)
    if key in seen:
        return
    seen.add(key)
    errors.append({"line": line, "code": code, "message": message})


def finish():
    print(json.dumps({"success": len(errors) == 0, "errors": errors}, ensure_ascii=False))
    sys.exit(0)


# ---------- Stage 1: syntax ----------
try:
    tree = ast.parse(source, filename=sys.argv[1])
except SyntaxError as exc:
    add_error(exc.lineno or 1, "SYNTAX_ERROR", "Python 语法错误: %s" % (exc.msg or str(exc)))
    finish()

try:
    compile(source, sys.argv[1], "exec")
except Exception as exc:
    add_error(1, "SYNTAX_ERROR", "Python 编译失败: %s" % str(exc))
    finish()

# ---------- Stage 2: import whitelist ----------
TIER_A_STDLIB = {
    "typing", "dataclasses", "datetime", "json", "math", "re", "enum",
    "collections", "functools", "itertools", "copy", "textwrap", "hashlib",
    "base64", "uuid", "string",
}
TIER_A_TEMPORAL = {"temporalio"}
TIER_A_PLATFORM = {
    "workflow_result_builder", "schema_assertions", "platform_errors", "platform_dtos",
}
# Activity-side dependencies are allowed at import level (their sandbox
# restriction is a runtime concern); usage inside Workflow code is banned
# in Stage 4.
TIER_B_ACTIVITY = {
    "os", "requests", "urllib", "subprocess", "socket", "http", "httpx",
    "aiohttp", "sqlite3", "psycopg2", "mysql", "redis", "pymongo", "time",
    "random", "secrets", "threading", "multiprocessing", "asyncio", "pathlib",
    "shutil", "tempfile", "csv", "ssl", "signal", "glob", "sys", "boto3",
    "smtplib", "email",
}
ALLOWED_IMPORTS = TIER_A_STDLIB | TIER_A_TEMPORAL | TIER_A_PLATFORM | TIER_B_ACTIVITY
SDK_FROM_IMPORTS_BANNED = {("temporalio.activity", "RetryPolicy")}

for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            root = alias.name.split(".")[0]
            if root not in ALLOWED_IMPORTS:
                add_error(node.lineno, "IMPORT_BANNED",
                          "导入模块 '%s' 不在白名单内（允许: 标准库确定性子集、temporalio.*、平台 SDK）。" % alias.name)
    elif isinstance(node, ast.ImportFrom):
        module = node.module or ""
        root = module.split(".")[0]
        if root not in ALLOWED_IMPORTS:
            add_error(node.lineno, "IMPORT_BANNED",
                      "导入模块 '%s' 不在白名单内（允许: 标准库确定性子集、temporalio.*、平台 SDK）。" % module)
        for alias in node.names:
            if (module, alias.name) in SDK_FROM_IMPORTS_BANNED:
                add_error(node.lineno, "WORKFLOW_SDK_API",
                          "temporalio.activity 不存在 RetryPolicy；RetryPolicy 属于 temporalio.common。")

# ---------- Stage 3: locate the workflow class ----------
def is_workflow_defn_class(node):
    if not isinstance(node, ast.ClassDef):
        return False
    for dec in node.decorator_list:
        target = dec.func if isinstance(dec, ast.Call) else dec
        if isinstance(target, ast.Attribute) and target.attr == "defn":
            base = target.value
            if isinstance(base, ast.Name) and base.id == "workflow":
                return True
            if isinstance(base, ast.Attribute) and base.attr == "workflow":
                return True
    return False


workflow_class = None
for node in tree.body:
    if is_workflow_defn_class(node):
        workflow_class = node
        break

if workflow_class is None:
    add_error(1, "WORKFLOW_CLASS_MISSING", "未检测到 @workflow.defn 装饰的 Workflow 类。")
    finish()

# ---------- Stage 4: Workflow determinism bans ----------
BANNED_EXACT = {
    "time.sleep": "WORKFLOW_NON_DETERMINISTIC",
    "time.time": "WORKFLOW_NON_DETERMINISTIC",
    "time.time_ns": "WORKFLOW_NON_DETERMINISTIC",
    "time.monotonic": "WORKFLOW_NON_DETERMINISTIC",
    "time.monotonic_ns": "WORKFLOW_NON_DETERMINISTIC",
    "time.perf_counter": "WORKFLOW_NON_DETERMINISTIC",
    "time.perf_counter_ns": "WORKFLOW_NON_DETERMINISTIC",
    "time.gmtime": "WORKFLOW_NON_DETERMINISTIC",
    "time.localtime": "WORKFLOW_NON_DETERMINISTIC",
    "time.strftime": "WORKFLOW_NON_DETERMINISTIC",
    "time.strptime": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.now": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.utcnow": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.today": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.datetime.now": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.datetime.utcnow": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.datetime.today": "WORKFLOW_NON_DETERMINISTIC",
    "datetime.date.today": "WORKFLOW_NON_DETERMINISTIC",
    "uuid.uuid4": "WORKFLOW_NON_DETERMINISTIC",
    "uuid.uuid1": "WORKFLOW_NON_DETERMINISTIC",
    "workflow.unsafe": "WORKFLOW_UNSAFE",
    "workflow.unsafe.is_replaying": "WORKFLOW_UNSAFE",
    "activity.RetryPolicy": "WORKFLOW_SDK_API",
    "workflow.RetryPolicy": "WORKFLOW_SDK_API",
    "temporalio.activity.RetryPolicy": "WORKFLOW_SDK_API",
}
BANNED_PREFIX = {
    "os.": "WORKFLOW_SYSTEM_IO",
    "subprocess.": "WORKFLOW_PROCESS",
    "socket.": "WORKFLOW_NETWORK",
    "requests.": "WORKFLOW_NETWORK",
    "urllib.request.": "WORKFLOW_NETWORK",
    "http.client.": "WORKFLOW_NETWORK",
    "httpx.": "WORKFLOW_NETWORK",
    "aiohttp.": "WORKFLOW_NETWORK",
    "sqlite3.": "WORKFLOW_DATABASE",
    "psycopg2.": "WORKFLOW_DATABASE",
    "mysql.": "WORKFLOW_DATABASE",
    "redis.": "WORKFLOW_DATABASE",
    "pymongo.": "WORKFLOW_DATABASE",
    "threading.": "WORKFLOW_CONCURRENCY",
    "multiprocessing.": "WORKFLOW_CONCURRENCY",
    "asyncio.": "WORKFLOW_CONCURRENCY",
    "random.": "WORKFLOW_NON_DETERMINISTIC",
    "secrets.": "WORKFLOW_NON_DETERMINISTIC",
    "shutil.": "WORKFLOW_FILE_IO",
    "tempfile.": "WORKFLOW_FILE_IO",
    "csv.": "WORKFLOW_FILE_IO",
    "pathlib.": "WORKFLOW_FILE_IO",
    "signal.": "WORKFLOW_SYSTEM_IO",
    "glob.": "WORKFLOW_FILE_IO",
}


def dotted(node):
    parts = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    return ".".join(reversed(parts))


for node in ast.walk(workflow_class):
    if isinstance(node, ast.Attribute):
        name = dotted(node)
        code = BANNED_EXACT.get(name)
        if code is None:
            for prefix, pcode in BANNED_PREFIX.items():
                if name.startswith(prefix):
                    code = pcode
                    break
        if code is not None:
            add_error(node.lineno, code,
                      "Workflow 代码禁止使用 '%s'（外部副作用/非确定性操作必须封装在 @activity.defn Activity 中）。" % name)
    if isinstance(node, ast.Call):
        func = node.func
        if isinstance(func, ast.Name) and func.id == "open":
            add_error(node.lineno, "WORKFLOW_FILE_IO",
                      "Workflow 代码禁止直接访问文件系统（open()）。文件操作必须放在 @activity.defn 中。")
        if isinstance(func, ast.Name) and func.id in ("eval", "exec"):
            add_error(node.lineno, "WORKFLOW_DYNAMIC_EVAL", "Workflow 代码禁止动态执行 eval()/exec()。")

# ---------- Stage 5: Result Builder return + envelope ----------
ENVELOPE_KEYS = {"execution", "trigger", "result", "artifacts", "presentation"}


def is_envelope_dict(node):
    if not isinstance(node, ast.Dict):
        return False
    keys = set()
    for k in node.keys:
        if isinstance(k, ast.Constant) and isinstance(k.value, str):
            keys.add(k.value)
    return ENVELOPE_KEYS.issubset(keys)


def is_build_result_call(node):
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    if isinstance(func, ast.Attribute) and func.attr == "_build_workflow_result":
        base = func.value
        if isinstance(base, ast.Name) and base.id in ("self", "cls"):
            return True
    return False


def find_method(cls_node, name):
    for node in cls_node.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    return None


run_method = find_method(workflow_class, "run")
if run_method is None:
    add_error(workflow_class.lineno, "MISSING_RESULT_BUILDER", "Workflow 类缺少 run() 方法。")
else:
    class ReturnProbe(ast.NodeVisitor):
        def __init__(self):
            self.bad = []

        def visit_FunctionDef(self, node):
            if node is not run_method:
                return
            self.generic_visit(node)

        def visit_AsyncFunctionDef(self, node):
            if node is not run_method:
                return
            self.generic_visit(node)

        def visit_Return(self, node):
            if node.value is None:
                return
            if not (is_build_result_call(node.value) or is_envelope_dict(node.value)):
                self.bad.append(node.lineno)

    probe = ReturnProbe()
    probe.visit(run_method)
    if probe.bad:
        add_error(probe.bad[0], "RETURN_NOT_ENVELOPE",
                  "run() 的返回值必须是 _build_workflow_result(...) 或包含 execution/trigger/result/artifacts/presentation 五个顶层字段的信封字典。")

builder_method = find_method(workflow_class, "_build_workflow_result")
envelope_found = False
if builder_method is not None:
    for node in ast.walk(builder_method):
        if is_envelope_dict(node):
            envelope_found = True
            break
    if not envelope_found:
        add_error(builder_method.lineno, "ENVELOPE_INCOMPLETE",
                  "_build_workflow_result() 的信封缺少 execution/trigger/result/artifacts/presentation 之一。")

if required_v2_fields:
    if builder_method is None:
        add_error(workflow_class.lineno, "MISSING_V2_OUTPUT_FIELD",
                  "v2Output 声明了必填输出字段，但缺少 _build_workflow_result()。")
    else:
        present = set()
        for node in ast.walk(builder_method):
            if isinstance(node, ast.Dict):
                for k in node.keys:
                    if isinstance(k, ast.Constant) and isinstance(k.value, str):
                        present.add(k.value)
        missing = [f for f in required_v2_fields if f not in present]
        if missing:
            add_error(builder_method.lineno, "MISSING_V2_OUTPUT_FIELD",
                      "v2Output 必填输出字段未在 Result Builder 中映射: %s" % ", ".join(missing))

finish()
`;

const AST_GATE_REPAIR_GUIDANCE: Record<string, string> = {
  IMPORT_BANNED: '删除该导入，或改用白名单内模块（标准库确定性子集、temporalio.*、平台 SDK）。',
  WORKFLOW_NETWORK: '将网络调用封装进 @activity.defn Activity，Workflow 内只能 await workflow.execute_activity(...)。',
  WORKFLOW_FILE_IO: '将文件操作封装进 @activity.defn Activity。',
  WORKFLOW_DATABASE: '将数据库访问封装进 @activity.defn Activity。',
  WORKFLOW_SYSTEM_IO: 'Workflow 内禁止访问系统环境与 IO；环境变量读取放在 Activity 中。',
  WORKFLOW_PROCESS: '禁止在 Workflow 内启动子进程；进程调用放入 Activity。',
  WORKFLOW_NON_DETERMINISTIC: '删除系统时间/随机数调用；时间延迟必须使用 workflow.sleep(timedelta(...))，时间戳使用 workflow 提供的确定性 API。',
  WORKFLOW_CONCURRENCY: 'Workflow 内禁止线程/进程/事件循环；并发由 Temporal 引擎管理。',
  WORKFLOW_UNSAFE: '删除 workflow.unsafe 及其相关分支；不要手动判断 is_replaying，保持 Workflow 逻辑确定性即可。',
  WORKFLOW_SDK_API: '使用正确的 Temporal SDK API；RetryPolicy 属于 temporalio.common。',
  WORKFLOW_DYNAMIC_EVAL: '禁止 eval/exec 动态执行代码。',
  WORKFLOW_CLASS_MISSING: '模块必须包含 @workflow.defn 装饰的 Workflow 类。',
  MISSING_RESULT_BUILDER: '实现 _build_workflow_result() 并在 run() 末尾统一调用。',
  RETURN_NOT_ENVELOPE: 'run() 最终返回值必须是 _build_workflow_result(...) 或包含 execution/trigger/result/artifacts/presentation 的信封字典。',
  ENVELOPE_INCOMPLETE: '_build_workflow_result() 必须返回包含 execution/trigger/result/artifacts/presentation 五个顶层字段的信封。',
  MISSING_V2_OUTPUT_FIELD: 'v2Output 声明的必填输出字段必须在 Result Builder 中逐字段映射产出。',
  SYNTAX_ERROR: '修正 Python 语法/编译错误后重新生成完整代码。',
};

@Injectable()
export class TemporalWorkflowCodegenService {
  async generateWorkflowCode(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext: string | undefined,
    forceAiGeneration: boolean,
    support: TemporalWorkflowCodegenSupport,
    onProgress?: (log: string) => void
  ): Promise<{
    success: boolean;
    code?: string;
    error?: string;
    attempts?: number;
    autoRetried?: boolean;
    generationMode?: 'deterministic' | 'ai';
  }> {
    const pushLog = (message: string) => {
      if (typeof onProgress === 'function') {
        onProgress(`[${new Date().toISOString()}] ${message}`);
      }
    };
    pushLog(
      `开始生成 Workflow 代码: ${workflowDsl.name || workflowDsl.workflowClassName || '未命名工作流'}`
    );

    const shouldPreferAiFix = forceAiGeneration || Boolean(errorContext?.trim());
    if (forceAiGeneration) {
      pushLog('已启用“强制 AI 生成”，跳过固定模板编译路径');
    }
    // DSL 编译期硬校验（§8.2）：buildDeterministicWorkflowCode 对不可解析的
    // v2Output 字段 fail-closed 抛错，这里转成生成失败结果而不是让异常冒泡。
    let deterministicCode: string | null = null;
    try {
      deterministicCode = shouldPreferAiFix
        ? null
        : support.buildDeterministicWorkflowCode(workflowDsl, activityDsl);
    } catch (error: any) {
      pushLog(`DSL 编译失败: ${error.message}`);
      return {
        success: false,
        error: `DSL 编译失败: ${error.message}`,
        generationMode: 'deterministic',
      };
    }
    if (deterministicCode) {
      pushLog('命中固定模板编译路径，跳过 AI 生成');
      const gate1Check = this.validateGeneratedPythonCodeGate1(deterministicCode, workflowDsl);
      if (!gate1Check.success) {
        pushLog(`Gate 1 静态分析失败: ${gate1Check.error || ''}`);
        return {
          success: false,
          error: `确定性代码未通过 Gate 1 静态分析: ${gate1Check.error}`,
          generationMode: 'deterministic',
        };
      }
      for (const warning of gate1Check.hintWarnings || []) {
        pushLog(warning);
      }
      pushLog('Gate 1 静态分析通过');
      return {
        success: true,
        code: deterministicCode,
        attempts: 0,
        autoRetried: false,
        generationMode: 'deterministic',
      };
    }

    try {
      const miss = support.diagnoseDeterministicMiss?.(workflowDsl, activityDsl);
      pushLog(
        miss
          ? `确定性骨架未命中 [${miss.code}]: ${miss.message}，进入受约束 AI 生成`
          : '未命中固定模板编译路径，进入 AI 生成'
      );
      const aiGeneration = await this.generateWorkflowCodeViaAi(
        workflowDsl,
        activityDsl,
        errorContext,
        pushLog
      );
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
    onLog: (log: string) => void
  ): Promise<{
    success: boolean;
    code?: string;
    error?: string;
    attempts?: number;
    autoRetried?: boolean;
    generationMode?: 'deterministic' | 'ai';
  }> {
    onLog(`[${new Date().toISOString()}] 准备生成 Workflow 代码流`);
    return this.generateWorkflowCode(
      workflowDsl,
      activityDsl,
      errorContext,
      Boolean(forceAiGeneration),
      support,
      onLog
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
      const rawInput =
        step.input && typeof step.input === 'object' && !Array.isArray(step.input)
          ? (step.input as Record<string, any>)
          : {};

      if (step.activityRef === 'builtin:httpRequest') {
        const httpConfig =
          rawInput.__httpRequest && typeof rawInput.__httpRequest === 'object'
            ? (rawInput.__httpRequest as Record<string, any>)
            : {};
        lines.push(
          `- ${stepName}: 这是 builtin:httpRequest 步骤，必须把 __httpRequest 编译成 Workflow 内部常量，只能用业务参数渲染 urlTemplate/queryTemplate。`
        );
        if (httpConfig.responseMode) {
          lines.push(
            `- ${stepName}: responseMode 已确认 = ${String(httpConfig.responseMode)}，代码生成时必须保持一致。`
          );
        }
      }

      if (
        step.activityRef === 'builtin:structuredTransform' ||
        step.activityRef === 'builtin:aiStructuredTransform'
      ) {
        const transformConfig =
          rawInput.__structuredTransform && typeof rawInput.__structuredTransform === 'object'
            ? (rawInput.__structuredTransform as Record<string, any>)
            : {};
        const outputMode = String(transformConfig.outputMode || '').trim() || 'json';
        const contentType = String(transformConfig.contentType || '').trim() || 'text';
        const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
        lines.push(
          `- ${stepName}: 这是 ${isAiTransform ? 'builtin:aiStructuredTransform' : 'builtin:structuredTransform'} 步骤，必须把 __structuredTransform 编译成 Workflow 内部常量，且内容输入默认来自上一步结果。`
        );
        lines.push(
          `- ${stepName}: contentType 已确认 = ${contentType}，outputMode 已确认 = ${outputMode}。`
        );
        if (isAiTransform) {
          lines.push(
            `- ${stepName}: 这是 AI 转换步骤，必须保留 instructionTemplate，并显式通过共享 AI Activity 执行转换。`
          );
        } else {
          lines.push(
            `- ${stepName}: 这是固定规则转换步骤，优先使用 fieldMappings/textTemplate 等固定配置完成转换，不要在 Workflow 中自行写 AI 调用逻辑。`
          );
        }
        if (outputMode === 'text') {
          lines.push(
            `- ${stepName}: 这是文本格式化步骤，最终返回必须是纯文本，不要输出 JSON，不要使用 workflow.unsafe。`
          );
        } else {
          lines.push(
            `- ${stepName}: 这是结构化提取步骤，最终返回必须遵守 outputSchema，不要跳过字段映射。`
          );
        }
      }
    });

    return lines;
  }

  private buildWorkflowCodePrompt(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    errorContext?: string,
    activityCodeAlreadyGenerated = false
  ): string {
    const lines: string[] = [];
    const workflowClassName =
      workflowDsl.workflowClassName?.trim() ||
      `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
    const workflowDisplayName =
      workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
    const workflowInputParams = workflowDsl.inputParams || {};
    const inputParamEntries = Object.entries(workflowInputParams);

    lines.push(
      '你是一个 Temporal Python 开发专家。请根据以下 Workflow DSL 和 Activity 定义生成一个符合生产标准的 Temporal 工作流。'
    );

    if (errorContext) {
      lines.push('');
      lines.push('【上次生成的问题（请修复）】：');
      lines.push(errorContext);
    }

    const hasCompilationError =
      /Compilation Error|SyntaxError|invalid syntax|IndentationError|NameError/i.test(
        errorContext || ''
      );
    const hasWorkflowUnsafeError =
      /workflow\.unsafe|is_replaying\(\)|module temporalio\.workflow has no attribute unsafe/i.test(
        errorContext || ''
      );
    if (hasCompilationError) {
      lines.push('');
      lines.push('【编译错误专项修复要求】');
      lines.push(
        '1. 本次输出的第一优先级是生成一个可以直接通过 Python 编译的完整模块，先修复语法、缩进、括号、引号、装饰器和函数定义问题，再考虑业务细节。'
      );
      lines.push(
        '2. 输出内容必须从合法 Python 代码开始，开头只能是 import、from、@activity.defn、@workflow.defn、class、def、async def 之一，禁止输出任何解释、前言、Markdown 标记、残缺字符串或 JSON 片段。'
      );
      lines.push(
        '3. 如果上次报错发生在 activity.py 第 1 行，重点检查输出开头是否混入了代码块围栏、反引号、说明文字或截断片段。'
      );
      lines.push(
        '4. 严禁输出 ```、```python、`python`、`json`、`text` 等 fenced code block 标记，也不要输出类似 `json", "").replace("` 这种残缺内容。'
      );
      lines.push(
        '5. 生成结束前请自检：所有字符串引号、括号、方括号、花括号、三引号、f-string 与缩进块必须成对闭合。'
      );
    }
    if (hasWorkflowUnsafeError) {
      lines.push('');
      lines.push('【workflow.unsafe 专项修复要求】');
      lines.push(
        '1. 本次严禁输出 `workflow.unsafe`、`workflow.unsafe.is_replaying()` 或任何 replay 检测分支。'
      );
      lines.push(
        '2. “历史回放安全”并不意味着要手动判断 replay 状态；正确做法是让 Workflow 逻辑天然保持确定性，而不是在代码中写 replay guard。'
      );
      lines.push(
        '3. 不要为了避免重复日志、重复执行或版本兼容而写 `if workflow.unsafe.is_replaying(): ...`。日志可直接写，外部副作用必须放到 Activity。'
      );
      lines.push(
        '4. 如果你想表达“等待条件成立”，请使用 `workflow.wait_condition`；如果你想表达“执行步骤”，请直接使用 `await workflow.execute_activity(...)`。'
      );
      lines.push(
        '5. 如果你想表达“版本演进”，当前也不要使用 `workflow.patch()` 或 `workflow.deprecate_patch()`；先输出最简单、稳定、可回放的实现。'
      );
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
        lines.push(
          `- 参数名: ${key}; required=${config?.required ? 'true' : 'false'}; default=${config?.defaultValue ?? '<none>'}; description=${config?.description ?? '<none>'}`
        );
      });
      lines.push('');
    }

    lines.push('【Activity 实现指导】');
    if (activityCodeAlreadyGenerated) {
      lines.push(
        '【重要】以下所有 Activity 的实现代码均已生成并通过校验。你的唯一任务是编写 Workflow 胶水代码：Workflow 类、`run()` 方法体中对这些 Activity 的依次调用、步骤入参渲染与最终结果封装。严禁修改、重写、删除或重新生成任何 Activity 代码。'
      );
      lines.push('');
    }
    activityDsl.activities.forEach((activity) => {
      if (activity.generatedCode) {
        lines.push(
          `- Activity "${activity.name}" (函数名: ${activity.fn}): 已有验证过的代码，请【原样包含】在你的 Python 输出中，不要修改其逻辑；并确保 Activity 装饰器名与函数名一致，例如 @activity.defn(name="${activity.fn}") + async def ${activity.fn}(...)。`
        );
        lines.push('--- 已有代码开始 ---');
        lines.push(activity.generatedCode);
        lines.push('--- 已有代码结束 ---');
      } else {
        lines.push(
          `- Activity "${activity.name}" (函数名: ${activity.fn}): 尚未实现，请根据 DSL 生成一个标准的 @activity.defn 实现，并强制使用 @activity.defn(name="${activity.fn}") 且函数名必须是 ${activity.fn}。`
        );
      }
    });

    lines.push('');
    lines.push('【必须遵守的准则】：');
    lines.push(
      activityCodeAlreadyGenerated
        ? '1. 【组合输出】：你的输出必须【原样包含】上方已有的全部 Activity 实现代码，并加上你编写的 Workflow 类定义。严禁修改已有 Activity 代码、严禁使用任何形式的内部导入（如 `from activities import ...` 或 `from your_module import ...`），严禁使用 `workflow.unsafe`。'
        : '1. 【组合输出】：你的输出必须包含所有 Activity 的实现代码（已有的或新生成的）以及 Workflow 类的定义。严禁使用任何形式的内部导入（如 `from activities import ...` 或 `from your_module import ...`），严禁使用 `workflow.unsafe`。'
    );
    lines.push(`2. 【类名强制】：Workflow 类名必须完全等于 \`${workflowClassName}\`。`);
    lines.push(`3. 【显示名强制】：必须使用 \`@workflow.defn(name="${workflowDisplayName}")\`。`);
    lines.push(
      '4. 【结构】：入口必须为 `async def run(self, params: dict)`，严禁为 Workflow 类定义 `__init__` 方法。'
    );
    lines.push(
      '5. 【参数使用强制】：如果 Workflow DSL 提供了 `inputParams`，必须在 `run()` 中从 `params` 逐项读取这些参数并用于业务流程/Activity 入参；不得忽略这些参数定义。'
    );
    lines.push(
      '6. 【参数校验强制】：对 `required=true` 的参数必须显式校验缺失并抛出 `ApplicationError(..., non_retryable=True)`；若配置了 `defaultValue`，读取参数时必须应用默认值。'
    );
    lines.push(
      '7. 【执行配置落地强制】：如果 Workflow DSL 提供了 `workflowExecutionTimeout`、`workflowRunTimeout`、`workflowTaskTimeout`，必须在生成代码中定义同名或语义等价的 `timedelta` 常量（例如 `WORKFLOW_EXECUTION_TIMEOUT`），并在 Workflow 日志中输出这些配置值，禁止忽略这些配置。'
    );
    lines.push(
      '8. 【确定性强制】：Workflow 代码中禁止直接做非确定性副作用（HTTP/DB/文件 I/O、系统时间、随机数、线程、进程、全局可变状态）；这些操作必须在 Activity 中完成。'
    );
    lines.push(
      '9. 【历史回放安全】：代码必须稳定可回放，避免根据运行时环境分支改变命令顺序；需要等待条件请用 `workflow.wait_condition`，不要 busy loop。'
    );
    lines.push(
      '10. 【沙箱稳定性】：如果代码涉及外部 HTTP 请求，请保持实现通用，不要在代码中写死任何业务实例、接口域名或返回值；需要兼容沙箱时，请依赖运行环境提供的 mock 请求能力。'
    );
    lines.push(
      '11. 【调用】：使用 `await workflow.execute_activity(activity_fn, input, start_to_close_timeout=timedelta(...))`。如果步骤 DSL 中还提供了 `scheduleToCloseTimeout` 或 `heartbeatTimeout`，也必须分别映射为 `schedule_to_close_timeout=timedelta(...)`、`heartbeat_timeout=timedelta(...)`。所有超时都必须与步骤 DSL 一致，未配置的项不要硬编码。'
    );
    lines.push(
      '12. 【重试策略】：优先使用 DSL 指定的 retryPolicy；未指定时再使用合理默认值，禁止无限重试。若需要显式构造 RetryPolicy，只允许使用 `from temporalio.common import RetryPolicy` 或 `import temporalio.common as temporal_common` 后调用 `temporal_common.RetryPolicy(...)`。严禁使用 `activity.RetryPolicy(...)`、`workflow.RetryPolicy(...)`、`temporalio.activity.RetryPolicy(...)` 等不存在的命名空间。'
    );
    lines.push(
      '13. 【重试策略最小化】：如果 DSL 没有明确要求在 `workflow.execute_activity()` 上显式传 `retry_policy=`，请优先省略，不要为了“看起来完整”额外构造 RetryPolicy。'
    );
    lines.push('14. 【日志】：必须使用 `workflow.logger.info()` 输出关键执行阶段与参数摘要。');
    lines.push(
      '15. 【版本演进提示】：在关键逻辑处添加简短注释，提示后续变更需考虑历史运行中的工作流回放兼容性。'
    );
    lines.push(
      '16. 【内置步骤配置边界】：`step.input.__httpRequest` 和 `step.input.__structuredTransform` 属于步骤内部编排配置，不属于 Workflow 对外输入参数。不要在 `run()` 中读取 `params["httpRequestStepConfig"]`、`params["structuredTransformStepConfig"]` 或任何等价的内部配置参数。'
    );
    lines.push(
      '17. 【内置 HTTP/结构化转换落地】：如果 DSL 中使用了 builtin:httpRequest、builtin:structuredTransform 或 builtin:aiStructuredTransform，必须把对应 step config 编译为 Workflow 内部常量或固定配置，并仅用业务输入参数去渲染模板，不要把内部 step config 透传给工作流调用者。'
    );
    lines.push(
      '18. 【禁止手动构造请求】：对于 builtin:httpRequest，禁止在 Workflow 中手动拼接 URL 或使用 `requests` 库。必须将 DSL 中的 `__httpRequest` 配置完整映射到 Activity 的 `activity_input` 中。Workflow 的职责仅限于渲染模板变量并调用 Activity。'
    );
    lines.push(
      '19. 【禁止客户端代码】：不要在生成的 Workflow 文件中引入 `temporalio.client.Client`、`temporalio.worker.Worker`，也不要在代码里主动连接 Temporal 或启动 Worker。只生成 Workflow 与 Activity 定义本身。'
    );
    lines.push(
      '20. 【文档下载地址】：如果 Activity 返回了 `downloadUrl`，请确保 Workflow 的最终返回结果中包含此下载地址，以便用户直接点击下载。'
    );
    lines.push(
      '21. 【严格禁用的 Temporal API】：严禁生成 `workflow.unsafe`、`workflow.unsafe.is_replaying()`、`workflow.patch()`、`workflow.deprecate_patch()`、`activity.RetryPolicy(...)`、`workflow.RetryPolicy(...)`、`temporalio.activity.RetryPolicy(...)`。遇到回放、版本或重试问题时，只能使用标准 `workflow` API、`workflow.execute_activity(...)` 与 `temporalio.common.RetryPolicy`。'
    );
    lines.push(
      '22. 【默认优先固定规则转换】：如果目标可通过字段映射、路径提取、模板拼接、文本模板实现，优先沿用 builtin:structuredTransform（固定规则版）；只有当 DSL 已明确使用 builtin:aiStructuredTransform 时，才生成 AI 转换调用路径。'
    );
    lines.push(
      '23. 【不要发明 replay guard】：不要写 `if workflow.unsafe.is_replaying()`、不要写任何 `is_replaying` 判断、不要为了日志或分支控制去探测 replay 状态。'
    );
    lines.push(
      '24. 【最终输出协议强制】：Workflow `run()` 的最终返回值必须是统一的 `WorkflowResultEnvelope` 风格字典，不能直接返回裸字符串、裸数组、裸 downloadUrl 或裸 activity result。'
    );
    lines.push(
      '25. 【最终输出结构强制】：最终返回值至少包含 `execution`、`trigger`、`result`、`artifacts`、`presentation` 五个顶层字段；允许字段值为 `None`，但字段结构不得缺失。'
    );
    lines.push(
      '26. 【execution 字段强制】：必须返回 `execution.status`，成功时使用 `"success"`，失败或取消时也要有明确状态。'
    );
    lines.push(
      '27. 【trigger 字段强制】：默认返回 `{"type": "manual"}`；如果 DSL 或上下文明确是定时任务，可返回 `schedule` 并补充调度信息。'
    );
    lines.push(
      '28. 【result 字段强制】：必须返回 `result.resultType`、`result.title`、`result.summary`、`result.businessData`。其中 `businessData` 可以直接使用最终业务结果。'
    );
    lines.push(
      '29. 【artifacts 字段强制】：如果任一步骤结果中存在 `downloadUrl`、`url`、文件路径或文档产物，必须提取到 `artifacts` 数组中，而不是只留在 `businessData` 里。'
    );
    lines.push(
      '30. 【presentation 字段强制】：必须返回 `presentation.preferAiSummary`、`presentation.preferStructuredView`、`presentation.summaryFormat`、`presentation.detailFormat`，并优先补充 `presentation.chatSummary`、`presentation.notificationSummary`、`presentation.detailText`。'
    );
    lines.push(
      '31. 【用户可读输出强制】：如果结果需要给用户直接阅读，必须把“简洁摘要”放进 `result.summary`，把“完整可读正文”放进 `presentation.detailText`，并用 `summaryFormat/detailFormat` 明确声明是 `plain_text` 还是 `markdown`。禁止只返回一坨原始 JSON 让前端自己猜。'
    );
    lines.push(
      '32. 【建议实现方式】：请在 Workflow 类中实现 `_extract_summary()`、`_extract_detail_text()`、`_collect_artifacts()`、`_build_workflow_result()` 之类的辅助方法，在 `run()` 末尾统一封装最终结果。'
    );
    lines.push(
      '33. 【兼容已有 activity 返回值】：如果 Activity 返回的是 `{ status, result, raw }`、`{ downloadUrl }`、`{ summary }` 或其他对象，请先归一化，再封装为 `WorkflowResultEnvelope`。不要把 activity 原始对象直接作为 Workflow 最终返回值。'
    );
    lines.push(
      '34. 【聊天与详情页兼容】：生成的最终输出必须让聊天窗口和执行详情页都可以直接消费，因此摘要、完整正文、业务数据和产物链接必须分层表达，不要把所有信息混在一个字符串里。'
    );
    lines.push(
      '35. 【文本型步骤特殊规则】：即使业务结果本身是纯文本，Workflow 最终返回也必须放到 `result.summary` / `presentation.detailText` / `result.businessData` 中，并仍返回完整 envelope。'
    );
    lines.push(
      '36. 【下载型步骤特殊规则】：如果结果主要是文件或文档，请在 `result.summary` 中说明“已生成结果”，并在 `artifacts` 中提供下载链接或路径。'
    );
    lines.push(
      '37. 【任务调用兼容】：工作流支持作为自动化任务被任务规划器（如工作台待办 Todo）调用。如果 `params` 传入了 `todoId`，请在日志中输出任务标识 `workflow.logger.info(f"Task invocation for todo: {params.get(\'todoId\')}")`，便于审计跟踪。'
    );

    if (workflowDsl.errorHandling?.type === 'saga') {
      lines.push('38. 【Saga 模式】：必须维护 compensations 列表，在失败时逆序执行补偿任务。');
    }

    lines.push(
      '38. 【enum 参数禁止二次校验】：inputParams 中带 `enum` 约束的参数（例如 `topic` 仅允许 `general`/`news`/`finance`），上游 plan 归一化层已保证传入 `run(self, params)` 的值合法（非法值会被丢弃并用 `defaultValue` 顶上）。生成的 Python 代码必须直接使用 `params` 中读到的值，禁止：(a) 在 Workflow/Activity 中再做一次 `if value not in [...]` 形式的 enum 白名单校验；(b) 抛出形如 `ApplicationError("X 必须是 [...] 之一，当前值: ...")` 的错误；(c) 绕开 `params` 重新从用户原始自然语言输入里抽取/推断 enum 字段值。如需对缺失的 required enum 参数兜底，只允许使用 `params.get(key, defaultValue)` 形式应用 defaultValue。'
    );

    if (workflowDsl.extraPrompt) {
      lines.push('');
      lines.push('【补足情报（额外指导）】：');
      lines.push(workflowDsl.extraPrompt);
    }

    if (activityCodeAlreadyGenerated) {
      lines.push('【本次任务范围】：仅编写 Workflow 胶水代码。Activity 实现已全部提供，不要重复生成或改写。');
    }

    if (workflowDsl.v2Output?.fields) {
      try {
        const validStepIds = (workflowDsl.steps || []).map((s) => s.id);
        const v2BuilderLines = buildV2OutputResultBuilderLines({
          v2Output: workflowDsl.v2Output,
          validStepIds,
          resultType: 'generic',
          title: workflowDisplayName,
        });
        lines.push('');
        lines.push('【强契约 Result Builder 必须原样包含】：');
        lines.push('此工作流已由 DSL v2Output 声明输出契约。以下由编译器生成的 _build_workflow_result 函数，你必须【原样包含】在 Workflow 类中，严禁修改、删除或简化其中的任何断言：');
        lines.push('--- 编译器生成 Result Builder 开始 ---');
        v2BuilderLines.forEach((line) => lines.push(line));
        lines.push('--- 编译器生成 Result Builder 结束 ---');
      } catch {
        // Compile check ignore, Gate 1 will handle if invalid
      }
    }

    lines.push('');
    lines.push(
      '【输出】：只返回完整的 Python 代码，包含所有 import 语句。不要包含 Markdown 代码块标记。'
    );

    return lines.join('\n');
  }

  private extractCodeFromMarkdown(content: string): string | null {
    const normalized = String(content || '')
      .replace(/^\uFEFF/, '')
      .trim();
    if (!normalized) {
      return null;
    }

    const codeBlockMatches = Array.from(
      normalized.matchAll(/```(?:python|py|json|text)?\s*([\s\S]*?)```/gi)
    );
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
      return (
        /^(import\s+|from\s+|@activity\.defn|@workflow\.defn|class\s+|def\s+|async\s+def\s+)/.test(
          trimmed
        ) &&
        !trimmed.startsWith('`') &&
        !trimmed.startsWith('#')
      );
    });

    const startLine = firstCodeLineIndex >= 0 ? firstCodeLineIndex : 0;
    const candidateLines = lines.slice(startLine);

    let lastCodeLine = candidateLines.length - 1;
    for (let i = 0; i < candidateLines.length; i += 1) {
      const line = candidateLines[i].trim();
      if (
        line &&
        !line.startsWith('#') &&
        !/^[a-zA-Z0-9_]/.test(line) &&
        !line.startsWith('@') &&
        !candidateLines[i].startsWith(' ')
      ) {
        if (
          line.split(' ').length > 5 &&
          !line.includes('(') &&
          !line.includes('=') &&
          !line.includes(':')
        ) {
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
      return (
        trimmed.startsWith('import ') ||
        trimmed.startsWith('from ') ||
        trimmed.startsWith('@activity.defn') ||
        trimmed.startsWith('@workflow.defn') ||
        trimmed.startsWith('class ') ||
        trimmed.startsWith('def ') ||
        trimmed.startsWith('async def ')
      );
    });

    if (!looksLikePythonModule) {
      return null;
    }

    return candidate;
  }

  /**
   * 剥离 LLM 生成的 Python 代码中违规的 enum 白名单二次校验。
   *
   * 背景：inputParams 中带 enum 约束的参数，上游 plan 归一化层已保证传入值合法
   * （见 ai-orchestrator param-enum-constraint.ts + param-recognizer.service.ts）。
   * 但 LLM 常在生成的 activity 里自作主张再加 `if x not in [...]: raise ApplicationError("...必须是...之一...")`
   * 形式的白名单校验，且校验的值往往不是从 params 读的、而是重新从自然语言抽取的，
   * 导致运行时抛 "topic 必须是 ['general','news','finance'] 之一，当前值: AI" 类 ApplicationError。
   *
   * 这里只剥离"消息文本含『必须是...之一』"的 enum 白名单分支，避免误伤 HTTP 状态码
   * 等合法的 `if x not in [...]` 校验。
   */
  private stripForbiddenEnumChecks(code: string): { code: string; stripped: boolean } {
    // 形态 1：两行
    //   if topic not in ['general', 'news', 'finance']:
    //       raise ApplicationError("topic 必须是 ['general', 'news', 'finance'] 之一，当前值: " + str(topic), non_retryable=True)
    // 用 [^\n]* 吃掉 raise 整行以应对消息里的嵌套括号（如 str(topic)、列表字面量），
    // 但要求该行含"必须是...之一"才剥离，避免误伤 HTTP 状态码等合法校验。
    const twoLinePattern = () =>
      new RegExp(
        '^[ \\t]*if\\s+(\\w+)\\s+not\\s+in\\s+\\[[^\\]]*\\]\\s*:\\s*\\n[ \\t]*raise\\s+ApplicationError\\([^\n]*必须是[^\n]*之一[^\n]*\\n',
        'gm'
      );
    // 形态 2：单行
    //   if topic not in [...]: raise ApplicationError("...必须是...之一...")
    const oneLinePattern = () =>
      new RegExp(
        '^[ \\t]*if\\s+(\\w+)\\s+not\\s+in\\s+\\[[^\\]]*\\]\\s*:\\s*raise\\s+ApplicationError\\([^\n]*必须是[^\n]*之一[^\n]*\\n',
        'gm'
      );

    let stripped = false;
    let result = code;
    for (const factory of [twoLinePattern, oneLinePattern]) {
      const pattern = factory();
      if (pattern.test(result)) {
        // 用新实例执行 replace，避免 test() 留下的 lastIndex 状态影响匹配
        result = result.replace(factory(), '');
        stripped = true;
      }
    }

    return { code: result, stripped };
  }

  /**
   * @deprecated Quick regex hints only — NOT a release arbiter per §10.2
   * ("正则可以作为快速提示，但不能作为发布裁决"). The authoritative Gate 1
   * check is validateGeneratedPythonCodeGate1 (AST-based).
   */
  private validateGeneratedPythonCodeShape(code: string): { success: boolean; error?: string } {
    const bannedPatterns: Array<{ pattern: RegExp; message: string }> = [
      {
        pattern: /\bactivity\.RetryPolicy\s*\(/,
        message:
          '检测到 `activity.RetryPolicy(...)`。Temporal Python SDK 中不存在该 API，只允许使用 `temporalio.common.RetryPolicy(...)`。',
      },
      {
        pattern: /\bworkflow\.RetryPolicy\s*\(/,
        message:
          '检测到 `workflow.RetryPolicy(...)`。请改为 `from temporalio.common import RetryPolicy` 后使用 `RetryPolicy(...)`。',
      },
      {
        pattern: /\btemporalio\.activity\.RetryPolicy\s*\(/,
        message:
          '检测到 `temporalio.activity.RetryPolicy(...)`。正确命名空间应为 `temporalio.common.RetryPolicy(...)`。',
      },
      {
        pattern: /\bfrom\s+temporalio\.activity\s+import\s+RetryPolicy\b/,
        message:
          '检测到 `from temporalio.activity import RetryPolicy`。正确导入应为 `from temporalio.common import RetryPolicy`。',
      },
      {
        pattern: /\bworkflow\.unsafe\b/,
        message:
          '检测到 `workflow.unsafe`。生成的 Workflow 禁止依赖 `workflow.unsafe`，请仅使用标准的 `workflow` API 与 `workflow.execute_activity(...)`。',
      },
    ];

    for (const rule of bannedPatterns) {
      if (rule.pattern.test(code)) {
        return { success: false, error: rule.message };
      }
    }

    return { success: true };
  }

  /**
   * @deprecated Quick regex hints only — NOT a release arbiter per §10.2
   * ("正则可以作为快速提示，但不能作为发布裁决"). The authoritative Gate 1
   * check is validateGeneratedPythonCodeGate1 (AST-based).
   */
  private validateGeneratedWorkflowOutputContract(
    code: string,
    workflowDsl?: WorkflowDsl
  ): {
    success: boolean;
    error?: string;
  } {
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

    // DSL V2 Output Required Fields Check
    if (workflowDsl?.v2Output?.fields) {
      const missingV2Fields: string[] = [];
      for (const [fieldName, fieldSpec] of Object.entries(workflowDsl.v2Output.fields)) {
        if (fieldSpec?.required) {
          const pattern = new RegExp(`["']${fieldName}["']\\s*:`);
          if (!pattern.test(code)) {
            missingV2Fields.push(fieldName);
          }
        }
      }
      if (missingV2Fields.length > 0) {
        return {
          success: false,
          error: `DSL v2Output 所需的必填输出字段未映射在生成代码中: ${missingV2Fields.join(', ')}`,
        };
      }
    }

    const hasWorkflowResultBuilder = /def\s+_build_workflow_result\s*\(/.test(code);
    const hasEnvelopeReturn =
      /return\s+\{[\s\S]*["']execution["']\s*:[\s\S]*["']presentation["']\s*:/.test(code) ||
      /return\s+self\._build_workflow_result\s*\(/.test(code) ||
      /return\s+cls\._build_workflow_result\s*\(/.test(code);

    if (!hasWorkflowResultBuilder && !hasEnvelopeReturn) {
      return {
        success: false,
        error:
          'Workflow 代码未检测到统一结果封装逻辑。请实现 `_build_workflow_result()` 或在 `run()` 末尾直接返回包含 execution/trigger/result/artifacts/presentation 的字典。',
      };
    }

    const requiredPresentationFields = [
      'preferAiSummary',
      'preferStructuredView',
      'summaryFormat',
      'detailFormat',
    ];
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

  private async generateWorkflowCodeViaAi(
    workflowDsl: WorkflowDsl,
    activityDsl: ActivityDsl,
    initialErrorContext?: string,
    onProgress?: (log: string) => void
  ): Promise<{
    success: boolean;
    code?: string;
    error?: string;
    attempts: number;
    autoRetried: boolean;
  }> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    let errorContext = initialErrorContext;
    let attempts = 0;

    const activityCodeAlreadyGenerated =
      activityDsl.activities.length > 0 &&
      activityDsl.activities.every((activity) => Boolean(activity.generatedCode));
    if (activityCodeAlreadyGenerated) {
      onProgress?.(
        `[${new Date().toISOString()}] 全部 Activity 代码已生成，AI 仅编写 Workflow 胶水代码（简化提示词）`
      );
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      attempts += 1;
      onProgress?.(`[${new Date().toISOString()}] 开始第 ${attempts} 次 AI 代码生成`);
      const prompt = this.buildWorkflowCodePrompt(
        workflowDsl,
        activityDsl,
        errorContext,
        activityCodeAlreadyGenerated
      );
      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'default',
          prompt,
        },
        { timeout: 360000 }
      );
      onProgress?.(`[${new Date().toISOString()}] AI 已返回候选代码，开始提取与静态检查`);

      const content = response.data?.result || '';
      const extractedCode = this.extractCodeFromMarkdown(content);
      if (!extractedCode) {
        onProgress?.(`[${new Date().toISOString()}] AI 输出中未提取到有效 Python 代码`);
        if (attempt === 0) {
          errorContext = this.mergeErrorContext(
            initialErrorContext,
            'AI 返回内容中未提取到有效 Python 代码。请只输出完整 Python 模块，不要包含 Markdown、解释、JSON 或残缺片段。'
          );
          continue;
        }
        return {
          success: false,
          error: 'AI 未能生成有效代码',
          attempts,
          autoRetried: attempts > 1,
        };
      }

      const { code, stripped } = this.stripForbiddenEnumChecks(extractedCode);
      if (stripped) {
        onProgress?.(
          `[${new Date().toISOString()}] 检测到生成的 Python 代码包含 enum 白名单二次校验，已自动剥离（上游 plan 归一化层已保证 enum 合法）`
        );
      }

      const gate1Check = this.validateGeneratedPythonCodeGate1(code, workflowDsl);
      if (!gate1Check.success) {
        onProgress?.(
          `[${new Date().toISOString()}] Gate 1 静态分析失败: ${gate1Check.error || ''}`
        );
        if (attempt === 0) {
          errorContext = this.mergeErrorContext(
            initialErrorContext,
            this.buildAstGate1RepairContext(gate1Check.violations)
          );
          continue;
        }
        return {
          success: false,
          error: `AI 生成的代码未通过 Gate 1 静态分析: ${gate1Check.error}`,
          attempts,
          autoRetried: attempts > 1,
        };
      }

      for (const warning of gate1Check.hintWarnings || []) {
        onProgress?.(`[${new Date().toISOString()}] ${warning}`);
      }
      onProgress?.(`[${new Date().toISOString()}] Gate 1 静态分析通过`);
      return { success: true, code, attempts, autoRetried: attempts > 1 };
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

  /**
   * Gate 1 (§10.2) — authoritative AST-based static analysis of generated
   * Python code. Writes the code to a temp file and executes the inline
   * PYTHON_AST_GATE_SCRIPT analyzer via `python3 -c`, parsing its JSON report.
   */
  private runPythonAstGateCheck(
    code: string,
    requiredV2FieldNames: string[]
  ): { success: boolean; errors: PythonGate1Violation[] } {
    const tempDir = mkdtempSync(join(tmpdir(), 'ops-workflow-gate1-'));
    const tempFile = join(tempDir, 'generated_workflow.py');

    try {
      writeFileSync(tempFile, code, 'utf-8');
      const result = spawnSync(
        'python3',
        ['-c', PYTHON_AST_GATE_SCRIPT, tempFile, JSON.stringify(requiredV2FieldNames)],
        {
          encoding: 'utf-8',
          timeout: 15000,
        }
      );

      if (result.error) {
        return {
          success: false,
          errors: [
            {
              line: 1,
              code: 'GATE_RUNTIME',
              message: `python3 不可用或执行失败: ${result.error.message}`,
            },
          ],
        };
      }

      const stdout = String(result.stdout || '').trim();
      if (result.status !== 0 || !stdout) {
        const raw = String(result.stderr || stdout || 'unknown gate error').trim();
        return {
          success: false,
          errors: [{ line: 1, code: 'GATE_RUNTIME', message: raw.slice(0, 2000) }],
        };
      }

      try {
        const parsed = JSON.parse(stdout);
        return {
          success: parsed.success === true,
          errors: Array.isArray(parsed.errors) ? (parsed.errors as PythonGate1Violation[]) : [],
        };
      } catch {
        return {
          success: false,
          errors: [
            {
              line: 1,
              code: 'GATE_RUNTIME',
              message: `静态分析器输出无法解析: ${stdout.slice(0, 500)}`,
            },
          ],
        };
      }
    } catch (error: any) {
      return {
        success: false,
        errors: [{ line: 1, code: 'GATE_RUNTIME', message: error.message || 'unknown gate error' }],
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Gate 1 wrapper: the AST analyzer is the authoritative arbiter; the legacy
   * regex validators run afterwards as non-blocking quick hints (per §10.2
   * "正则可以作为快速提示，但不能作为发布裁决").
   */
  private validateGeneratedPythonCodeGate1(
    code: string,
    workflowDsl?: WorkflowDsl
  ): PythonGate1CheckResult {
    const requiredV2FieldNames: string[] = [];
    if (workflowDsl?.v2Output?.fields) {
      for (const [fieldName, fieldSpec] of Object.entries(workflowDsl.v2Output.fields)) {
        if (fieldSpec?.required) {
          requiredV2FieldNames.push(fieldName);
        }
      }
    }

    const astGate = this.runPythonAstGateCheck(code, requiredV2FieldNames);
    if (!astGate.success) {
      return {
        success: false,
        violations: astGate.errors,
        error: this.formatGate1Errors(astGate.errors),
      };
    }

    const hintWarnings: string[] = [];
    const shapeHint = this.validateGeneratedPythonCodeShape(code);
    if (!shapeHint.success) {
      hintWarnings.push(`[regex hint] ${shapeHint.error}`);
    }
    const contractHint = this.validateGeneratedWorkflowOutputContract(code, workflowDsl);
    if (!contractHint.success) {
      hintWarnings.push(`[regex hint] ${contractHint.error}`);
    }

    return { success: true, violations: [], hintWarnings };
  }

  private formatGate1Errors(errors: PythonGate1Violation[]): string {
    if (!errors.length) {
      return '未知静态分析错误';
    }
    return errors
      .map((e) => `第 ${e.line} 行 [${e.code}]: ${e.message}`)
      .join('\n');
  }

  private buildAstGate1RepairContext(errors: PythonGate1Violation[]): string {
    const grouped = new Map<string, string[]>();
    for (const violation of errors) {
      const existing = grouped.get(violation.code) || [];
      existing.push(`第 ${violation.line} 行: ${violation.message}`);
      grouped.set(violation.code, existing);
    }

    const parts: string[] = [
      'AI 生成的代码未通过 Gate 1 静态分析（AST 门禁），请根据以下问题重新生成完整代码：',
    ];
    for (const [code, lines] of grouped) {
      parts.push(`- [${code}]`);
      parts.push(...lines);
      const guidance = AST_GATE_REPAIR_GUIDANCE[code];
      if (guidance) {
        parts.push(`  修复指引: ${guidance}`);
      }
    }
    parts.push(
      '',
      '通用要求：',
      '1. Workflow 代码必须保持确定性：禁止系统时间、随机数、网络、文件系统、数据库、进程与线程操作。',
      '2. 所有外部副作用（HTTP、文件、数据库）必须封装在 @activity.defn 装饰的 Activity 函数中。',
      '3. run() 必须通过 _build_workflow_result() 返回统一结果协议信封（execution/trigger/result/artifacts/presentation）。',
      '4. 只能导入白名单模块（标准库确定性子集、temporalio.*、平台 SDK）。',
      '5. 不要使用 workflow.unsafe 或手动判断 is_replaying；保持 Workflow 逻辑确定性即可。'
    );
    return parts.join('\n');
  }
}
