import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Activity, Prisma } from '@prisma/client';
import axios from 'axios';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const exec = promisify(require('child_process').exec);

export interface ActivityFormData {
  name: string;
  fn: string;
  timeout?: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode?: string;
}

export interface ActivityValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface GenerateCodeResult {
  success: boolean;
  code?: string;
  error?: string;
}

// AI Orchestrator URL helper
const getAiOrchestratorUrl = () => {
  if (process.env.AI_ORCHESTRATOR_URL) {
    return process.env.AI_ORCHESTRATOR_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-ai-orchestrator:3007';
  }
  const externalHost = process.env.EXTERNAL_HOST || 'localhost';
  return `http://${externalHost}:3007`;
};

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<Activity[]> {
    return this.prisma.activity.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Activity | null> {
    return this.prisma.activity.findUnique({ where: { id } });
  }

  async findByName(name: string): Promise<Activity | null> {
    return this.prisma.activity.findUnique({ where: { name } });
  }

  async create(data: ActivityFormData): Promise<Activity> {
    return this.prisma.activity.create({
      data: {
        name: data.name,
        fn: data.fn,
        timeout: data.timeout || '30s',
        retryPolicy: (data.retryPolicy || null) as any,
        handler: data.handler,
        config: data.config as any,
        generatedCode: data.generatedCode || null,
        isActive: true,
      },
    });
  }

  async update(id: string, data: Partial<ActivityFormData>): Promise<Activity> {
    return this.prisma.activity.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.fn && { fn: data.fn }),
        ...(data.timeout && { timeout: data.timeout }),
        ...(data.retryPolicy !== undefined && { retryPolicy: data.retryPolicy as any }),
        ...(data.handler && { handler: data.handler }),
        ...(data.config && { config: data.config as any }),
        ...(data.generatedCode !== undefined && { generatedCode: data.generatedCode }),
      },
    });
  }

  async delete(id: string): Promise<{ success: boolean }> {
    await this.prisma.activity.delete({ where: { id } });
    return { success: true };
  }

  async validate(config: ActivityFormData): Promise<ActivityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!config.name || config.name.trim() === '') {
      errors.push('Activity name is required');
    } else if (config.name.length > 255) {
      errors.push('Activity name must be less than 255 characters');
    }

    if (!config.fn || config.fn.trim() === '') {
      errors.push('Function name is required');
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.fn)) {
      errors.push('Function name must be a valid identifier');
    }

    const validHandlers = ['api', 'carbone', 'browser', 'script'];
    if (!config.handler || !validHandlers.includes(config.handler)) {
      errors.push(`Handler must be one of: ${validHandlers.join(', ')}`);
    }

    if (config.timeout) {
      const timeoutRegex = /^\d+[smh]$/;
      if (!timeoutRegex.test(config.timeout)) {
        errors.push('Timeout must be in format: 30s, 1m, 1h');
      }
    }

    // Handle validation based on whether steps are defined
    const steps: any[] = config.config?.steps || [];
    if (steps.length > 0) {
      // Validate each step
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.name) {
          errors.push(`Step ${i + 1} is missing a name`);
        }
        if (!step.type || !validHandlers.includes(step.type)) {
          errors.push(`Step ${i + 1} has invalid handler type`);
        }
        if (step.type === 'api' && !step.config?.endpoint) {
          errors.push(`Step ${i + 1} (API) requires endpoint in config`);
        }
        if (step.type === 'script' && !step.config?.script) {
          errors.push(`Step ${i + 1} (Script) requires script in config`);
        }
      }
      suggestions.push('Steps are defined - AI code will be generated based on step configurations');
    } else {
      // No steps - validate at top level (legacy behavior)
      switch (config.handler) {
        case 'api':
          if (!config.config?.endpoint) {
            errors.push('API handler requires endpoint in config');
          }
          break;
        case 'script':
          if (!config.config?.script) {
            errors.push('Script handler requires script in config');
          }
          break;
      }
    }

    if (config.retryPolicy && config.retryPolicy.maxRetries < 0) {
      errors.push('maxRetries must be non-negative');
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);

    return { isValid: errors.length === 0, score, errors, warnings, suggestions };
  }

  /**
   * Generate Python code using AI
   */
  async generateCode(config: ActivityFormData, errorContext?: string): Promise<GenerateCodeResult> {
    const logger = new Logger('ActivityService');

    // Build a detailed prompt for code generation
    const description = config.config?.description || '';
    const steps = config.config?.steps || [];
    const heartbeatTimeout = config.config?.heartbeatTimeout;
    const retryPolicy = config.retryPolicy;
    const idempotencyKey = config.config?.idempotencyKey;

    // Build prompt using array join to avoid template literal nesting issues
    const promptParts: string[] = [
      '你是一个 Python 开发专家。请根据以下 Activity 配置生成符合沙箱环境要求的 Python Activity 代码。',
      '',
      '【重要】此代码将在沙箱环境执行，沙箱环境限制：',
      '1. 使用 requests 库（已通过 urllib mock）进行 HTTP 请求，不要使用 aiohttp/httpx',
      '2. 不要使用 @activity.defn 装饰器，定义为普通 async 函数即可',
      '3. 使用 print() 进行日志输出，不要使用 activity.logger',
      '4. 不要导入 temporalio 相关模块',
      `5. 函数签名：async def ${config.fn}() -> Dict[str, Any]:`,
      '6. 返回值为字典类型，包含执行结果和错误信息',
      '7. 不要使用 temporalio.exceptions.ApplicationError，使用普通 Exception 即可',
      '',
    ];

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
      `- 超时：${config.timeout || '30s'}`,
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
      promptParts.push(stepDesc);
    });

    const prompt = promptParts.join('\n');

    try {
      const aiOrchestratorUrl = getAiOrchestratorUrl();
      logger.log(`Calling AI orchestrator at ${aiOrchestratorUrl}/ai/model/call`);

      const response = await axios.post<{ result: string }>(
        `${aiOrchestratorUrl}/ai/model/call`,
        {
          modelId: 'MiniMax-M2.7',  // Use MiniMax model
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
            code = code.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
          }
        }

        logger.log('Successfully generated code');
        return { success: true, code };
      } else {
        return { success: false, error: 'AI returned empty response' };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`AI code generation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

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
    const logger = new Logger('ActivityService.executeCode');
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
   * Execute code with streaming callback for real-time logs
   */
  async executeCodeStreaming(
    code: string,
    fn: string,
    taskQueue: string,
    input: Record<string, any> | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const logger = new Logger('ActivityService.executeCodeStreaming');

    // Try to use sandbox agent via Temporal workflow
    const sandboxUrl = this.getSandboxAgentUrl();
    if (sandboxUrl) {
      try {
        onLog(`[${new Date().toISOString()}] 使用 Temporal Sandbox Agent 执行代码...`);
        return await this.executeCodeViaSandboxAgent(sandboxUrl, code, fn, input, onLog);
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
  private getSandboxAgentUrl(): string | null {
    // Check for sandbox agent URL in environment
    if (process.env.SANDBOX_AGENT_URL) {
      return process.env.SANDBOX_AGENT_URL;
    }
    // In Docker, use the container name
    if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
      return 'http://ops-temporal-sandbox-agent:8090';
    }
    // Local development - try localhost
    const externalHost = process.env.EXTERNAL_HOST || 'localhost';
    return `http://${externalHost}:8090`;
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
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    onLog(`[${new Date().toISOString()}] 连接到 Sandbox Agent: ${sandboxUrl}`);
    onLog(`[${new Date().toISOString()}] Activity ID: ${activityId}`);

    try {
      const response = await axios.post(`${sandboxUrl}/execute`, {
        code,
        fn_name: fn,
        activity_id: activityId,
        input_data: input || {},
      }, {
        timeout: 300000, // 5 minute timeout
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = response.data as any;

      // Check if the sandbox agent itself returned an error
      if (data.success === false || data.error || data.status_code >= 400) {
        const errorMsg = data.error || data.message || JSON.stringify(data);
        onLog(`[${new Date().toISOString()}] 执行错误: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      if (data.result) {
        // Check if the activity returned an error result (not a successful execution)
        if (data.result.success === false || data.result.error) {
          const errorMsg = data.result.traceback
            ? `执行失败: ${data.result.error}\n\n详细信息:\n${data.result.traceback}`
            : data.result.error || JSON.stringify(data.result);
          onLog(`[${new Date().toISOString()}] ${errorMsg}`);
          return { success: false, error: errorMsg };
        }
      }

      // Extract the actual result from the sandbox response
      // The sandbox returns { success: true, result: { result: {...}, success: true } }
      const result = data.result?.result || data.result;

      // Log the result structure for debugging
      onLog(`[${new Date().toISOString()}] Result结构: ${JSON.stringify({result_success: data.result?.success, inner_success: result?.success, has_error: !!result?.error})}`);

      // Check if the activity itself returned an error (even if HTTP was successful)
      // The result may have: { success: false, error: "..." } OR { status: "failed", errors: [...] }
      // Note: result.success could be undefined (not explicitly false), so we check both success===false and status==='failed'
      if (result && (result.success === false || result.status === 'failed')) {
        const errorMsg = result.error || (result.errors ? result.errors.join('; ') : JSON.stringify(result));
        onLog(`[${new Date().toISOString()}] 执行失败: ${errorMsg}`);
        return { success: false, error: errorMsg, result };
      }

      onLog(`[${new Date().toISOString()}] 执行成功`);
      return { success: true, result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onLog(`[${new Date().toISOString()}] Sandbox Agent 请求失败: ${errorMsg}`);
      throw error; // Re-throw to trigger fallback
    }
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
        const match = code.match(/```(?:python)?\n?([\s\S]*?)```/);
        if (match) {
          cleanCode = match[1].trim();
        } else {
          // Fallback for weird markdown
          cleanCode = code.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
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

# Set SSL certificates location for HTTPS requests
import certifi
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# Add temp dir to path for imports
sys.path.insert(0, '${tempDir}')

# Mock temporalio module for standalone execution
class MockActivityLogger:
    def info(self, msg): print(f"[INFO] {msg}", flush=True)
    def warning(self, msg): print(f"[WARN] {msg}", flush=True)
    def error(self, msg): print(f"[ERROR] {msg}", flush=True)

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
    def __init__(self, message, non_retryable=False, *args, **kwargs):
        super().__init__(message, *args, **kwargs)
        self.message = message
        self.non_retryable = non_retryable

# Create mock temporalio module as a proper ModuleType with submodules
mock_temporalio = types.ModuleType('temporalio')
mock_temporalio.activity = types.ModuleType('temporalio.activity')
mock_temporalio.exceptions = types.ModuleType('temporalio.exceptions')
mock_temporalio.common = types.ModuleType('temporalio.common')

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

mock_temporalio.exceptions.ApplicationError = MockApplicationError

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
sys.modules['temporalio.exceptions'] = mock_temporalio.exceptions
sys.modules['temporalio.common'] = mock_temporalio.common

# Also make 'activity' available as a standalone import
sys.modules['activity'] = mock_temporalio.activity

# Create namespace for exec
namespace = {
    'temporalio': mock_temporalio,
    'activity': mock_temporalio.activity,
}

# Read input
with open('${inputFilePath}', 'r') as f:
    input_data = json.load(f)

# Read and execute activity code
try:
    with open('${activityFilePath}', 'r') as f:
        activity_code = f.read()

    # Compile and execute the activity code with our namespace
    exec(compile(activity_code, '${activityFilePath}', 'exec'), namespace)

    # Find the activity function
    activity_fn = namespace.get('${fn}')
    if activity_fn is None:
        # Try to find it by name
        for name, obj in namespace.items():
            if callable(obj) and name == '${fn}':
                activity_fn = obj
                break

    if activity_fn is None:
        print(json.dumps({"error": "Function '${fn}' not found in activity code", "result": None}))
        sys.exit(1)

    # Execute the activity
    # Try different calling conventions
    result = None
    try:
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
        proc.stderr.on('data', (data) => { stderrData += data.toString(); onLog(`[Python stderr] ${data.toString().trim()}`); });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve(stdoutData);
          } else {
            // Python stdout has the JSON result/error, stderr has logger output
            // Parse stdout for actual error, use stderr only if stdout is empty
            let actualError = '';
            try {
              // Try to parse stdout as JSON to get actual error
              const parsed = JSON.parse(stdoutData.trim());
              if (parsed.error) {
                actualError = parsed.error;
                if (parsed.traceback) {
                  actualError += '\n' + parsed.traceback;
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
            reject(new Error(`Python exited with code ${code}. Error: ${actualError || 'Unknown error'}`));
          }
        });
        proc.on('error', (err) => reject(err));
      });

      // Parse result
      let result: any;
      try {
        result = JSON.parse(stdout.trim());
      } catch (e) {
        onLog(`解析结果失败: ${stdout}`);
        throw new Error(`Failed to parse execution result: ${stdout}`);
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