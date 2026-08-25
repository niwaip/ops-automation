import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { ModelService } from '../model/model.service';
import { ChatResultNormalizerService } from './chat-result-normalizer.service';
import type { ChatUserContext, WaitingInputSemantic } from './chat.types';
import { ChatWaitingInputService } from './chat-waiting-input.service';

const reportChatExecutionStreamDebug = (
  hypothesisId: string,
  location: string,
  msg: string,
  data: Record<string, unknown>
) => {
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'chat-failure-loop-history',
      runId: 'backend-chat-stream',
      hypothesisId,
      location,
      msg,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};

@Injectable()
export class ChatExecutionStreamService {
  private readonly logger = new Logger(ChatExecutionStreamService.name);

  constructor(
    private readonly controlPlaneClient: ControlPlaneClient,
    private readonly waitingInputService: ChatWaitingInputService,
    private readonly resultNormalizerService: ChatResultNormalizerService,
    @Optional() private readonly modelService?: ModelService
  ) {}

  async *observeExecution(
    executionId: string,
    authToken?: string,
    user?: ChatUserContext,
    options?: { modelId?: string }
  ): AsyncGenerator<StreamEvent> {
    this.logger.log(`Starting to observe execution ${executionId} via control-plane stream`);

    try {
      const immediateStateEvent = await this.buildLatestExecutionStateEvent(
        executionId,
        authToken,
        user,
        options?.modelId
      );
      if (immediateStateEvent) {
        yield immediateStateEvent;
        return;
      }

      const stream = await this.controlPlaneClient.streamExecutionEvents(
        executionId,
        this.waitingInputService.buildControlPlaneRequestOptions(authToken, user)
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
              event.eventType === CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED ||
              event.eventType === CONTROL_PLANE_EVENT_TYPE.STEP_FAILED
            ) {
              reportChatExecutionStreamDebug(
                event.eventType === CONTROL_PLANE_EVENT_TYPE.STEP_FAILED ? 'H3' : 'H1',
                'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:observeExecution',
                'Observed raw execution stream event',
                {
                  executionId,
                  eventType: event.eventType,
                  payload: event.payload || null,
                }
              );
            }

            if (
              event.eventType === CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED &&
              isTerminalControlPlaneExecutionStatus(event.payload.newStatus)
            ) {
              const terminalEvent = await this.buildTerminalExecutionEvent(
                executionId,
                event.payload.newStatus,
                authToken,
                user,
                options?.modelId
              );
              if (terminalEvent) {
                yield terminalEvent;
              }
              this.logger.log(
                `Execution ${executionId} reached terminal state: ${event.payload.newStatus}`
              );
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

      const latestEvent = await this.buildLatestExecutionStateEvent(
        executionId,
        authToken,
        user,
        options?.modelId
      );
      if (latestEvent) {
        yield latestEvent;
      }
    } catch (error: any) {
      this.logger.error(`Error observing execution ${executionId}`, error);
      const latestEvent = await this.buildLatestExecutionStateEvent(
        executionId,
        authToken,
        user,
        options?.modelId
      );
      if (latestEvent) {
        this.logger.log(`Recovered execution ${executionId} state after stream interruption`);
        yield latestEvent;
        return;
      }
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
    modelId?: string
  ): Promise<StreamEvent | null> {
    try {
      const execution = await this.controlPlaneClient.getExecution<{
        id: string;
        status: string;
        approvalStatus?: string;
        takeoverReason?: string;
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
        return this.buildTerminalExecutionEvent(executionId, status, authToken, user, modelId);
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
        const waitingInputDetails = await this.waitingInputService.loadWaitingInputDetails(
          executionId,
          authToken,
          user
        );
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
          type: StreamEventType.PENDING_APPROVAL,
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

      if (status === CONTROL_PLANE_EXECUTION_STATUS.HUMAN_CONTROL) {
        const takeoverReason =
          typeof execution.takeoverReason === 'string' && execution.takeoverReason.trim().length > 0
            ? execution.takeoverReason.trim()
            : '任务正在等待人工处理。';
        return {
          type: StreamEventType.HUMAN_CONTROL,
          content: takeoverReason,
          data: {
            executionId,
            status,
            hasBusinessResult: false,
            takeoverReason,
            usage,
          },
        };
      }

      return null;
    } catch (error) {
      this.logger.warn(
        `Failed to load latest execution state for ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`
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
    modelId?: string
  ): Promise<StreamEvent | null> {
    try {
      const execution = await this.controlPlaneClient.getExecution<{
        id: string;
        status: string;
        executionMode?: string;
        runtimeType?: string;
        runtime_type?: string;
        result?: unknown;
        resultJson?: unknown;
        failureReason?: string;
        usage?: LLMUsage;
        normalizedInput?: {
          objective?: string;
          prompt?: string;
        };
        input?: {
          prompt?: string;
        };
      }>(executionId, this.waitingInputService.buildControlPlaneRequestOptions(authToken, user));
      const rawResult = execution.resultJson ?? execution.result;
      const runtimeType = execution.runtimeType || execution.runtime_type;

      if (status === CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED) {
        if (rawResult !== null && rawResult !== undefined) {
          const normalizedResult = this.resultNormalizerService.normalize(rawResult, {
            executionId,
            status: 'success',
          });
          const contract = this.resultNormalizerService.toContract(normalizedResult, {
            executionId,
            status: 'success',
          });

          let chatContent = this.resultNormalizerService.formatForChat(
            normalizedResult,
            executionId
          );

          const objective =
            typeof execution.normalizedInput?.objective === 'string' &&
            execution.normalizedInput.objective.trim()
              ? execution.normalizedInput.objective.trim()
              : typeof execution.normalizedInput?.prompt === 'string' &&
                  execution.normalizedInput.prompt.trim()
                ? execution.normalizedInput.prompt.trim()
                : typeof execution.input?.prompt === 'string' && execution.input.prompt.trim()
                  ? execution.input.prompt.trim()
                  : '';

          const hasSummarizationIntent =
            /总结|概括|归纳|分析|梳理|汇总|提炼|综合|整理|summarize|summary|analyze|analysis/i.test(
              objective
            );

          const rawRecord = this.asRecord(rawResult) || {};
          const businessData = this.asRecord(normalizedResult.structuredData);

          const isSearchOrDataResult =
            normalizedResult.resultType === 'tavily_search' ||
            Boolean(businessData?.results) ||
            Boolean(businessData?.searchResults) ||
            Boolean(rawRecord.results);
          const requestsAiSummary =
            normalizedResult.envelope.presentation?.preferAiSummary === true;
          const alreadyHasPresentationText = Boolean(
            normalizedResult.summary || normalizedResult.detailText || normalizedResult.body
          );

          // effectiveAiSummary tracks AI-generated summary to synchronize into
          // both event.content AND the data fields that the frontend prioritizes.
          let effectiveAiSummary: string | undefined;

          const shouldGeneratePresentationSummary =
            (!alreadyHasPresentationText &&
              (requestsAiSummary || hasSummarizationIntent || isSearchOrDataResult)) ||
            (requestsAiSummary && (hasSummarizationIntent || isSearchOrDataResult));

          if (shouldGeneratePresentationSummary) {
            const aiResult = await this.generateAiSummary(
              objective || '对工具执行结果进行总结',
              normalizedResult.structuredData ?? rawResult,
              executionId,
              modelId
            );
            if (aiResult?.summary) {
              chatContent = aiResult.summary;
              effectiveAiSummary = aiResult.summary;
              try {
                await this.controlPlaneClient.updateExecutionResultSummary(
                  executionId,
                  effectiveAiSummary,
                  {
                    authToken,
                    user,
                  }
                );
              } catch (err) {
                this.logger.warn(
                  `Failed to persist AI summary to execution ${executionId}: ${(err as Error).message}`
                );
              }
            } else if (aiResult?.warning) {
              chatContent = `${chatContent}\n\n---\n_⚠️ AI 自动总结未生成：${aiResult.warning}_`;
            }
          }

          // When an AI summary was generated, patch the contract and normalizedResult
          // so the frontend's contractChatSummary and finalResult paths also surface
          // the AI summary (not the original tool metadata which would otherwise win).
          const effectiveContract = effectiveAiSummary
            ? { ...contract, chatSummary: effectiveAiSummary, summaryFormat: 'markdown' as const }
            : contract;
          const effectiveNormalizedResult = effectiveAiSummary
            ? {
                ...normalizedResult,
                envelope: {
                  ...normalizedResult.envelope,
                  presentation: {
                    ...normalizedResult.envelope.presentation,
                    chatSummary: effectiveAiSummary,
                    detailText: effectiveAiSummary,
                    summaryFormat: 'markdown' as const,
                    detailFormat: 'markdown' as const,
                  },
                },
                summary: effectiveAiSummary,
                body: effectiveAiSummary,
                detailText: effectiveAiSummary,
                summaryFormat: 'markdown' as const,
              }
            : normalizedResult;

          return {
            type: StreamEventType.RESULT,
            content: chatContent,
            data: {
              ...effectiveContract,
              executionId,
              status,
              runtimeType,
              result: rawResult,
              normalizedResult: effectiveNormalizedResult,
              resultType: normalizedResult.resultType,
              resultTitle: normalizedResult.title,
              resultSummary: effectiveNormalizedResult.summary,
              artifacts: normalizedResult.artifacts,
              downloadUrl: normalizedResult.downloadUrl,
              temporalLink: normalizedResult.temporalLink,
              hasBusinessResult: normalizedResult.hasBusinessResult,
              usage: execution.usage,
            },
          };
        }

        const noResultContent = `任务已完成，但该任务没有可直接展示的返回结果。\n\n执行单 ID: ${executionId}`;
        return {
          type: StreamEventType.RESULT,
          content: noResultContent,
          data: {
            _version: '1',
            executionId,
            status: 'success',
            hasBusinessResult: false,
            chatSummary: noResultContent,
            summaryFormat: 'plain_text',
            usage: execution.usage,
          },
        };
      }

      if (status === CONTROL_PLANE_EXECUTION_STATUS.FAILED) {
        const failureReason = execution.failureReason || '未知原因';
        reportChatExecutionStreamDebug(
          'H3',
          'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:buildTerminalExecutionEvent',
          'Built terminal failed execution event',
          {
            executionId,
            requestedStatus: status,
            executionStatus: execution.status,
            failureReason,
          }
        );
        return {
          type: StreamEventType.RESULT,
          content: `❌ 任务执行失败\n\n原因：${failureReason}\n\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status: 'failed',
            failureReason,
            hasBusinessResult: false,
            chatSummary: `❌ 任务执行失败\n\n原因：${failureReason}`,
            summaryFormat: 'markdown',
            usage: execution.usage,
          },
        };
      }

      const cancelledContent = `任务已取消。\n\n执行单 ID: ${executionId}`;
      return {
        type: StreamEventType.RESULT,
        content: cancelledContent,
        data: {
          _version: '1',
          executionId,
          status: 'cancelled',
          hasBusinessResult: false,
          chatSummary: cancelledContent,
          summaryFormat: 'plain_text',
          usage: execution.usage,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Failed to load execution detail for terminal event ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`
      );
      return this.fallbackTerminalExecutionEvent(executionId, status);
    }
  }

  private fallbackTerminalExecutionEvent(
    executionId: string,
    status:
      | typeof CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.FAILED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.CANCELLED
  ): StreamEvent {
    if (status === CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED) {
      const summary = `任务已完成。\n\n执行单 ID: ${executionId}`;
      return {
        type: StreamEventType.RESULT,
        content: summary,
        data: {
          _version: '1',
          executionId,
          status: 'success',
          hasBusinessResult: false,
          chatSummary: summary,
          summaryFormat: 'plain_text',
        },
      };
    }

    if (status === CONTROL_PLANE_EXECUTION_STATUS.FAILED) {
      return {
        type: StreamEventType.ERROR,
        content: '任务执行失败',
        data: { executionId, status, failureReason: '任务执行失败' },
      };
    }

    const cancelledSummary = `任务已取消。\n\n执行单 ID: ${executionId}`;
    return {
      type: StreamEventType.RESULT,
      content: cancelledSummary,
      data: {
        _version: '1',
        executionId,
        status: 'cancelled',
        hasBusinessResult: false,
        chatSummary: cancelledSummary,
        summaryFormat: 'plain_text',
      },
    };
  }

  private mapExecutionEventToStreamEvent(event: any): StreamEvent | null {
    const { eventType, payload } = event;

    switch (eventType) {
      case CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED:
        if (payload.newStatus === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
          const missingInputs = Array.isArray(payload.requiredInputs)
            ? payload.requiredInputs.filter((item: any) => item?.missing)
            : [];
          const semantic =
            payload.semantic &&
            typeof payload.semantic === 'object' &&
            !Array.isArray(payload.semantic)
              ? (payload.semantic as WaitingInputSemantic)
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
            type: StreamEventType.PENDING_APPROVAL,
            content: `任务需要审批后才能继续执行。\n\n当前审批状态: ${CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${event.executionId}`,
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              approvalStatus: CONTROL_PLANE_APPROVAL_STATUS.PENDING,
              hasBusinessResult: false,
            },
          };
        }

        if (payload.newStatus === CONTROL_PLANE_EXECUTION_STATUS.HUMAN_CONTROL) {
          return {
            type: StreamEventType.HUMAN_CONTROL,
            content:
              this.readString(payload.takeoverReason) ||
              this.readString(payload.reason) ||
              '任务正在等待人工处理。',
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              hasBusinessResult: false,
              takeoverReason:
                this.readString(payload.takeoverReason) || this.readString(payload.reason),
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
          content: this.buildStepStartedSummary(payload),
          data: { stepId: payload.stepId },
        };
      case CONTROL_PLANE_EVENT_TYPE.STEP_SUCCEEDED: {
        const normalizedResult = this.resultNormalizerService.normalize(payload.result, {
          status: 'success',
        });
        const downloadUrl = normalizedResult.downloadUrl;
        return {
          type: StreamEventType.OBSERVATION,
          content: this.buildStepSucceededSummary(payload.result, normalizedResult),
          data: {
            stepId: payload.stepId,
            result: payload.result,
            normalizedResult,
            downloadUrl,
          },
        };
      }
      case CONTROL_PLANE_EVENT_TYPE.STEP_FAILED:
        if (payload.shouldTakeover || payload.phaseStatus === 'takeover_required') {
          return {
            type: StreamEventType.HUMAN_CONTROL,
            content: `步骤执行失败: ${payload.error || '未知错误'}`,
            data: {
              stepId: payload.stepId,
              error: payload.error,
              status: CONTROL_PLANE_EXECUTION_STATUS.HUMAN_CONTROL,
              shouldTakeover: true,
              phaseStatus: payload.phaseStatus,
            },
          };
        }
        return {
          type: StreamEventType.ERROR,
          content: `步骤执行失败: ${payload.error || '未知错误'}`,
          data: {
            stepId: payload.stepId,
            error: payload.error,
            phaseStatus: payload.phaseStatus,
            shouldTakeover: false,
          },
        };
      case CONTROL_PLANE_EVENT_TYPE.RUNTIME_ALLOCATED:
        return {
          type: StreamEventType.THOUGHT,
          content: '已分配运行环境，准备开始执行。',
        };
      case CONTROL_PLANE_EVENT_TYPE.EXECUTION_INPUT_SUBMITTED:
        return {
          type: StreamEventType.THOUGHT,
          content: '已接收到补充信息，正在继续执行。',
        };
      case LEGACY_CONTROL_PLANE_EVENT_TYPE.EXECUTION_WAITING_INPUT:
      case CONTROL_PLANE_EVENT_TYPE.STEP_WAITING_INPUT: {
        const missingInputs = Array.isArray(payload.requiredInputs)
          ? payload.requiredInputs.filter((item: any) => item?.missing)
          : [];
        const semantic =
          payload.semantic &&
          typeof payload.semantic === 'object' &&
          !Array.isArray(payload.semantic)
            ? (payload.semantic as WaitingInputSemantic)
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

  private buildStepStartedSummary(payload: Record<string, unknown>): string {
    const stepName = this.readString(payload.stepName);
    const action = this.readString(payload.action);
    return `正在执行：${stepName || action || '系统步骤'}`;
  }

  private buildStepSucceededSummary(
    rawResult: unknown,
    normalizedResult: {
      detailText?: string;
      summary?: string;
      body?: string;
    }
  ): string {
    const structured = this.asRecord(rawResult);
    const status = this.readString(structured?.status);
    const command = this.readString(structured?.command);
    const pageTitle = this.readString(structured?.pageTitle);
    const pageUrl = this.sanitizeUrl(this.readString(structured?.pageUrl));
    const duration = this.readNumber(this.asRecord(structured?.data)?.duration);
    const detailText = this.firstNonEmptyString(
      normalizedResult.detailText,
      normalizedResult.summary,
      normalizedResult.body
    );

    const parts: string[] = [];
    if (status === 'success') {
      parts.push('步骤执行成功');
    } else if (status) {
      parts.push(`步骤状态：${status}`);
    } else {
      parts.push('步骤已完成');
    }

    if (command) {
      parts.push(`命令：${command}`);
    }
    if (pageTitle) {
      parts.push(`页面：${pageTitle}`);
    } else if (pageUrl) {
      parts.push(`页面：${pageUrl}`);
    }
    if (typeof duration === 'number' && duration > 0) {
      parts.push(`耗时 ${duration} ms`);
    }

    if (detailText) {
      const compactDetail = detailText.replace(/\s+/g, ' ').trim();
      if (compactDetail && compactDetail.length <= 80) {
        parts.push(compactDetail);
      }
    }

    return parts.join('，');
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
    return values.find((value) => typeof value === 'string' && value.trim())?.trim();
  }

  private sanitizeUrl(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    return value.replace(/`/g, '').trim();
  }

  private async generateAiSummary(
    objective: string,
    rawResult: unknown,
    executionId: string,
    modelId?: string
  ): Promise<{ summary?: string; warning?: string }> {
    if (!this.modelService) {
      reportChatExecutionStreamDebug(
        'H3',
        'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:generateAiSummary',
        'AI summary skipped: modelService not injected',
        { executionId, objective }
      );
      return { warning: 'AI 总结能力未启用（ModelService 未注入）' };
    }

    try {
      let preferredModel =
        modelId && modelId !== 'default' ? await this.modelService.getModel(modelId) : null;
      if (
        !preferredModel ||
        preferredModel.status !== 'active' ||
        !this.modelService.getClient(preferredModel.id)
      ) {
        preferredModel = this.modelService.getPreferredDefaultModel({ mode: 'chat' });
      }
      if (!preferredModel?.id) {
        reportChatExecutionStreamDebug(
          'H3',
          'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:generateAiSummary',
          'AI summary skipped: no preferred default chat model',
          { executionId, objective }
        );
        return { warning: '未配置 chat 模式默认模型，无法进行 AI 总结' };
      }

      const client = this.modelService.getClient(preferredModel.id);
      if (!client) {
        reportChatExecutionStreamDebug(
          'H3',
          'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:generateAiSummary',
          'AI summary skipped: model client not initialized (usually API key not resolvable)',
          { executionId, objective, modelId: preferredModel.id, modelName: preferredModel.name }
        );
        return {
          warning: `模型「${preferredModel.name}」客户端未就绪（通常因为 API Key 未解析或模型未启用），已在后台记录`,
        };
      }

      this.logger.log(
        `Generating AI summary for execution ${executionId} with objective: "${objective}"`
      );
      reportChatExecutionStreamDebug(
        'H1',
        'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:generateAiSummary',
        'Calling LLM for AI summary',
        { executionId, objective, modelId: preferredModel.id, modelName: preferredModel.name }
      );

      const payloadStr =
        typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);

      const prompt = `用户需求：${objective}

工具/技能实际执行返回的数据内容：
${payloadStr.length > 10000 ? payloadStr.slice(0, 10000) + '\n... (输出已截断)' : payloadStr}

请根据实际业务数据直接回答用户需求：
1. 只使用数据中明确存在的信息，不猜测、不补造。
2. 使用简体中文；必要时翻译原始英文值。
3. 根据数据形态选择合适表达：单项结果简洁回答，多项结果分组或列表呈现，复杂分析才使用小标题。
4. 保留对用户有意义的数值、单位、日期和状态，省略内部字段与调试信息。
5. 使用清晰的 Markdown，避免输出原始 JSON。`;

      const response = await client.chatCompletion([
        {
          role: 'system',
          content:
            '你是业务结果呈现助手。请把已验证的结构化执行结果转换成忠于原始数据、简洁易读的中文 Markdown；不要改变结果含义。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ]);

      const rawSummaryText =
        typeof response?.content === 'string' ? response.content.trim() : undefined;
      const summaryText = rawSummaryText
        ? this.modelService.stripThinkingTags(rawSummaryText)
        : undefined;
      if (summaryText) {
        this.logger.log(
          `AI summary generated successfully for execution ${executionId} (${summaryText.length} chars)`
        );
        return { summary: summaryText };
      }
      reportChatExecutionStreamDebug(
        'H3',
        'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:generateAiSummary',
        'AI summary returned empty content',
        { executionId, objective, modelId: preferredModel.id }
      );
      return { warning: 'AI 返回了空内容' };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to generate AI summary for execution ${executionId}: ${reason}`);
      reportChatExecutionStreamDebug(
        'H3',
        'apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts:generateAiSummary',
        'AI summary LLM call failed',
        { executionId, objective, reason }
      );
      return { warning: `AI 总结调用失败：${reason}` };
    }
  }
}
