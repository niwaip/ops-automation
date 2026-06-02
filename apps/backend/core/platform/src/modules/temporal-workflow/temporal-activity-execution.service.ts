import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { getWorkflowValidationAgentUrl } from '../../config/service-endpoints';
import { normalizeDocumentExecutionResult } from './temporal-activity-execution.helpers';
import { ActivityExecutionOptions } from './temporal-activity.types';

@Injectable()
export class ActivityExecutionService {
  /**
   * Execute Python code directly in subprocess
   * 先拉取最新代码，然后执行
   */
  async executeCode(code: string, fn: string, taskQueue: string, input?: Record<string, any>): Promise<{
    success: boolean;
    result?: any;
    logs?: string[];
    error?: string;
  }> {
    const logger = new Logger('ActivityExecutionService.executeCode');
    const logs: string[] = [];

    try {
      logger.log(`Executing code for function: ${fn}`);

      // 1. 先拉取最新代码 (参数中已传入)
      logs.push(`[${new Date().toISOString()}] 拉取最新代码完成`);

      // 2. 直接执行 Python 代码
      logs.push(`[${new Date().toISOString()}] 直接执行 Python 代码`);
      const result = await this.executePythonCode(code, fn, input || {}, (log: string) => logs.push(log));
      logs.push(`[${new Date().toISOString()}] 代码执行完成`);

      return {
        success: true,
        result,
        logs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Code execution failed: ${errorMsg}`);
      logs.push(`[${new Date().toISOString()}] 执行失败: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        logs,
      };
    }
  }

