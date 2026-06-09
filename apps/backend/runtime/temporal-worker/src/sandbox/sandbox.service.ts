import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface CachedActivity {
  fn: string;
  code: string;
  lastModified: Date;
}

interface ExecutionRequest {
  code: string;
  fn: string;
  taskQueue: string;
  input?: Record<string, any>;
}

export interface ExecutionResponse {
  success: boolean;
  result?: any;
  logs?: string[];
  error?: string;
}

// Code cache directory
const CACHE_DIR = path.join(os.tmpdir(), 'temporal-sandbox-code');

@Injectable()
export class SandboxService {
  private readonly logger = new Logger('SandboxService');
  private codeCache = new Map<string, CachedActivity>();

  constructor() {
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Execute Python code in sandbox
   */
  async executeCode(request: ExecutionRequest): Promise<ExecutionResponse> {
    const { code, fn, taskQueue, input = {} } = request;
    const logs: string[] = [];

    try {
      logs.push(`[${new Date().toISOString()}] 开始执行代码...`);
      logs.push(`[${new Date().toISOString()}] 函数名: ${fn}`);
      logs.push(`[${new Date().toISOString()}] Task Queue: ${taskQueue}`);

      // Cache the code
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
   * Execute code with streaming
   */
  async executeCodeStreaming(
    request: ExecutionRequest,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const { code, fn, taskQueue, input = {} } = request;

    try {
      onLog(`[${new Date().toISOString()}] 开始执行代码...`);
      onLog(`[${new Date().toISOString()}] 函数名: ${fn}`);
      onLog(`[${new Date().toISOString()}] Task Queue: ${taskQueue}`);

      // Cache the code
      this.cacheCode(fn, code);

      // Execute Python with streaming
      const result = await this.executePython(code, fn, input, onLog);

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
    this.codeCache.set(fn, cached);

    // Write to disk for persistence
    const filePath = path.join(CACHE_DIR, `${fn}.py`);
    fs.writeFileSync(filePath, code, 'utf-8');
    this.logger.log(`Cached code for ${fn} at ${filePath}`);
  }

  /**
   * Get cached code
   */
  getCachedCode(fn: string): string | undefined {
    return this.codeCache.get(fn)?.code;
  }

  /**
   * List all cached functions
   */
  listCachedFunctions(): string[] {
    return Array.from(this.codeCache.keys());
  }

  /**
   * Execute Python code in subprocess
   */
  private executePython(
    code: string,
    fn: string,
    input: Record<string, any>,
    onLog: (log: string) => void,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const tempFile = path.join(CACHE_DIR, `execute_${fn}_${Date.now()}.py`);

      // Create a safe execution wrapper
      const wrapperCode = `
import sys
import json
import traceback

def execute_activity(code_str, fn_name, input_data):
    try:
        # Compile and execute the code
        compiled = compile(code_str, '<string>', 'exec')
        namespace = {'__name__': '__activity__'}
        exec(compiled, namespace)

        # Find the activity function
        activity_fn = None
        for name, obj in namespace.items():
            if callable(obj) and name == fn_name:
                activity_fn = obj
                break

        if activity_fn is None:
            return {"error": f"Function '{fn_name}' not found in code"}

        # Execute the activity
        result = activity_fn(**input_data)
        return {"result": result}

    except Exception as e:
        return {
            "error": str(e),
            "type": type(e).__name__
        }

input_data = json.loads(${JSON.stringify(JSON.stringify(input))})
code_str = ${JSON.stringify(code)}
fn_name = ${JSON.stringify(fn)}

result = execute_activity(code_str, fn_name, input_data)
print(json.dumps(result))
`;

      fs.writeFileSync(tempFile, wrapperCode, 'utf-8');

      const proc = spawn('python3', [tempFile], {
        cwd: CACHE_DIR,
        env: { ...process.env, PYTHONPATH: CACHE_DIR },
      });

      let output = '';
      proc.stdout.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          onLog(`[Python] ${text}`);
          output += text;
        }
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          onLog(`[Python Error] ${text}`);
        }
      });

      proc.on('close', (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }

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
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
        reject(err);
      });
    });
  }
}