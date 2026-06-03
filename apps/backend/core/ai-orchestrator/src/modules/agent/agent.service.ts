import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AIAgentDTO, CreateAgentDTO, ChatMessage, ExecuteActivityResponseDTO } from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const exec = promisify(require('child_process').exec);

/**
 * 验证函数名/任务队列名仅含合法字符（字母、数字、下划线、连字符、点）
 * 防止命令注入攻击
 */
const SAFE_IDENTIFIER_RE = /^[a-zA-Z0-9_\-.]+$/;
function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER_RE.test(value)) {
    throw new Error(
      `[Security] ${label} contains invalid characters: "${value}". ` +
      'Only alphanumeric characters, underscores, hyphens and dots are allowed.',
    );
  }
}

/**
 * Agent Service
 * Creates and manages AI agent instances
 * Each agent is bound to a specific model and optionally a session
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private agents: Map<string, AIAgentDTO> = new Map();
  private agentClients: Map<string, OpenAICompatibleClient> = new Map();
  private agentContexts: Map<string, ChatMessage[]> = new Map();

  /**
   * Create a new AI agent instance
   */
  async createAgent(dto: CreateAgentDTO, client?: OpenAICompatibleClient): Promise<AIAgentDTO> {
    const id = uuidv4();
    const now = new Date();

    const agent: AIAgentDTO = {
      id,
      model_id: dto.model_id,
      session_id: dto.session_id,
      status: 'idle',
      created_at: now,
    };

    this.agents.set(id, agent);

    // Store client if provided
    if (client) {
      this.agentClients.set(id, client);
    }

    // Initialize empty context for chat history
    this.agentContexts.set(id, []);

    return agent;
  }

  /**
   * Get an agent by ID
   */
  async getAgent(id: string): Promise<AIAgentDTO | null> {
    return this.agents.get(id) || null;
  }

  /**
   * List agents by session ID
   */
  async listAgentsBySession(sessionId: string): Promise<AIAgentDTO[]> {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.session_id === sessionId,
    );
  }

  /**
   * List agents by model ID
   */
  async listAgentsByModel(modelId: string): Promise<AIAgentDTO[]> {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.model_id === modelId,
    );
  }

  /**
   * Set agent client for chat operations
   */
  setAgentClient(id: string, client: OpenAICompatibleClient): void {
    this.agentClients.set(id, client);
  }

  /**
   * Get agent client
   */
  getAgentClient(id: string): OpenAICompatibleClient | null {
    return this.agentClients.get(id) || null;
  }

  /**
   * Update agent status
   */
  async setAgentStatus(id: string, status: 'idle' | 'active' | 'error'): Promise<AIAgentDTO | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const updatedAgent: AIAgentDTO = {
      ...agent,
      status,
    };

    this.agents.set(id, updatedAgent);
    return updatedAgent;
  }

  /**
   * Send a message through the agent
   * Maintains conversation context
   */
  async sendMessage(id: string, message: string, systemPrompt?: string): Promise<string> {
    const client = this.agentClients.get(id);
    if (!client) {
      throw new Error('Agent client not initialized');
    }

    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // Update status to active
    await this.setAgentStatus(id, 'active');

    // Build message history
    const context = this.agentContexts.get(id) || [];
    const messages: ChatMessage[] = [];

    // Add system prompt if provided and context is empty
    if (systemPrompt && context.length === 0) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add existing context
    messages.push(...context);

    // Add new user message
    messages.push({ role: 'user', content: message });

    try {
      const response = await client.chatCompletion(messages);

      // Add response to context
      context.push({ role: 'user', content: message });
      context.push({ role: 'assistant', content: response.content });
      this.agentContexts.set(id, context);

      // Update status back to idle
      await this.setAgentStatus(id, 'idle');

      return response.content;
    } catch (error) {
      await this.setAgentStatus(id, 'error');
      throw error;
    }
  }

  /**
   * Clear agent conversation context
   */
  clearContext(id: string): void {
    this.agentContexts.set(id, []);
  }

  /**
   * Get agent conversation context
   */
  getContext(id: string): ChatMessage[] {
    return this.agentContexts.get(id) || [];
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<boolean> {
    const exists = this.agents.has(id);
    if (exists) {
      this.agents.delete(id);
      this.agentClients.delete(id);
      this.agentContexts.delete(id);
    }
    return exists;
  }

  /**
   * Bind agent to a session
   */
  async bindToSession(id: string, sessionId: string): Promise<AIAgentDTO | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const updatedAgent: AIAgentDTO = {
      ...agent,
      session_id: sessionId,
    };

    this.agents.set(id, updatedAgent);
    return updatedAgent;
  }

  /**
   * Unbind agent from session
   */
  async unbindFromSession(id: string): Promise<AIAgentDTO | null> {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const updatedAgent: AIAgentDTO = {
      ...agent,
      session_id: undefined,
    };

    this.agents.set(id, updatedAgent);
    return updatedAgent;
  }

  async executeActivity(
    code: string,
    fn: string,
    taskQueue: string,
    input?: Record<string, any>,
  ): Promise<ExecuteActivityResponseDTO> {
    // ⚠️ 安全门控：此端点仅用于开发/测试目的，生产环境必须显式开启才可使用。
    // 设置环境变量 ENABLE_AGENT_EXECUTE_ACTIVITY=true 以启用（不建议在生产开启）。
    if (process.env.ENABLE_AGENT_EXECUTE_ACTIVITY !== 'true') {
      this.logger.warn('executeActivity endpoint is disabled. Set ENABLE_AGENT_EXECUTE_ACTIVITY=true to enable (not recommended in production).');
      return {
        success: false,
        error: 'This endpoint is disabled. It is intended for development/testing only and must be explicitly enabled via ENABLE_AGENT_EXECUTE_ACTIVITY=true.',
        logs: [],
      };
    }

    // 参数白名单校验：防止命令注入
    assertSafeIdentifier(fn, 'fn');
    assertSafeIdentifier(taskQueue, 'taskQueue');

    this.logger.log(`Executing activity function: ${fn} on task queue: ${taskQueue}`);
    const logs: string[] = [];

    // Create a temporary directory for the Python activity code and input
    const tempDir = '/tmp/temporal_activity_runner';
    await fs.mkdir(tempDir, { recursive: true });
    const tempActivityFilePath = path.join(tempDir, `activity_${Date.now()}.py`);
    const tempInputFilePath = path.join(tempDir, `input_${Date.now()}.json`);
    const tempRunnerScriptPath = path.join(tempDir, `temporal_activity_runner.py`);

    try {
      // Write the activity code to a temporary file
      await fs.writeFile(tempActivityFilePath, code);
      logs.push(`[${new Date().toISOString()}] Activity code written to ${tempActivityFilePath}`);

      // Write the input to a temporary JSON file
      await fs.writeFile(tempInputFilePath, JSON.stringify(input || {}));
      logs.push(`[${new Date().toISOString()}] Activity input written to ${tempInputFilePath}`);

      // Write the runner script to a temporary file
      const runnerScriptContent = `
import asyncio
import json
import os
import sys
import argparse
from datetime import timedelta
from temporalio import activity, worker, client

# Dynamic import of the activity module
async def run_activity(activity_file_path: str, fn_name: str, task_queue: str, input_data: dict):
    # Add the directory of the activity file to sys.path
    activity_dir = os.path.dirname(activity_file_path)
    if activity_dir not in sys.path:
        sys.path.insert(0, activity_dir)

    module_name = os.path.basename(activity_file_path).replace('.py', '')
    
    # Dynamically import the activity module
    activity_module = __import__(module_name)

    # Get the activity function from the module
    activity_fn = getattr(activity_module, fn_name)

    # For testing, we'll simulate a worker and client call
    # In a real scenario, this would involve a running Temporal worker and a workflow calling the activity.
    # For direct execution and testing, we'll call the activity function directly.
    # Note: This direct call bypasses the Temporal worker's retry and heartbeat mechanisms.
    # A more robust test would involve spinning up a mini-worker.

    # Simulate activity context for heartbeat if the activity uses it
    class MockActivityContext:
        def __init__(self):
            self.heartbeat_details = []
            self.logger = activity.logger

        def heartbeat(self, *details):
            self.heartbeat_details.append(details)
            self.logger.info(f"Mock Heartbeat: {details}")

    # Temporarily set the activity context
    original_current_activity = activity._activity_context
    activity._activity_context = MockActivityContext()

    try:
        result = activity_fn(input_data)
        if asyncio.iscoroutine(result):
            result = await result
        print(json.dumps({"result": result, "logs": []}))
    except Exception as e:
        activity.logger.error(f"Activity execution error: {e}")
        print(json.dumps({"error": str(e), "logs": []}), file=sys.stderr)
        sys.exit(1)
    finally:
        # Restore original activity context
        activity._activity_context = original_current_activity
        # Clean up dynamic import cache to avoid issues in subsequent runs
        sys.modules.pop(module_name, None)
        if module_name in globals():
            del globals()[module_name]

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Execute a Temporal Activity function.")
    parser.add_argument("--activity-file", required=True, help="Path to the Python activity file.")
    parser.add_argument("--fn", required=True, help="Name of the activity function to execute.")
    parser.add_argument("--task-queue", required=True, help="Temporal Task Queue (for context, not used in direct execution).")
    parser.add_argument("--input-file", required=True, help="Path to a JSON file containing the activity input.")
    
    args = parser.parse_args()

    with open(args.input_file, 'r') as f:
        activity_input = json.load(f)

    asyncio.run(run_activity(args.activity_file, args.fn, args.task_queue, activity_input))
`;
      await fs.writeFile(tempRunnerScriptPath, runnerScriptContent);
      logs.push(`[${new Date().toISOString()}] Runner script written to ${tempRunnerScriptPath}`);

      // Command to execute the Python script that runs the Temporal Activity
      const command = `python ${tempRunnerScriptPath} \
        --activity-file ${tempActivityFilePath} \
        --fn ${fn} \
        --task-queue ${taskQueue} \
        --input-file ${tempInputFilePath}`;

      this.logger.log(`Running command: ${command}`);
      logs.push(`[${new Date().toISOString()}] Running command: ${command}`);

      const { stdout, stderr } = await exec(command, { timeout: 120000 }); // 120 seconds timeout

      if (stdout) {
        logs.push(`[${new Date().toISOString()}] Stdout: ${stdout}`);
      }
      if (stderr) {
        logs.push(`[${new Date().toISOString()}] Stderr: ${stderr}`);
      }

      // Parse the result from stdout (assuming the Python script prints JSON result)
      let result: any;
      let errorResult: string | undefined;
      
      // Check for error in stderr first
      if (stderr) {
          try {
              const errJson = JSON.parse(stderr);
              if (errJson.error) {
                  errorResult = errJson.error;
              }
          } catch (e) {
              // If stderr is not JSON, treat it as a raw error message
              errorResult = stderr;
          }
      }

      if (errorResult) {
          return { success: false, error: errorResult, logs };
      }

      try {
        result = JSON.parse(stdout);
      } catch (parseError: any) {
        this.logger.error(`Failed to parse stdout as JSON: ${parseError.message}. Raw stdout: ${stdout}`);
        logs.push(`[${new Date().toISOString()}] Error parsing result: ${parseError.message}. Raw stdout: ${stdout}`);
        return { success: false, error: 'Invalid JSON response from activity execution', logs };
      }

      return { success: true, result: result.result, logs };
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to execute activity: ${errorMsg}. Stderr: ${error.stderr}`);
      logs.push(`[${new Date().toISOString()}] Execution failed: ${errorMsg}. Stderr: ${error.stderr}`);
      return { success: false, error: errorMsg, logs };
    } finally {
      // Clean up temporary files
      await fs.rm(tempActivityFilePath, { force: true });
      await fs.rm(tempInputFilePath, { force: true });
      await fs.rm(tempRunnerScriptPath, { force: true });
      this.logger.log('Cleaned up temporary files');
    }
  }
}
