import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getWorkflowValidationAgentUrl } from '../../config/service-endpoints';

@Injectable()
export class TemporalWorkflowValidationService {
  private readonly logger = new Logger(TemporalWorkflowValidationService.name);

  async validateWorkflowReal(
    code: string,
    fn: string,
    input?: Record<string, any>,
    taskQueue?: string,
    timeout?: string,
  ): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    const logs: string[] = [];

    try {
      const validationAgentUrl = this.getWorkflowValidationAgentUrl();
      const workflowId = `workflow-validate-${Date.now()}`;
      const validationInput = {
        ...(input || { test: 'workflow-validation' }),
      };
      if (!validationInput.runtimeSessionId) {
        validationInput.runtimeSessionId = workflowId;
      }
      if (!validationInput.workflowId) {
        validationInput.workflowId = workflowId;
      }

      const response = await axios.post<any>(`${validationAgentUrl}/validate-workflow`, {
        code,
        fn_name: fn,
        workflow_id: workflowId,
        input_data: validationInput,
        task_queue: taskQueue,
        timeout,
      }, {
        timeout: Number(process.env.WORKFLOW_VALIDATION_TIMEOUT_MS || 300000),
      });

      logs.push(`Workflow validation response: ${JSON.stringify(response.data)}`);

      const executionResult = response.data?.result;
      const resultSuccess =
        response.data?.success === true &&
        executionResult?.success === true &&
        !executionResult?.error;

      if (executionResult?.error) {
        logs.push(`执行错误: ${executionResult.error}`);
      }

      return {
        success: resultSuccess,
        logs,
        result: executionResult,
        error: executionResult?.error,
        score: resultSuccess ? 100 : 50,
      };
    } catch (error: any) {
      this.logger.error(`Workflow real validation failed: ${error.message}`);
      logs.push(`Error: ${error.message}`);
      return {
        success: false,
        logs,
        error: error.message,
        score: 0,
      };
    }
  }

  async validateWorkflowRealStreaming(
    code: string,
    fn: string,
    input: Record<string, any> | undefined,
    taskQueue: string | undefined,
    timeout: string | undefined,
    onLog: (log: string) => void,
  ): Promise<{ success: boolean; result?: any; logs?: string[]; traceback?: string; error?: string; score: number }> {
    const validationAgentUrl = this.getWorkflowValidationAgentUrl();
    const workflowId = `workflow-validate-${Date.now()}`;
    const validationInput = {
      ...(input || { test: 'workflow-validation' }),
    };
    if (!validationInput.runtimeSessionId) {
      validationInput.runtimeSessionId = workflowId;
    }
    if (!validationInput.workflowId) {
      validationInput.workflowId = workflowId;
    }
    const streamedLogs: string[] = [];
    const pushLog = (log: string) => {
      streamedLogs.push(log);
      onLog(log);
    };
    // #region debug-point A:stream-debug-report
    const debugReport = (hypothesisId: string, msg: string, data: Record<string, unknown>) => {
      (() => {
        const fs = require('fs');
        const envPath = '.dbg/document-render-aborted.env';
        let debugServerUrl = 'http://127.0.0.1:7777/event';
        let debugSessionId = 'document-render-aborted';
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          debugServerUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || debugServerUrl;
          debugSessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || debugSessionId;
        } catch {}
        fetch(debugServerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: debugSessionId,
            runId: 'pre-fix',
            hypothesisId,
            location: 'temporal-workflow-validation.service:validateWorkflowRealStreaming',
            msg,
            data,
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
    };
    // #endregion

    pushLog(`[${new Date().toISOString()}] 连接到 Workflow 测试 Worker: ${validationAgentUrl}`);
    pushLog(`[${new Date().toISOString()}] Workflow ID: ${workflowId}`);

    try {
      pushLog(`[${new Date().toISOString()}] 开始真实验证工作流代码...`);
      // #region debug-point A:before-agent-stream-request
      debugReport('A', '[DEBUG] validateWorkflowRealStreaming before axios.post', {
        validationAgentUrl,
        workflowId,
        fn,
        taskQueue: taskQueue || null,
        timeout: timeout || null,
      });
      // #endregion
      const response = await axios.post(`${validationAgentUrl}/validate-workflow/stream`, {
        code,
        fn_name: fn,
        workflow_id: workflowId,
        input_data: validationInput,
        task_queue: taskQueue,
        timeout,
      }, {
        responseType: 'stream',
        timeout: Number(process.env.WORKFLOW_VALIDATION_TIMEOUT_MS || 300000),
      });
      // #region debug-point A:after-agent-stream-response
      debugReport('A', '[DEBUG] validateWorkflowRealStreaming received axios stream response', {
        workflowId,
        status: response.status,
        statusText: response.statusText,
        hasReadableStream: Boolean(response.data),
      });
      // #endregion
      const stream = response.data as NodeJS.ReadableStream;

      const finalEvent = await new Promise<any>((resolve, reject) => {
        let buffer = '';
        let resolved = false;

        const processChunk = (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }
            try {
              const event = JSON.parse(line.slice(6)) as {
                type?: string;
                content?: string;
                success?: boolean;
                result?: any;
                error?: string;
                traceback?: string;
              };
              if (event.type === 'log' && event.content) {
                pushLog(event.content);
                continue;
              }
              if (event.type === 'done') {
                resolved = true;
                resolve(event);
                return;
              }
              if (event.type === 'error') {
                resolved = true;
                reject(new Error(event.content || 'Workflow validation stream failed'));
                return;
              }
            } catch (parseError: any) {
              this.logger.warn(`Failed to parse validation stream event: ${parseError?.message || parseError}`);
            }
          }
        };

        stream.on('data', (chunk: Buffer | string) => {
          processChunk(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
        });
        stream.on('end', () => {
          if (!resolved) {
            reject(new Error('Workflow validation stream ended without done event'));
          }
        });
        stream.on('error', (streamError: Error) => {
          // #region debug-point E:stream-error
          debugReport('E', '[DEBUG] validateWorkflowRealStreaming stream error', {
            workflowId,
            errorName: (streamError as any)?.name || null,
            errorMessage: streamError?.message || null,
            errorCode: (streamError as any)?.code || null,
            errorType: streamError?.constructor?.name || null,
            errorStack: streamError?.stack || null,
          });
          // #endregion
          reject(streamError);
        });
      });

      const resultSuccess = finalEvent.success === true && !finalEvent.error;
      pushLog(`[${new Date().toISOString()}] 响应状态: ${resultSuccess ? '成功' : '失败'}`);

      if (finalEvent.error) {
        pushLog(`[${new Date().toISOString()}] 执行错误: ${finalEvent.error}`);
        if (finalEvent.traceback) {
          pushLog(`[${new Date().toISOString()}] 详细堆栈:\n${finalEvent.traceback}`);
        }
      }

      const finalResult = finalEvent.result;
      if (resultSuccess) {
        pushLog(`[${new Date().toISOString()}] 执行成功，返回结果: ${JSON.stringify(finalResult, null, 2)}`);
      }

      return {
        success: resultSuccess,
        result: finalResult,
        logs: streamedLogs,
        error: finalEvent.error,
        traceback: finalEvent.traceback,
        score: resultSuccess ? 100 : 0,
      };
    } catch (error: any) {
      // #region debug-point E:outer-catch
      debugReport('E', '[DEBUG] validateWorkflowRealStreaming outer catch', {
        workflowId,
        errorName: error?.name || null,
        errorMessage: error?.message || null,
        errorCode: error?.code || null,
        errorType: error?.constructor?.name || null,
        responseStatus: error?.response?.status || null,
        responseData: typeof error?.response?.data === 'string' ? error.response.data.slice(0, 1000) : error?.response?.data || null,
        stack: error?.stack || null,
      });
      // #endregion
      this.logger.error(`Workflow real validation failed: ${error.message}`);
      pushLog(`[${new Date().toISOString()}] 错误: ${error.message}`);
      return {
        success: false,
        logs: streamedLogs,
        error: error.message,
        score: 0,
      };
    }
  }

  private getWorkflowValidationAgentUrl(): string {
    return getWorkflowValidationAgentUrl();
  }
}
