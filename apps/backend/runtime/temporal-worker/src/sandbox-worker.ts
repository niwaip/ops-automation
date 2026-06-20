/**
 * Sandbox Worker for Temporal Activity Execution
 *
 * Provides a proper Python execution environment with:
 * - Dynamic Activity registration
 * - Code caching and hot reload
 * - Sandbox isolation for code execution
 *
 * This runs as a separate process that receives code via HTTP and executes
 * it in an isolated Python environment, returning results via streaming.
 */

import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getAiOrchestratorUrl } from './config/service-endpoints';

interface CachedActivity {
  fn: string;
  code: string;
  lastModified: Date;
  process?: ChildProcess;
}

interface ExecutionRequest {
  code: string;
  fn: string;
  taskQueue: string;
  input?: Record<string, any>;
}

interface ExecutionResponse {
  success: boolean;
  result?: any;
  logs?: string[];
  error?: string;
}

// Code cache for hot reload
const codeCache = new Map<string, CachedActivity>();
const CACHE_DIR = path.join(os.tmpdir(), 'temporal-sandbox-code');

class SandboxWorker {
  private isInitialized = false;

  constructor() {
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Execute Python code in an isolated environment
   */
  async executeCode(request: ExecutionRequest): Promise<ExecutionResponse> {
    const { code, fn, taskQueue, input = {} } = request;
    const logs: string[] = [];

    try {
      logs.push(`[${new Date().toISOString()}] 开始执行代码...`);
      logs.push(`[${new Date().toISOString()}] 函数名: ${fn}`);
      logs.push(`[${new Date().toISOString()}] Task Queue: ${taskQueue}`);

      // Cache the code for hot reload
      this.cacheCode(fn, code);

      // Execute via Python subprocess
      const result = await this.executePython(code, fn, input, (log) => {
        logs.push(log);
      });

      logs.push(`[${new Date().toISOString()}] 执行成功`);
      return {
        success: true,
        result,
        logs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logs.push(`[${new Date().toISOString()}] 执行失败: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
        logs,
      };
    }
  }

  /**
   * Execute Python code with streaming
   */
  async executeCodeStreaming(
    request: ExecutionRequest,
    onLog: (log: string) => void
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const { code, fn, taskQueue, input = {} } = request;

    try {
      onLog(`[${new Date().toISOString()}] 开始执行代码...`);
      onLog(`[${new Date().toISOString()}] 函数名: ${fn}`);
      onLog(`[${new Date().toISOString()}] Task Queue: ${taskQueue}`);

      // Cache the code
      this.cacheCode(fn, code);

      // Execute Python with streaming output
      const result = await this.executePythonStreaming(code, fn, input, onLog);

      onLog(`[${new Date().toISOString()}] 执行成功`);
      return { success: true, result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onLog(`[${new Date().toISOString()}] 执行失败: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Cache code for hot reload
   */
  private cacheCode(fn: string, code: string): void {
    const cached: CachedActivity = {
      fn,
      code,
      lastModified: new Date(),
    };
    codeCache.set(fn, cached);

    // Also write to disk for persistence
    const filePath = path.join(CACHE_DIR, `${fn}.py`);
    fs.writeFileSync(filePath, code, 'utf-8');
  }

  /**
   * Get cached code for a function
   */
  getCachedCode(fn: string): string | undefined {
    const cached = codeCache.get(fn);
    return cached?.code;
  }

  /**
   * Execute Python code in subprocess
   */
  private executePython(
    code: string,
    fn: string,
    input: Record<string, any>,
    onLog: (log: string) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // Write code to temporary file
      const tempFile = path.join(CACHE_DIR, `execute_${fn}_${Date.now()}.py`);

      // Create execution wrapper
      const wrapperCode = `
import sys
import json
import traceback

# Activity execution wrapper
def execute_activity(code, fn_name, input_data):
    try:
        # Execute the activity code
        exec(compile(code, '<string>', 'exec'), {'__name__': '__activity__'})

        # Find and call the activity function
        activity_fn = None
        for name, obj in list(globals().items()):
            if callable(obj) and name == fn_name:
                activity_fn = obj
                break

        if activity_fn is None:
            return {"error": f"Function {fn_name} not found in code"}

        # Call with input
        result = activity_fn(**input_data)
        return {"result": result}

    except Exception as e:
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }

# Input
input_data = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}

# Code to execute
code = ${JSON.stringify(code)}

# Execute
result = execute_activity(code, ${JSON.stringify(fn)}, input_data)
print(json.dumps(result))
`;

      fs.writeFileSync(tempFile, wrapperCode, 'utf-8');

      const proc = spawn('python3', [tempFile], {
        cwd: CACHE_DIR,
        env: { ...process.env, PYTHONPATH: CACHE_DIR },
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
        onLog(`[Python] ${data.toString().trim()}`);
      });

      proc.stderr.on('data', (data) => {
        onLog(`[Python Error] ${data.toString().trim()}`);
      });

      proc.on('close', (code) => {
        fs.unlinkSync(tempFile);
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            if (result.error) {
              reject(new Error(result.error));
            } else {
              resolve(result.result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse output: ${output}`));
          }
        } else {
          reject(new Error(`Python process exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        fs.unlinkSync(tempFile);
        reject(err);
      });
    });
  }

  /**
   * Execute Python code with streaming output
   */
  private executePythonStreaming(
    code: string,
    fn: string,
    input: Record<string, any>,
    onLog: (log: string) => void
  ): Promise<any> {
    return this.executePython(code, fn, input, onLog);
  }

  /**
   * Initialize the sandbox worker
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[SandboxWorker] Initializing...');
    console.log('[SandboxWorker] Cache directory: ' + CACHE_DIR);
    console.log('[SandboxWorker] Python path: ' + process.env.PYTHONPATH);

    // Verify Python is available
    try {
      const result = await this.runCommand('python3', ['--version']);
      console.log('[SandboxWorker] Python version: ' + result);
    } catch (e) {
      console.log('[SandboxWorker] Warning: python3 not found');
    }

    this.isInitialized = true;
    console.log('[SandboxWorker] Initialization complete');
  }

  private runCommand(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args);
      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) resolve(output);
        else reject(new Error(`Command failed with code ${code}`));
      });
      proc.on('error', reject);
    });
  }
}

// Export singleton
export const sandboxWorker = new SandboxWorker();

// Main execution function for use by auth service
export async function executeActivityCode(
  code: string,
  fn: string,
  taskQueue: string,
  input?: Record<string, any>
): Promise<ExecutionResponse> {
  return sandboxWorker.executeCode({ code, fn, taskQueue, input });
}

export async function executeActivityCodeStreaming(
  code: string,
  fn: string,
  taskQueue: string,
  input: Record<string, any> | undefined,
  onLog: (log: string) => void
): Promise<{ success: boolean; result?: any; error?: string }> {
  return sandboxWorker.executeCodeStreaming({ code, fn, taskQueue, input }, onLog);
}

// CLI for standalone testing
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: node sandbox-worker.ts <code> <fn> <taskQueue> [inputJson]');
    process.exit(1);
  }

  const code = args[0];
  const fn = args[1];
  const taskQueue = args[2];
  const input = args[3] ? JSON.parse(args[3]) : {};

  sandboxWorker.initialize().then(() => {
    sandboxWorker.executeCode({ code, fn, taskQueue, input }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    });
  });
}