  /**
   * Execute code via Temporal Sandbox Agent only.
   * 不允许回退到本地 subprocess，确保运行时统一进入 Temporal 链路。
   */
  async executeCodeInTemporalSandbox(
    code: string,
    fn: string,
    taskQueue: string,
    input?: Record<string, any>,
  ): Promise<{
    success: boolean;
    result?: any;
    logs?: string[];
    error?: string;
    workflowId?: string;
  }> {
    const logger = new Logger('ActivityExecutionService.executeCodeInTemporalSandbox');
    const logs: string[] = [];
    const onLog = (log: string) => logs.push(log);
    const sandboxUrl = this.getSandboxAgentUrl();

    void taskQueue;

    if (!sandboxUrl) {
      const errorMsg = '未配置 Temporal Sandbox Agent 地址';
      logger.error(errorMsg);
      logs.push(`[${new Date().toISOString()}] ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        logs,
      };
    }

    try {
      logs.push(`[${new Date().toISOString()}] 使用 Temporal Sandbox Agent 执行代码`);
      const result = await this.executeCodeViaSandboxAgent(sandboxUrl, code, fn, input, onLog);
      logs.push(
        `[${new Date().toISOString()}] ${
          result.success ? 'Temporal Sandbox Agent 执行完成' : 'Temporal Sandbox Agent 执行失败'
        }`,
      );
      return {
        success: result.success,
        result: result.result,
        error: result.error,
        logs,
        workflowId: result.workflowId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Sandbox execution failed: ${errorMsg}`);
      logs.push(`[${new Date().toISOString()}] Sandbox Agent 请求失败: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
        logs,
      };
    }
  }

  /**
   * Execute code with streaming callback for real-time logs
   */
  async executeCodeStreaming(
    code: string,
    fn: string,
    taskQueue: string,
    input: Record<string, any> | undefined,
    onLog: (log: string) => void,
    options: ActivityExecutionOptions = {},
  ): Promise<{ success: boolean; result?: any; error?: string; workflowId?: string }> {
    const logger = new Logger('ActivityExecutionService.executeCodeStreaming');

    const validationAgentUrl = this.getActivityValidationAgentUrl();
    if (validationAgentUrl && !options.preferSandboxStreaming) {
      try {
        onLog(`[${new Date().toISOString()}] 使用 Activity 测试 Worker 执行代码...`);
        return await this.executeCodeViaValidationWorker(
          validationAgentUrl,
          code,
          fn,
          taskQueue,
          input,
          options,
          onLog,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`Activity validation worker failed, falling back to sandbox: ${errorMsg}`);
        onLog(`[${new Date().toISOString()}] Activity 测试 Worker 不可用，回退到 Sandbox 执行...`);
      }
    }

    // Try to use sandbox agent via Temporal workflow
    const sandboxUrl = this.getSandboxAgentUrl();
    if (sandboxUrl) {
      try {
        onLog(`[${new Date().toISOString()}] 使用 Temporal Sandbox Agent 执行代码...`);
        return await this.executeCodeViaSandboxAgentStream(sandboxUrl, code, fn, input, onLog);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`Sandbox agent failed, falling back to subprocess: ${errorMsg}`);
        onLog(`[${new Date().toISOString()}] Sandbox agent 不可用，回退到直接执行...`);
      }
    }

    // Fallback to direct subprocess execution
    const logs: string[] = [];

    try {
      onLog(`[${new Date().toISOString()}] 开始执行代码...`);
      onLog(`[${new Date().toISOString()}] 直接执行 Python 代码（不依赖 AI Orchestrator）`);

      const result = await this.executePythonCode(code, fn, input || {}, (log) => {
        onLog(`[${new Date().toISOString()}] ${log}`);
        logs.push(log);
      });

      onLog(`[${new Date().toISOString()}] 执行成功`);
      return { success: true, result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Streaming execution failed: ${errorMsg}`);
      onLog(`[${new Date().toISOString()}] 执行失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get sandbox agent URL from environment
   */
  private getSandboxAgentUrl(): string {
    return getWorkflowValidationAgentUrl();
  }

  private getActivityValidationAgentUrl(): string | null {
    if (process.env.ACTIVITY_VALIDATION_AGENT_URL) {
      return process.env.ACTIVITY_VALIDATION_AGENT_URL;
    }
    return this.getSandboxAgentUrl();
  }

  private async executeCodeViaValidationWorker(
    agentUrl: string,
    code: string,
    fn: string,
    taskQueue: string,
    input: Record<string, any> | undefined,
    options: ActivityExecutionOptions,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const activityId = `activity-validation-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timeoutMs = Number(process.env.ACTIVITY_VALIDATION_TIMEOUT_MS || 300000);

    onLog(`[${new Date().toISOString()}] 连接到 Activity 测试 Worker: ${agentUrl}`);
    onLog(`[${new Date().toISOString()}] 验证任务 ID: ${activityId}`);
    if (options.retryPolicy) {
      onLog(
        `[${new Date().toISOString()}] 启用重试测试: maxRetries=${options.retryPolicy.maxRetries}, backoffMs=${options.retryPolicy.backoffMs || 1000}`,
      );
    }

    const response = await axios.post(`${agentUrl}/validate-activity`, {
      code,
      fn_name: fn,
      activity_id: activityId,
      task_queue: taskQueue,
      input_data: input || {},
      timeout: options.timeout,
      retry_policy: options.retryPolicy || null,
    }, {
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = response.data as any;
    const validationResult =
      data.result && typeof data.result === 'object'
        ? data.result
        : data;

    if (Array.isArray(validationResult.logs)) {
      validationResult.logs.forEach((log: string) => onLog(log));
    }

    if (data.success === false || data.error) {
      const errorMsg = data.error || data.message || JSON.stringify(data);
      onLog(`[${new Date().toISOString()}] Activity 测试 Worker 请求失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    if (validationResult.success === false || validationResult.error) {
      const errorMsg = validationResult.error || 'Activity 测试 Worker 执行失败';
      if (validationResult.attempts && validationResult.max_attempts) {
        onLog(
          `[${new Date().toISOString()}] 重试结束，实际执行 ${validationResult.attempts}/${validationResult.max_attempts} 次`,
        );
      }
      return { success: false, error: errorMsg };
    }

    if (validationResult.attempts && validationResult.max_attempts) {
      onLog(
        `[${new Date().toISOString()}] Activity 测试 Worker 执行完成，实际执行 ${validationResult.attempts}/${validationResult.max_attempts} 次`,
      );
    }

    return {
      success: true,
      result: validationResult.result,
    };
  }

  /**
   * Execute code via sandbox agent HTTP API
   */
  private async executeCodeViaSandboxAgent(
    sandboxUrl: string,
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; error?: string; workflowId?: string }> {
    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timeoutMs = Number(process.env.SANDBOX_AGENT_TIMEOUT_MS || 180000);

    onLog(`[${new Date().toISOString()}] 连接到 Sandbox Agent: ${sandboxUrl}`);
    onLog(`[${new Date().toISOString()}] Activity ID: ${activityId}`);
    onLog(`[${new Date().toISOString()}] 等待 Sandbox Agent 返回结果...`);

    try {
      const response = await axios.post(`${sandboxUrl}/execute`, {
        code,
        fn_name: fn,
        activity_id: activityId,
        input_data: input || {},
      }, {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = response.data as any;

      // Push logs from sandbox execution to the frontend
      if (data.result?.logs && Array.isArray(data.result.logs)) {
        data.result.logs.forEach((log: string) => {
          onLog(log);
        });
      }

      // Check if the sandbox agent itself returned an error
      if (data.success === false || data.error || data.status_code >= 400) {
        const errorMsg = data.error || data.message || JSON.stringify(data);
        onLog(`[${new Date().toISOString()}] 执行错误: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      const executionEnvelope = data.result && typeof data.result === 'object'
        ? data.result
        : undefined;
      const executionResult =
        executionEnvelope?.result && typeof executionEnvelope.result === 'object'
          ? executionEnvelope.result
          : executionEnvelope;

      if (executionEnvelope?.success === false || executionEnvelope?.error) {
        const errorMsg = executionEnvelope.traceback
          ? `执行失败: ${executionEnvelope.error}\n\n详细信息:\n${executionEnvelope.traceback}`
          : executionEnvelope.error || JSON.stringify(executionEnvelope);
        onLog(`[${new Date().toISOString()}] ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      if (
        executionResult
        && typeof executionResult === 'object'
        && (
          ('success' in executionResult && executionResult.success === false)
          || ('error' in executionResult && Boolean(executionResult.error))
        )
      ) {
        const errorMsg = executionResult.traceback
          ? `执行失败: ${executionResult.error}\n\n详细信息:\n${executionResult.traceback}`
          : String(executionResult.error || JSON.stringify(executionResult));
        onLog(`[${new Date().toISOString()}] ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      // Extract the actual result from the sandbox response
      const result = normalizeDocumentExecutionResult(executionResult?.result ?? executionResult);

      onLog(`[${new Date().toISOString()}] 代码执行成功，返回结果: ${JSON.stringify(result, null, 2)}`);
      return { success: true, result, workflowId: data.workflow_id };
    } catch (error) {
      const errorCode =
        error && typeof error === 'object' && 'code' in error ? String((error as any).code) : '';
      const errorMsg =
        errorCode === 'ECONNABORTED'
          ? `Sandbox Agent 响应超时（${timeoutMs}ms）`
          : error instanceof Error
            ? error.message
            : 'Unknown error';
      onLog(`[${new Date().toISOString()}] Sandbox Agent 请求失败: ${errorMsg}`);
      throw error; // Re-throw to trigger fallback
    }
  }

  private async executeCodeViaSandboxAgentStream(
    sandboxUrl: string,
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; error?: string; workflowId?: string }> {
    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timeoutMs = Number(process.env.SANDBOX_AGENT_TIMEOUT_MS || 180000);

    onLog(`[${new Date().toISOString()}] 连接到 Sandbox Agent 流式接口: ${sandboxUrl}`);
    onLog(`[${new Date().toISOString()}] Activity ID: ${activityId}`);

    const response = await fetch(`${sandboxUrl}/execute/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        fn_name: fn,
        activity_id: activityId,
        input_data: input || {},
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Sandbox Agent 流式请求失败: HTTP ${response.status}`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: { success: boolean; result?: any; error?: string; workflowId?: string } | null = null;

    for await (const chunk of response.body as any) {
      buffer += decoder.decode(chunk, { stream: true });
      let delimiterIndex = buffer.indexOf('\n\n');
      while (delimiterIndex >= 0) {
        const rawEvent = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 2);
        const dataLine = rawEvent
          .split('\n')
          .find((line) => line.startsWith('data:'));
        if (!dataLine) {
          delimiterIndex = buffer.indexOf('\n\n');
          continue;
        }

        const payloadText = dataLine.slice(5).trim();
        if (!payloadText) {
          delimiterIndex = buffer.indexOf('\n\n');
          continue;
        }

        const event = JSON.parse(payloadText) as Record<string, any>;
        if (event.type === 'log' && typeof event.content === 'string') {
          onLog(event.content);
        } else if (event.type === 'error') {
          throw new Error(typeof event.content === 'string' ? event.content : 'Sandbox Agent 流式执行失败');
        } else if (event.type === 'done') {
          finalResult = {
            success: Boolean(event.success),
            result: event.result,
            error: typeof event.error === 'string' ? event.error : undefined,
            workflowId: typeof event.workflow_id === 'string' ? event.workflow_id : undefined,
          };
        }

        delimiterIndex = buffer.indexOf('\n\n');
      }
    }

    if (!finalResult) {
      throw new Error('Sandbox Agent 流式执行未返回最终结果');
    }

    return finalResult;
  }

  /**
   * Execute Python code in subprocess
   */
  private async executePythonCode(
    code: string,
    fn: string,
    input: Record<string, any>,
    onLog: (log: string) => void,
  ): Promise<any> {
    const tempDir = '/tmp/activity_execution';
    await fs.mkdir(tempDir, { recursive: true });

    const activityFilePath = path.join(tempDir, `activity_${Date.now()}.py`);
    const inputFilePath = path.join(tempDir, `input_${Date.now()}.json`);
    const runnerPath = path.join(tempDir, `runner_${Date.now()}.py`);

    try {
      // Strip markdown code block markers if present
      let cleanCode = code;
      if (code.includes('```')) {
        // More robust markdown stripping
        const match = code.match(/```(?:python)?\\n?([\\s\\S]*?)```/);
        if (match) {
          cleanCode = match[1].trim();
        } else {
          // Fallback for weird markdown
          cleanCode = code.replace(/```[a-zA-Z]*\\n?/g, '').replace(/```/g, '').trim();
        }
        onLog(`已清理代码中的 markdown 标记`);
      }

      // Write activity code
      await fs.writeFile(activityFilePath, cleanCode);
      onLog(`已写入活动代码到: ${activityFilePath}`);

      // Write input JSON
      await fs.writeFile(inputFilePath, JSON.stringify(input, null, 2));
      onLog(`已写入输入数据`);

      // Create simple runner script
      const runnerScript = `
import json
import sys
import os
import traceback
import types
import inspect

os.environ.setdefault('TEMPORAL_SANDBOX', 'true')

# Set SSL certificates location for HTTPS requests when certifi is available
try:
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
except ImportError:
    pass

# Add temp dir to path for imports
sys.path.insert(0, '\${tempDir}')

# Mock temporalio module for standalone execution
class MockActivityLogger:
    def _format(self, msg, args, kwargs):
        parts = [str(msg)]
        if args:
            parts.append(' '.join(str(arg) for arg in args))
        if kwargs:
            parts.append(str(kwargs))
        return ' '.join(part for part in parts if part)
    def info(self, msg, *args, **kwargs): print(f"[INFO] {self._format(msg, args, kwargs)}", flush=True)
    def warning(self, msg, *args, **kwargs): print(f"[WARN] {self._format(msg, args, kwargs)}", flush=True)
    def error(self, msg, *args, **kwargs): print(f"[ERROR] {self._format(msg, args, kwargs)}", flush=True)

class MockActivityInfo:
    def __init__(self):
        self.activity_type = 'MockActivity'
        self.workflow_type = 'MockWorkflow'
        self.workflow_namespace = 'default'
        self.task_queue = 'mock-task-queue'
        self.is_cancelled = False
        self.is_replaying = False
        self.run_id = 'mock-run-id-12345'
        self.workflow_run_id = 'mock-workflow-run-id-12345'
        self.workflow_id = 'mock-workflow-id-12345'
        self.activity_id = 'mock-activity-id-12345'
        self.attempt = 1

class MockActivity:
    def defn(self, name=None, **kwargs):
        # Accept name and ignore other kwargs like task_queue
        def decorator(func):
            func._activity_name = name or func.__name__
            return func
        return decorator

    @property
    def logger(self):
        return MockActivityLogger()

    def heartbeat(self, *args, **kwargs):
        print(f"[HEARTBEAT] {args if args else 'tick'}", flush=True)
        return None

    def info(self):
        return MockActivityInfo()

class MockApplicationError(Exception):
    def __init__(self, message, *details, non_retryable=False, **kwargs):
        super().__init__(message, *details)
        self.message = message
        self.details = details
        self.non_retryable = non_retryable
        self.kwargs = kwargs

class MockResponse:
    def __init__(self, payload=None, status_code=200, headers=None, url="", text=None):
        self._payload = payload or {}
        self.status_code = status_code
        self.headers = headers or {"Content-Type": "application/json"}
        self.url = url
        self.text = text if text is not None else json.dumps(self._payload)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise MockRequestException(f"HTTP {self.status_code}")

    def json(self):
        return self._payload

class MockRequestException(Exception):
    pass

def mock_requests_request(method, url, timeout=30, **kwargs):
    payload = {
        "ok": True,
        "mocked": True,
        "request": {
            "method": method,
            "url": url,
            "timeout": timeout,
            "kwargs": kwargs,
        },
        "data": {
            "message": "sandbox mock response"
        }
    }
    return MockResponse({
        **payload
    }, url=url)

def mock_requests_get(url, timeout=30, **kwargs):
    return mock_requests_request("GET", url, timeout=timeout, **kwargs)

def mock_requests_post(url, timeout=30, **kwargs):
    return mock_requests_request("POST", url, timeout=timeout, **kwargs)

# Create mock temporalio module as a proper ModuleType with submodules
mock_temporalio = types.ModuleType('temporalio')
mock_temporalio.activity = types.ModuleType('temporalio.activity')
mock_temporalio.workflow = types.ModuleType('temporalio.workflow')
mock_temporalio.exceptions = types.ModuleType('temporalio.exceptions')
mock_temporalio.common = types.ModuleType('temporalio.common')
mock_requests = types.ModuleType('requests')

# Set up activity with all required attributes
# Make defn work as @activity.defn() decorator - returns a decorator function
def make_defn_decorator():
    def defn_decorator(name=None, **kwargs):
        def decorator(func):
            func._activity_name = name or func.__name__
            return func
        return decorator
    return defn_decorator

mock_temporalio.activity.defn = make_defn_decorator()
mock_temporalio.activity.logger = MockActivityLogger()
mock_temporalio.activity.heartbeat = lambda *args, **kwargs: print(f"[HEARTBEAT] {args if args else 'tick'}", flush=True)
mock_temporalio.activity.info = lambda: MockActivityInfo()

def workflow_defn(name=None, **kwargs):
    def decorator(cls):
        cls._workflow_name = name or cls.__name__
        return cls
    return decorator

def workflow_run(func):
    func._workflow_run = True
    return func

async def workflow_execute_activity(fn, input_data=None, *args, **kwargs):
    payload = input_data or {}
    if isinstance(payload, dict):
        sig = inspect.signature(fn)
        positional_params = [
            p for p in sig.parameters.values()
            if p.kind in (
                inspect.Parameter.POSITIONAL_ONLY,
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
            )
        ]
        has_var_kwargs = any(
            p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
        )
        accepts_single_dict = len(positional_params) == 1 and not has_var_kwargs
        result = fn(payload) if accepts_single_dict else fn(**payload)
    else:
        result = fn(payload)
    import asyncio
    if asyncio.iscoroutine(result):
        return await result
    return result

mock_temporalio.workflow.defn = workflow_defn
mock_temporalio.workflow.run = workflow_run
mock_temporalio.workflow.logger = MockActivityLogger()
mock_temporalio.workflow.execute_activity = workflow_execute_activity

mock_temporalio.exceptions.ApplicationError = MockApplicationError
mock_requests.get = mock_requests_get
mock_requests.post = mock_requests_post
mock_requests.request = mock_requests_request
mock_requests.RequestException = MockRequestException

# RetryPolicy mock - accept various parameter names
class MockRetryPolicy:
    def __init__(self, maximum_attempts=None, max_retries=0, initial_interval_ms=1000, backoff_coefficient=2.0, maximum_interval_ms=10000, **kwargs):
        self.maximum_attempts = maximum_attempts or max_retries
        self.max_retries = self.maximum_attempts
        self.initial_interval_ms = initial_interval_ms
        self.backoff_coefficient = backoff_coefficient
        self.maximum_interval_ms = maximum_interval_ms

mock_temporalio.common.RetryPolicy = MockRetryPolicy

# Inject mocks into sys.modules
sys.modules['temporalio'] = mock_temporalio
sys.modules['temporalio.activity'] = mock_temporalio.activity
sys.modules['temporalio.workflow'] = mock_temporalio.workflow
sys.modules['temporalio.exceptions'] = mock_temporalio.exceptions
sys.modules['temporalio.common'] = mock_temporalio.common
sys.modules['requests'] = mock_requests

# Also make 'activity' available as a standalone import
sys.modules['activity'] = mock_temporalio.activity

# Create namespace for exec
namespace = {
    'temporalio': mock_temporalio,
    'activity': mock_temporalio.activity,
    'workflow': mock_temporalio.workflow,
}

# Read input
with open('\${inputFilePath}', 'r') as f:
    input_data = json.load(f)

# Read and execute activity code
try:
    with open('\${activityFilePath}', 'r') as f:
        activity_code = f.read()

    # Compile and execute the activity code with our namespace
    exec(compile(activity_code, '\${activityFilePath}', 'exec'), namespace)

    # Find the executable symbol
    activity_fn = namespace.get('\${fn}')
    if activity_fn is None:
        # Try to find it by name
        for name, obj in namespace.items():
            if name == '\${fn}':
                activity_fn = obj
                break

    if activity_fn is None:
        print(json.dumps({"error": "Function '\${fn}' not found in activity code", "result": None}))
        sys.exit(1)

    # Execute the activity
    # Try different calling conventions
    result = None
    try:
        import inspect
        if inspect.isclass(activity_fn):
            workflow_instance = activity_fn()
            if not hasattr(workflow_instance, 'run'):
                raise AttributeError("Workflow class does not define run()")
            result = workflow_instance.run(input_data)
        else:
            result = activity_fn(input_data)
    except TypeError as e:
        if "takes 0 positional arguments" in str(e) or "takes 1 positional argument" in str(e):
            # Try with no arguments (standalone function not expecting input_data)
            try:
                result = activity_fn()
            except TypeError:
                # Try with just self=None (for class methods)
                try:
                    result = activity_fn(None)
                except:
                    raise e
        else:
            raise e

    # Handle async results
    import asyncio
    if asyncio.iscoroutine(result):
        result = asyncio.get_event_loop().run_until_complete(result)

    print(json.dumps({"result": result, "error": None}))

except Exception as e:
    error_msg = traceback.format_exc()
    print(json.dumps({"error": str(e), "result": None, "traceback": error_msg}))
    sys.exit(1)
`;

      await fs.writeFile(runnerPath, runnerScript);
      onLog(`已写入 runner 脚本`);

      // Execute Python script using spawn
      onLog(`执行 Python 代码...`);
      const stdout = await new Promise<string>((resolve, reject) => {
        const proc = spawn('python3', [runnerPath], { timeout: 120000 });
        let stdoutData = '';
        let stderrData = '';

        proc.stdout.on('data', (data) => { stdoutData += data.toString(); });
        proc.stderr.on('data', (data) => { stderrData += data.toString(); onLog(`[Python stderr] \${data.toString().trim()}`); });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve(stdoutData);
          } else {
            // Python stdout has the JSON result/error, stderr has logger output
            // Parse stdout for actual error, use stderr only if stdout is empty
            let actualError = '';
            try {
              // Try to parse the last JSON line from stdout to get actual error
              const outputLines = stdoutData.trim().split('\\n').filter(Boolean);
              const parsed = JSON.parse(outputLines[outputLines.length - 1] || '{}');
              if (parsed.error) {
                actualError = parsed.error;
                if (parsed.traceback) {
                  actualError += '\\n' + parsed.traceback;
                }
              }
            } catch (e) {
              // stdout wasn't JSON, use it directly if it looks like an error
              if (stdoutData.trim()) {
                actualError = stdoutData.trim();
              }
            }
            // If no error found in stdout, use stderr
            if (!actualError && stderrData.trim()) {
              actualError = 'stderr: ' + stderrData.trim();
            }
            reject(new Error(`Python exited with code \${code}. Error: \${actualError || 'Unknown error'}`));
          }
        });
        proc.on('error', (err) => reject(err));
      });

      // Parse result
      let result: any;
      try {
        const outputLines = stdout.trim().split('\\n').filter(Boolean);
        result = JSON.parse(outputLines[outputLines.length - 1] || '{}');
      } catch (e) {
        onLog(`解析结果失败: \${stdout}`);
        throw new Error(`Failed to parse execution result: \${stdout}`);
      }

      if (result.error) {
        throw new Error(result.error);
      }

      return result.result;

    } finally {
      // Clean up temp files
      try {
        await fs.unlink(activityFilePath);
        await fs.unlink(inputFilePath);
        await fs.unlink(runnerPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}
