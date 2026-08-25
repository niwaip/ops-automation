import { Injectable, Logger } from '@nestjs/common';
import { ControlPlaneClient } from '../../client/control-plane.client';
import { CONTROL_PLANE_EXECUTION_STATUS } from '../../client/control-plane.contracts';
import type { StreamEvent } from '../react-engine/interfaces';
import { StreamEventType } from '../react-engine/interfaces';
import { ChatExecutionStreamService } from './chat-execution-stream.service';
import { ChatWaitingInputService } from './chat-waiting-input.service';
import type { WaitingInputSemantic } from './chat.types';

interface ResumeUserContext {
  userId: string;
  userRoles?: string[];
}

interface ResumeRequest {
  executionId?: string;
  message?: string;
  modelId?: string;
  authToken?: string;
  user: ResumeUserContext;
}

export type TaskResumePreparation =
  | { handled: false }
  | { handled: true; events: AsyncIterable<StreamEvent> };

@Injectable()
export class ChatTaskResumeService {
  private readonly logger = new Logger(ChatTaskResumeService.name);

  constructor(
    private readonly controlPlaneClient: ControlPlaneClient,
    private readonly waitingInputService: ChatWaitingInputService,
    private readonly executionStreamService: ChatExecutionStreamService
  ) {}

  async prepare(request: ResumeRequest): Promise<TaskResumePreparation> {
    if (!request.executionId) return { handled: false };
    const { executionId } = request;
    let execution: {
      skillId?: string;
      status: string;
      semantic?: WaitingInputSemantic;
      normalizedInput?: { objective?: string; semantic?: WaitingInputSemantic };
    };
    try {
      execution = await this.controlPlaneClient.getExecution(
        executionId,
        this.waitingInputService.buildControlPlaneRequestOptions(request.authToken, request.user)
      );
    } catch (error: any) {
      const isAuthError = error.response?.status === 401 || error.response?.status === 403;
      if (isAuthError) {
        this.logger.error(`Authentication failed for execution ${executionId}: ${error.message}`);
        return {
          handled: true,
          events: this.singleEvent({
            type: StreamEventType.ERROR,
            content: '您的登录会话已过期或无效，请重新登录后再试。',
          }),
        };
      }
      if (error.response?.status === 404) {
        this.logger.warn(`Execution ${executionId} not found; continuing with a new plan`);
        return { handled: false };
      }
      this.logger.error(`Failed to fetch execution ${executionId}: ${error.message}`);
      return {
        handled: true,
        events: this.singleEvent({
          type: StreamEventType.ERROR,
          content: `无法恢复执行进度: ${error.response?.data?.message || error.message}`,
        }),
      };
    }

    if (execution.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT && request.message) {
      return {
        handled: true,
        events: this.submitInput(executionId, execution, request),
      };
    }
    if (
      execution.status === CONTROL_PLANE_EXECUTION_STATUS.QUEUED ||
      execution.status === CONTROL_PLANE_EXECUTION_STATUS.RUNNING ||
      execution.status === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL ||
      execution.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT
    ) {
      return { handled: true, events: this.observe(executionId, execution.status, request) };
    }
    return { handled: false };
  }

  private async *submitInput(
    executionId: string,
    execution: {
      skillId?: string;
      semantic?: WaitingInputSemantic;
      normalizedInput?: { objective?: string; semantic?: WaitingInputSemantic };
    },
    request: ResumeRequest
  ): AsyncGenerator<StreamEvent> {
    yield { type: StreamEventType.THOUGHT, content: '正在提交您补充的信息...' };
    const details = await this.waitingInputService.loadWaitingInputDetails(
      executionId,
      request.authToken,
      request.user
    );
    if (!details.waitingStepId) {
      yield {
        type: StreamEventType.ERROR,
        content: '执行处于等待输入状态，但未找到可提交的输入步骤。',
      };
      return;
    }
    try {
      const payload = await this.waitingInputService.buildWaitingInputPayload(
        request.message || '',
        details.missingInputs,
        details.allRequiredInputs,
        this.waitingInputService.extractExecutionSemantic(execution),
        execution.skillId,
        request.authToken,
        typeof execution.normalizedInput?.objective === 'string'
          ? execution.normalizedInput.objective
          : undefined,
        request.user.userId,
        request.modelId
      );
      await this.controlPlaneClient.submitExecutionInput(
        executionId,
        { stepId: details.waitingStepId, input: payload.input, usage: payload.usage },
        this.waitingInputService.buildControlPlaneRequestOptions(request.authToken, request.user)
      );
      const latest = await this.executionStreamService.buildLatestExecutionStateEvent(
        executionId,
        request.authToken,
        request.user
      );
      if (latest?.type === StreamEventType.WAITING_INPUT) {
        const data =
          latest.data && typeof latest.data === 'object' && !Array.isArray(latest.data)
            ? (latest.data as {
                missingInputs?: Array<{
                  name: string;
                  group_label?: string;
                  display_name?: string;
                  needs_confirmation?: boolean;
                }>;
                semantic?: WaitingInputSemantic;
              })
            : {};
        yield {
          type: StreamEventType.THOUGHT,
          content: this.waitingInputService.buildWaitingInputSubmissionFeedback({
            executionId,
            resolvedFieldNames: Object.keys(payload.input || {}),
            remainingMissingInputs: Array.isArray(data.missingInputs) ? data.missingInputs : [],
            semantic: data.semantic,
          }),
        };
        yield latest;
        return;
      }
      yield { type: StreamEventType.THOUGHT, content: '信息已提交，任务继续执行。' };
      yield* this.executionStreamService.observeExecution(
        executionId,
        request.authToken,
        request.user
      );
    } catch (error: any) {
      yield {
        type: StreamEventType.ERROR,
        content: `提交信息失败: ${error.response?.data?.message || error.message}`,
      };
    }
  }

  private async *observe(
    executionId: string,
    status: string,
    request: ResumeRequest
  ): AsyncGenerator<StreamEvent> {
    yield {
      type: StreamEventType.THOUGHT,
      content: `任务正在执行中 (状态: ${status})，正在为您实时观察进度...`,
    };
    yield* this.executionStreamService.observeExecution(
      executionId,
      request.authToken,
      request.user
    );
  }

  private async *singleEvent(event: StreamEvent): AsyncGenerator<StreamEvent> {
    yield event;
  }
}
