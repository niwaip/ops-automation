import { Injectable, Logger } from '@nestjs/common';
import { ControlPlaneClient } from '../../client/control-plane.client';
import {
  CONTROL_PLANE_APPROVAL_STATUS,
  CONTROL_PLANE_EVENT_TYPE,
  CONTROL_PLANE_EXECUTION_STATUS,
  LEGACY_CONTROL_PLANE_EVENT_TYPE,
  isTerminalControlPlaneExecutionStatus,
} from '../../client/control-plane.contracts';
import { StreamEventType } from '../react-engine/interfaces';
import type { LLMUsage, StreamEvent } from '../react-engine/interfaces';
import type { ChatUserContext, WaitingInputSemantic } from './chat.types';
import { ChatWaitingInputService } from './chat-waiting-input.service';

@Injectable()
export class ChatExecutionStreamService {
  private readonly logger = new Logger(ChatExecutionStreamService.name);

  constructor(
    private readonly controlPlaneClient: ControlPlaneClient,
    private readonly waitingInputService: ChatWaitingInputService,
  ) {}

  async *observeExecution(
    executionId: string,
    authToken?: string,
    user?: ChatUserContext,
  ): AsyncGenerator<StreamEvent> {
    this.logger.log(`Starting to observe execution ${executionId} via control-plane stream`);

    try {
      const immediateStateEvent = await this.buildLatestExecutionStateEvent(executionId, authToken, user);
      if (immediateStateEvent) {
        yield immediateStateEvent;
        return;
      }

      const stream = await this.controlPlaneClient.streamExecutionEvents(
        executionId,
        this.waitingInputService.buildControlPlaneRequestOptions(authToken, user),
      );
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }

          try {
            const rawData = line.substring(6);
            const event = JSON.parse(rawData);
            this.logger.debug(`Received execution event: ${event.eventType} for ${executionId}`);

            if (
              event.eventType === CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED &&
              isTerminalControlPlaneExecutionStatus(event.payload.newStatus)
            ) {
              const terminalEvent = await this.buildTerminalExecutionEvent(
                executionId,
                event.payload.newStatus,
                authToken,
                user,
              );
              if (terminalEvent) {
                yield terminalEvent;
              }
              this.logger.log(`Execution ${executionId} reached terminal state: ${event.payload.newStatus}`);
              return;
            }

            const streamEvent = this.mapExecutionEventToStreamEvent(event);
            if (streamEvent) {
              yield streamEvent;
            }
          } catch (error) {
            this.logger.error(`Failed to parse execution event: ${line}`, error);
          }
        }
      }

      const latestEvent = await this.buildLatestExecutionStateEvent(executionId, authToken, user);
      if (latestEvent) {
        yield latestEvent;
      }
    } catch (error: any) {
      this.logger.error(`Error observing execution ${executionId}`, error);
      yield {
        type: StreamEventType.ERROR,
        content: `观察执行进度时出错: ${error.message}`,
      };
    }
  }

  async buildLatestExecutionStateEvent(
    executionId: string,
    authToken?: string,
    user?: ChatUserContext,
  ): Promise<StreamEvent | null> {
    try {
      const execution = await this.controlPlaneClient.getExecution<{
        id: string;
        status: string;
        approvalStatus?: string;
        usage?: LLMUsage;
        normalizedInput?: {
          requiredInputs?: Array<{
            name?: string;
            description?: string;
            group_label?: string;
            display_name?: string;
            missing?: boolean;
            needs_confirmation?: boolean;
          }>;
        };
      }>(executionId, this.waitingInputService.buildControlPlaneRequestOptions(authToken, user));

      const status = execution.status;
      const usage = execution.usage;

      if (isTerminalControlPlaneExecutionStatus(status)) {
        return this.buildTerminalExecutionEvent(executionId, status, authToken, user);
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
        const waitingInputDetails = await this.waitingInputService.loadWaitingInputDetails(executionId, authToken, user);
        const missingInputs = waitingInputDetails.missingInputs;
        const semantic = this.waitingInputService.extractExecutionSemantic(execution);
        return {
          type: StreamEventType.WAITING_INPUT,
          content: this.waitingInputService.formatWaitingInputMessage({
            executionId,
            missingInputs,
            semantic,
          }),
          data: {
            executionId,
            status,
            hasBusinessResult: false,
            missingInputs,
            semantic,
            usage,
          },
        };
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL) {
        return {
          type: StreamEventType.RESULT,
          content: `任务需要审批后才能继续执行。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            approvalStatus: execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING,
            hasBusinessResult: false,
            usage,
          },
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to load latest execution state for ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private async buildTerminalExecutionEvent(
    executionId: string,
    status:
      | typeof CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.FAILED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.CANCELLED,
    authToken?: string,
    user?: ChatUserContext,
  ): Promise<StreamEvent | null> {
    try {
      const execution = await this.controlPlaneClient.getExecution<{
        id: string;
        status: string;
        result?: unknown;
        resultJson?: unknown;
        failureReason?: string;
        usage?: LLMUsage;
      }>(executionId, this.waitingInputService.buildControlPlaneRequestOptions(authToken, user));
      const rawResult = execution.resultJson ?? execution.result;

      if (status === CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED) {
        if (rawResult !== null && rawResult !== undefined) {
          const downloadUrl = this.extractDownloadUrl(rawResult);
          const temporalLink = this.extractTemporalLink(rawResult);
          return {
            type: StreamEventType.RESULT,
            content: this.formatExecutionResult(rawResult, executionId),
            data: {
              executionId,
              status,
              result: rawResult,
              downloadUrl,
              temporalLink,
              hasBusinessResult: true,
              usage: execution.usage,
            },
          };
        }

        return {
          type: StreamEventType.RESULT,
          content: `任务已完成，但该任务没有可直接展示的返回结果。\n\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            hasBusinessResult: false,
            usage: execution.usage,
          },
        };
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.FAILED) {
        return {
          type: StreamEventType.ERROR,
          content: `任务执行失败。\n\n原因: ${execution.failureReason || '未知原因'}\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            usage: execution.usage,
          },
        };
      }

      return {
        type: StreamEventType.RESULT,
        content: `任务已取消。\n\n执行单 ID: ${executionId}`,
        data: {
          executionId,
          status,
          hasBusinessResult: false,
          usage: execution.usage,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load execution detail for terminal event ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.fallbackTerminalExecutionEvent(executionId, status);
    }
  }

  private fallbackTerminalExecutionEvent(
    executionId: string,
    status:
      | typeof CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.FAILED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.CANCELLED,
  ): StreamEvent {
    if (status === CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED) {
      return {
        type: StreamEventType.RESULT,
        content: `任务已完成。\n\n执行单 ID: ${executionId}`,
        data: { executionId, status, hasBusinessResult: false },
      };
    }

    if (status === CONTROL_PLANE_EXECUTION_STATUS.FAILED) {
      return {
        type: StreamEventType.ERROR,
        content: `任务执行失败。\n\n执行单 ID: ${executionId}`,
        data: { executionId, status },
      };
    }

    return {
      type: StreamEventType.RESULT,
      content: `任务已取消。\n\n执行单 ID: ${executionId}`,
      data: { executionId, status, hasBusinessResult: false },
    };
  }

  private formatExecutionResult(result: unknown, executionId: string): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      const preferredFields = ['finalAnswer', 'formatted_output', 'summary', 'message', 'text', 'content', 'output', 'result'];

      for (const field of preferredFields) {
        const value = record[field];
        if (typeof value === 'string' && value.trim()) {
          return value;
        }
      }

      if (record.temporalLink && Object.keys(record).length <= 2) {
        return '任务执行成功。';
      }

      return `任务已完成，返回结果如下：\n\n${JSON.stringify(result, null, 2)}\n\n执行单 ID: ${executionId}`;
    }

    return `任务已完成，返回结果如下：\n\n${String(result)}\n\n执行单 ID: ${executionId}`;
  }

  private mapExecutionEventToStreamEvent(event: any): StreamEvent | null {
    const { eventType, payload } = event;

    switch (eventType) {
      case CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED:
        if (payload.newStatus === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
          const missingInputs = Array.isArray(payload.requiredInputs)
            ? payload.requiredInputs.filter((item: any) => item?.missing)
            : [];
          const semantic = payload.semantic && typeof payload.semantic === 'object' && !Array.isArray(payload.semantic)
            ? payload.semantic as WaitingInputSemantic
            : undefined;
          return {
            type: StreamEventType.WAITING_INPUT,
            content: this.waitingInputService.formatWaitingInputMessage({
              executionId: event.executionId,
              intro: '已识别到任务仍需补充信息，请继续输入后再执行。',
              missingInputs,
              semantic,
            }),
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              hasBusinessResult: false,
              missingInputs,
              semantic,
            },
          };
        }

        if (payload.newStatus === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL) {
          return {
            type: StreamEventType.RESULT,
            content: `任务需要审批后才能继续执行。\n\n当前审批状态: ${CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${event.executionId}`,
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              approvalStatus: CONTROL_PLANE_APPROVAL_STATUS.PENDING,
              hasBusinessResult: false,
            },
          };
        }

        return {
          type: StreamEventType.THOUGHT,
          content: `任务状态变更为: ${payload.newStatus}`,
          data: { executionId: event.executionId, status: payload.newStatus },
        };
      case CONTROL_PLANE_EVENT_TYPE.STEP_STARTED:
        return {
          type: StreamEventType.ACTION,
          content: `正在执行: ${payload.stepName || payload.action || '系统步骤'}`,
          data: { stepId: payload.stepId },
        };
      case CONTROL_PLANE_EVENT_TYPE.STEP_SUCCEEDED: {
        let observationContent = '步骤执行成功。';
        const downloadUrl = this.extractDownloadUrl(payload.result);
        if (payload.result) {
          const resultStr = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result, null, 2);
          observationContent = `步骤执行成功，返回结果:\n${resultStr}`;
        }
        return {
          type: StreamEventType.OBSERVATION,
          content: observationContent,
          data: { stepId: payload.stepId, result: payload.result, downloadUrl },
        };
      }
      case CONTROL_PLANE_EVENT_TYPE.STEP_FAILED:
        return {
          type: StreamEventType.ERROR,
          content: `步骤执行失败: ${payload.error || '未知错误'}`,
          data: { stepId: payload.stepId, error: payload.error },
        };
      case CONTROL_PLANE_EVENT_TYPE.RUNTIME_ALLOCATED:
        return {
          type: StreamEventType.THOUGHT,
          content: '🚀 已分配运行环境，准备开始执行...',
        };
      case CONTROL_PLANE_EVENT_TYPE.EXECUTION_INPUT_SUBMITTED:
        return {
          type: StreamEventType.THOUGHT,
          content: '📥 已接收到您补充的信息，正在继续执行...',
        };
      case LEGACY_CONTROL_PLANE_EVENT_TYPE.EXECUTION_WAITING_INPUT:
      case CONTROL_PLANE_EVENT_TYPE.STEP_WAITING_INPUT: {
        const missingInputs = Array.isArray(payload.requiredInputs)
          ? payload.requiredInputs.filter((item: any) => item?.missing)
          : [];
        const semantic = payload.semantic && typeof payload.semantic === 'object' && !Array.isArray(payload.semantic)
          ? payload.semantic as WaitingInputSemantic
          : undefined;
        return {
          type: StreamEventType.WAITING_INPUT,
          content: this.waitingInputService.formatWaitingInputMessage({
            intro: '⏳ 任务需要您的进一步操作或提供信息以继续执行。',
            missingInputs,
            semantic,
            executionId: event.executionId,
          }),
          data: {
            executionId: event.executionId,
            missingInputs,
            semantic,
          },
        };
      }
      default:
        return null;
    }
  }

  private tryParseJsonString(value: unknown): unknown {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  private extractDownloadUrl(value: unknown): string | undefined {
    const queue: unknown[] = [value];
    const visited = new Set<unknown>();
    let inspected = 0;

    while (queue.length > 0 && inspected < 50) {
      const current = queue.shift();
      inspected += 1;

      const parsed = this.tryParseJsonString(current);
      if (parsed !== undefined) {
        queue.push(parsed);
        continue;
      }

      if (!current || typeof current !== 'object' || visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (Array.isArray(current)) {
        current.forEach((item) => queue.push(item));
        continue;
      }

      const record = current as Record<string, unknown>;
      const directUrl = [record.downloadUrl, record.download_url, record.url]
        .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (directUrl) {
        return directUrl;
      }

      Object.values(record).forEach((item) => {
        if (item && typeof item === 'object') {
          queue.push(item);
        }
      });
    }

    return undefined;
  }

  private extractTemporalLink(value: unknown): string | undefined {
    const queue: unknown[] = [value];
    const visited = new Set<unknown>();
    let inspected = 0;

    while (queue.length > 0 && inspected < 50) {
      const current = queue.shift();
      inspected += 1;

      const parsed = this.tryParseJsonString(current);
      if (parsed !== undefined) {
        queue.push(parsed);
        continue;
      }

      if (!current || typeof current !== 'object' || visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (Array.isArray(current)) {
        current.forEach((item) => queue.push(item));
        continue;
      }

      const record = current as Record<string, unknown>;
      const directUrl = [record.temporalLink, record.temporal_link]
        .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (directUrl) {
        return directUrl;
      }

      Object.values(record).forEach((item) => {
        if (item && typeof item === 'object') {
          queue.push(item);
        }
      });
    }

    return undefined;
  }
}
