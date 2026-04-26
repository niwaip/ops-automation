import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { Readable } from 'stream';
import axios from 'axios';
import { ModelService } from '../modules/model/model.service';
import { ReActEngineService } from '../modules/react-engine/react-engine.service';
import { PlannerService } from '../modules/planner/planner.service';
import { getOrCreateTraceId } from '../common/trace.util';
import { ContentBlock, ChatMessage as MultimodalChatMessage } from '../interfaces';
import { ChatRequestDTO, ExecutionContext, StreamEvent, StreamEventType } from '../modules/react-engine/interfaces';
import { SessionService } from '../modules/redis/session.service';

const fileStore = new Map<string, { fileName: string; mimeType: string; size: number; content: string }>();
const getAuthServiceUrl = () => {
  if (process.env.AUTH_SERVICE_URL) {
    return process.env.AUTH_SERVICE_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-auth:3001';
  }
  return 'http://localhost:3001';
};

const getControlPlaneUrl = () => {
  if (process.env.CONTROL_PLANE_URL) {
    return process.env.CONTROL_PLANE_URL.endsWith('/api') 
      ? process.env.CONTROL_PLANE_URL 
      : `${process.env.CONTROL_PLANE_URL}/api`;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-control-plane:3003/api';
  }
  return 'http://localhost:3003/api';
};

@ApiTags('AI-Chat')
@Controller('ai')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly reactEngineService: ReActEngineService,
    private readonly sessionService: SessionService,
    private readonly plannerService: PlannerService,
  ) {}

  private writeSse(res: Response, payload: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private normalizeContentToText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') return content;
    return content
      .map((block) => {
        if (block.type === 'text') {
          return block.text || '';
        }
        if (block.type === 'image_url') {
          return '[用户上传了图片]';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private parseJsonObjectMessage(message?: string): Record<string, unknown> | null {
    if (!message) {
      return null;
    }

    const trimmed = message.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private buildWaitingInputPayload(
    message: string,
    missingInputs: Array<{ name: string }>,
  ): Record<string, unknown> {
    if (missingInputs.length === 0) {
      throw new Error('当前执行单没有可补充的缺失参数。');
    }
    const [firstMissingInput] = missingInputs;

    const parsedObject = this.parseJsonObjectMessage(message);

    if (parsedObject) {
      const allowedKeys = new Set(missingInputs.map((item) => item.name));
      const filteredEntries = Object.entries(parsedObject).filter(([key]) => allowedKeys.has(key));
      if (filteredEntries.length > 0) {
        return Object.fromEntries(filteredEntries);
      }
    }

    if (missingInputs.length === 1) {
      return {
        [firstMissingInput!.name]: message.trim(),
      };
    }

    throw new Error(
      `当前还缺少多个参数：${missingInputs.map((item) => item.name).join('、')}。请使用 JSON 形式补充，例如 {"${firstMissingInput!.name}":"示例值"}`,
    );
  }

  private async resolveSkillExecutionRuntimeType(
    skillId: string,
    planDraft: {
      required_inputs: Array<{ name: string }>;
      steps: Array<{ tool_name?: string }>;
    },
    authToken?: string,
  ): Promise<string> {
    try {
      const response = await axios.get<{
        runtimeType?: string;
      }>(`${getAuthServiceUrl()}/capability-releases/runtime/skills/${skillId}/context`, {
        headers: authToken ? { Authorization: authToken } : {},
      });

      if (typeof response.data?.runtimeType === 'string' && response.data.runtimeType.trim()) {
        return response.data.runtimeType;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to resolve runtime context for skill ${skillId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    const hasBrowserRequirement =
      planDraft.required_inputs.some((input) => input.name.toLowerCase() === 'url')
      || planDraft.steps.some((step) => (step.tool_name || '').toLowerCase().includes('browser'));

    return hasBrowserRequirement ? 'browser' : 'sandbox';
  }

  private async resolveAuthenticatedUser(
    authorization?: string,
  ): Promise<{ userId?: string; userRoles?: string[] }> {
    if (!authorization) {
      return {};
    }

    try {
      const response = await fetch(`${getAuthServiceUrl()}/auth/me`, {
        headers: {
          Authorization: authorization,
        },
      });

      if (!response.ok) {
        return {};
      }

      const payload = await response.json() as {
        user?: { id?: string; role?: string };
        roles?: Array<{ name?: string }>;
      };

      const roleSet = new Set<string>();
      if (payload.user?.role) {
        roleSet.add(payload.user.role);
      }
      for (const role of payload.roles || []) {
        if (role?.name) {
          roleSet.add(role.name);
        }
      }

      return {
        userId: payload.user?.id,
        userRoles: Array.from(roleSet),
      };
    } catch {
      return {};
    }
  }

  @Post('chat/stream')
  @ApiOperation({ summary: 'AI chat with ReAct engine or simple mode (SSE stream)' })
  async chatStream(
    @Body() body: ChatRequestDTO,
    @Req() req: Request & { traceId?: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const mode: 'chat' | 'task' = body.config?.mode || 'chat';

    try {
      if (mode === 'chat') {
        const modelId = body.modelId || 'default';
        const sessionId = body.sessionId || 'default';
        const client = this.modelService.getClient(modelId);

        if (!client) {
          this.writeSse(res, {
            type: StreamEventType.ERROR,
            content: `模型 ${modelId} 未初始化`,
            traceId,
          });
          res.end();
          return;
        }

        this.writeSse(res, {
          type: StreamEventType.THOUGHT,
          content: '正在思考...',
          traceId,
        });

        let messageContent: string | ContentBlock[];
        const systemMessage = '你是一个智能助手，请用中文友好地回答用户的问题。如果用户上传了文件，请分析文件内容并给出相关回答。';

        if (body.files && body.files.length > 0) {
          const contentBlocks: ContentBlock[] = [{ type: 'text', text: body.message }];

          for (const file of body.files) {
            const storedFile = fileStore.get(file.fileId);
            if (!storedFile?.content) {
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${file.fileName}】\n(文件内容未找到，可能已过期)`,
              });
              continue;
            }

            const isImage = storedFile.mimeType.startsWith('image/');
            if (isImage) {
              contentBlocks.push({
                type: 'image_url',
                image_url: {
                  url: `data:${storedFile.mimeType};base64,${storedFile.content}`,
                  detail: 'auto',
                },
              });
              continue;
            }

            try {
              const decodedContent = Buffer.from(storedFile.content, 'base64').toString('utf-8');
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${storedFile.fileName}】\n${decodedContent}`,
              });
            } catch {
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${storedFile.fileName} (${storedFile.mimeType}, ${storedFile.size}字节)】\n(二进制文件，无法直接显示内容)`,
              });
            }
          }

          messageContent = contentBlocks;
        } else {
          messageContent = body.message;
        }

        const messages: MultimodalChatMessage[] = [
          { role: 'system', content: systemMessage },
        ];
        const chatSession = await this.sessionService.getChatSession(sessionId);
        const historyMessages: MultimodalChatMessage[] = (chatSession?.history || []).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
        messages.push(...historyMessages);
        messages.push({ role: 'user', content: messageContent });

        const userMessageForHistory = this.normalizeContentToText(messageContent);
        let fullContent = '';
        await this.modelService.callModelStreamWithMessages(modelId, messages, (chunk: string) => {
          fullContent += chunk;
          this.writeSse(res, {
            type: StreamEventType.OBSERVATION,
            content: fullContent,
            traceId,
          });
        });

        this.writeSse(res, {
          type: StreamEventType.RESULT,
          content: fullContent || '处理完成',
          traceId,
        });

        await this.sessionService.appendChatMessages(sessionId, [
          {
            role: 'user',
            content: userMessageForHistory,
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: fullContent || '处理完成',
            timestamp: new Date().toISOString(),
          },
        ]);

        this.writeSse(res, {
          type: 'done',
          content: 'Stream completed',
          traceId,
        });
        res.end();
        return;
      }

      const resolvedUser = await this.resolveAuthenticatedUser(req.headers.authorization);
      const context: ExecutionContext = {
        sessionId: body.sessionId || 'default',
        userId: resolvedUser.userId || body.userId || 'anonymous',
        userRoles: resolvedUser.userRoles?.length ? resolvedUser.userRoles : body.userRoles,
        authToken: req.headers.authorization,
        traceId,
        history: [],
        uploadedFiles: body.files || [],
      };

      for await (const event of this.handleTaskMode(body, context, req.headers.authorization)) {
        this.writeSse(res, { ...event, traceId });
      }
      this.writeSse(res, { type: 'done', content: 'Stream completed', traceId });
      res.end();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.writeSse(res, {
        type: StreamEventType.ERROR,
        content: errorMsg,
        traceId,
      });
      res.end();
    }
  }

  private async *handleTaskMode(
    body: ChatRequestDTO,
    context: ExecutionContext,
    authToken?: string,
  ): AsyncGenerator<StreamEvent> {
    const traceId = context.traceId;

    // 如果请求中带了 executionId，或者 session 中存了 executionId，尝试恢复执行上下文
    const executionId = body.executionId || context.executionId;

    if (executionId) {
      try {
        // 查询执行单状态
        const response = await axios.get<{
          status: string;
          normalizedInput?: {
            requiredInputs?: Array<{
              name: string;
              missing?: boolean;
            }>;
          };
        }>(`${getControlPlaneUrl()}/executions/${executionId}`, {
          headers: authToken ? { Authorization: authToken } : {},
        });
        const execution = response.data;

        // 如果执行单在等待输入，且用户提供了消息，则提交输入
        if (execution.status === 'waiting_input' && body.message) {
          yield {
            type: StreamEventType.THOUGHT,
            content: '正在提交您补充的信息...',
          };

          // 获取等待输入的步骤
          const stepsResponse = await axios.get<any[]>(`${getControlPlaneUrl()}/executions/${executionId}/steps`, {
            headers: authToken ? { Authorization: authToken } : {},
          });
          const steps = stepsResponse.data;
          const waitingStep = steps.find((s: any) => s.status === 'waiting_input' || s.type === 'input_collection');

          if (waitingStep) {
            try {
              const missingInputs = Array.isArray(execution.normalizedInput?.requiredInputs)
                ? execution.normalizedInput.requiredInputs.filter((item) => item?.missing)
                : [];
              const inputPayload = this.buildWaitingInputPayload(body.message, missingInputs);

              await axios.post(
                `${getControlPlaneUrl()}/executions/${executionId}/submit-input`,
                {
                  stepId: waitingStep.id,
                  input: inputPayload,
                },
                {
                  headers: authToken ? { Authorization: authToken } : {},
                },
              );

              yield {
                type: StreamEventType.THOUGHT,
                content: '信息已提交，任务继续执行。',
              };

              for await (const event of this.observeExecution(executionId, authToken)) {
                yield event;
              }
              return;
            } catch (err: any) {
              yield {
                type: StreamEventType.ERROR,
                content: `提交信息失败: ${err.response?.data?.message || err.message}`,
              };
            }
          }
        }

        // 如果执行单还在运行中，返回状态并开始观察
        if (['queued', 'running', 'pending_approval'].includes(execution.status)) {
          yield {
            type: StreamEventType.THOUGHT,
            content: `任务正在执行中 (状态: ${execution.status})，正在为您实时观察进度...`,
          };
          
          for await (const event of this.observeExecution(executionId, authToken)) {
            yield event;
          }
          return;
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch execution ${executionId}: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }

    // 1. 生成计划
    yield {
      type: StreamEventType.THOUGHT,
      content: '正在规划任务...',
    };

    const planDraft = await this.plannerService.generatePlan({
      request: {
        user_input: body.message,
        user_id: context.userId,
        context: {
          sessionId: body.sessionId,
          uploadedFiles: body.files,
        },
      },
      userId: context.userId,
      authToken,
      traceId,
    });

    // 2. 如果匹配到技能，则在 control-plane 创建执行
    if (planDraft && planDraft.planner_mode === 'skill' && planDraft.skill_match) {
      const missingInputs = planDraft.required_inputs.filter((input) => input.missing);
      const runtimeType = await this.resolveSkillExecutionRuntimeType(
        planDraft.skill_match.skill_id,
        planDraft,
        authToken,
      );

      if (missingInputs.length > 0) {
        yield {
          type: StreamEventType.THOUGHT,
          content: `已识别到技能: ${planDraft.skill_match.skill_name}，正在创建可恢复的执行单...`,
        };

        try {
          const response = await axios.post<{ id: string }>(
            `${getControlPlaneUrl()}/executions`,
            {
              skillId: planDraft.skill_match.skill_id,
              input: {
                prompt: body.message,
                ...Object.fromEntries(
                  planDraft.required_inputs
                    .filter((input) => !input.missing)
                    .map((input) => [input.name, input.value]),
                ),
              },
              runtimeType,
            },
            {
              headers: authToken ? { Authorization: authToken } : {},
            },
          );

          for await (const event of this.observeExecution(response.data.id, authToken)) {
            yield event;
          }
          return;
        } catch (error: any) {
          const errorMsg = error.response?.data?.message || error.message;
          yield {
            type: StreamEventType.ERROR,
            content: `创建等待输入执行单失败: ${errorMsg}`,
          };
        }

        yield {
          type: StreamEventType.WAITING_INPUT,
          content: `已识别到技能 ${planDraft.skill_match.skill_name}，但还缺少必要信息：${missingInputs.map((input) => input.name).join('、')}。\n\n请先补充后再继续。`,
          data: {
            status: 'waiting_input',
            hasBusinessResult: false,
            missingInputs,
            plan: planDraft,
          },
        };
        return;
      }

      yield {
        type: StreamEventType.THOUGHT,
        content: `已匹配到技能: ${planDraft.skill_match.skill_name}，正在创建执行单...`,
      };

      try {
        const response = await axios.post<{ id: string }>(
          `${getControlPlaneUrl()}/executions`,
          {
            skillId: planDraft.skill_match.skill_id,
            input: {
              prompt: body.message,
              ...Object.fromEntries(
                planDraft.required_inputs
                  .filter((i) => !i.missing)
                  .map((i) => [i.name, i.value]),
              ),
            },
            runtimeType,
          },
          {
            headers: authToken ? { Authorization: authToken } : {},
          },
        );

        const execution = response.data;

        yield {
          type: StreamEventType.RESULT,
          content: `任务已启动。执行单 ID: ${execution.id}\n\n${planDraft.summary}`,
          data: {
            executionId: execution.id,
            status: 'queued',
            hasBusinessResult: false,
            plan: planDraft,
          },
        };

        // 启动后立即开始观察进度
        for await (const event of this.observeExecution(execution.id, authToken)) {
          yield event;
        }
        return;
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message;
        yield {
          type: StreamEventType.ERROR,
          content: `创建执行单失败: ${errorMsg}`,
        };
        // 失败后回退到 ReAct 引擎
        yield {
          type: StreamEventType.THOUGHT,
          content: '创建执行单失败，尝试使用 ReAct 引擎直接处理...',
        };
      }
    }

    // 3. 回退到 ReAct 引擎 (如果是 fallback 模式或者创建执行失败)
    for await (const event of this.reactEngineService.execute({ ...body, traceId }, context)) {
      yield event;
    }
  }

  private async *observeExecution(
    executionId: string,
    authToken?: string,
  ): AsyncGenerator<StreamEvent> {
    const url = `${getControlPlaneUrl()}/executions/${executionId}/events/stream`;
    this.logger.log(`Starting to observe execution ${executionId} via ${url}`);

    try {
      const immediateStateEvent = await this.buildLatestExecutionStateEvent(executionId, authToken);
      if (immediateStateEvent) {
        yield immediateStateEvent;
        return;
      }

      const response = await axios.get(url, {
        responseType: 'stream',
        headers: authToken ? { Authorization: authToken } : {},
      });

      const stream = response.data as Readable;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const rawData = line.substring(6);
              const event = JSON.parse(rawData);
              this.logger.debug(`Received execution event: ${event.eventType} for ${executionId}`);

              // 如果执行结束，停止观察
              if (
                event.eventType === 'execution.status_changed' &&
                ['succeeded', 'failed', 'cancelled'].includes(event.payload.newStatus)
              ) {
                const terminalEvent = await this.buildTerminalExecutionEvent(
                  executionId,
                  event.payload.newStatus,
                  authToken,
                );
                if (terminalEvent) {
                  yield terminalEvent;
                }
                this.logger.log(`Execution ${executionId} reached terminal state: ${event.payload.newStatus}`);
                return;
              }

              // 将 Control Plane 事件转换为 Chat Stream 事件
              const streamEvent = this.mapExecutionEventToStreamEvent(event);
              if (streamEvent) {
                yield streamEvent;
              }
            } catch (e) {
              this.logger.error(`Failed to parse execution event: ${line}`, e);
            }
          }
        }
      }

      const latestEvent = await this.buildLatestExecutionStateEvent(executionId, authToken);
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

  private async buildLatestExecutionStateEvent(
    executionId: string,
    authToken?: string,
  ): Promise<StreamEvent | null> {
    try {
      const response = await axios.get<{
        id: string;
        status: string;
        approvalStatus?: string;
        normalizedInput?: {
          requiredInputs?: Array<{
            name?: string;
            description?: string;
            missing?: boolean;
          }>;
        };
      }>(`${getControlPlaneUrl()}/executions/${executionId}`, {
        headers: authToken ? { Authorization: authToken } : {},
      });

      const status = response.data.status;

      if (['succeeded', 'failed', 'cancelled'].includes(status)) {
        return this.buildTerminalExecutionEvent(
          executionId,
          status as 'succeeded' | 'failed' | 'cancelled',
          authToken,
        );
      }

      if (status === 'waiting_input') {
        const missingInputs = Array.isArray(response.data.normalizedInput?.requiredInputs)
          ? response.data.normalizedInput.requiredInputs.filter((item) => item?.missing)
          : [];
        return {
          type: StreamEventType.WAITING_INPUT,
          content: missingInputs.length > 0
            ? `任务需要你补充信息后才能继续。\n\n缺少参数：${missingInputs.map((item) => item.name).join('、')}\n\n执行单 ID: ${executionId}`
            : `任务需要你补充信息后才能继续。\n\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            hasBusinessResult: false,
            missingInputs,
          },
        };
      }

      if (status === 'pending_approval') {
        return {
          type: StreamEventType.RESULT,
          content: `任务需要审批后才能继续执行。\n\n当前审批状态: ${response.data.approvalStatus || 'pending'}\n执行单 ID: ${executionId}`,
          data: {
            executionId,
            status,
            approvalStatus: response.data.approvalStatus || 'pending',
            hasBusinessResult: false,
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
    status: 'succeeded' | 'failed' | 'cancelled',
    authToken?: string,
  ): Promise<StreamEvent | null> {
    try {
      const response = await axios.get<{
        id: string;
        status: string;
        result?: unknown;
        resultJson?: unknown;
        failureReason?: string;
      }>(`${getControlPlaneUrl()}/executions/${executionId}`, {
        headers: authToken ? { Authorization: authToken } : {},
      });

      const execution = response.data;
      const rawResult = execution.resultJson ?? execution.result;

      if (status === 'succeeded') {
        if (rawResult !== null && rawResult !== undefined) {
          return {
            type: StreamEventType.RESULT,
            content: this.formatExecutionResult(rawResult, executionId),
            data: {
              executionId,
              status,
              result: rawResult,
              hasBusinessResult: true,
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
          },
        };
      }

      if (status === 'failed') {
        return {
          type: StreamEventType.ERROR,
          content: `任务执行失败。\n\n原因: ${execution.failureReason || '未知原因'}\n执行单 ID: ${executionId}`,
          data: { executionId, status },
        };
      }

      return {
        type: StreamEventType.RESULT,
        content: `任务已取消。\n\n执行单 ID: ${executionId}`,
        data: { executionId, status, hasBusinessResult: false },
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
    status: 'succeeded' | 'failed' | 'cancelled',
  ): StreamEvent {
    if (status === 'succeeded') {
      return {
        type: StreamEventType.RESULT,
        content: `任务已完成。\n\n执行单 ID: ${executionId}`,
        data: { executionId, status, hasBusinessResult: false },
      };
    }

    if (status === 'failed') {
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
      const preferredFields = ['formatted_output', 'summary', 'message', 'text', 'content'];

      for (const field of preferredFields) {
        const value = record[field];
        if (typeof value === 'string' && value.trim()) {
          return value;
        }
      }

      return `任务已完成，返回结果如下：\n\n${JSON.stringify(result, null, 2)}\n\n执行单 ID: ${executionId}`;
    }

    return `任务已完成，返回结果如下：\n\n${String(result)}\n\n执行单 ID: ${executionId}`;
  }

  private mapExecutionEventToStreamEvent(event: any): StreamEvent | null {
    const { eventType, payload } = event;

    switch (eventType) {
      case 'execution.status_changed':
        if (payload.newStatus === 'waiting_input') {
          const missingInputs = Array.isArray(payload.requiredInputs)
            ? payload.requiredInputs.filter((item: any) => item?.missing)
            : [];
          return {
            type: StreamEventType.WAITING_INPUT,
            content: missingInputs.length > 0
              ? `已识别到任务仍需补充信息，请继续输入后再执行。\n\n缺少参数：${missingInputs.map((item: any) => item.name).join('、')}\n\n执行单 ID: ${event.executionId}`
              : `已识别到任务仍需补充信息，请继续输入后再执行。\n\n执行单 ID: ${event.executionId}`,
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              hasBusinessResult: false,
              missingInputs,
            },
          };
        }

        if (payload.newStatus === 'pending_approval') {
          return {
            type: StreamEventType.RESULT,
            content: `任务需要审批后才能继续执行。\n\n当前审批状态: pending\n执行单 ID: ${event.executionId}`,
            data: {
              executionId: event.executionId,
              status: payload.newStatus,
              approvalStatus: 'pending',
              hasBusinessResult: false,
            },
          };
        }

        return {
          type: StreamEventType.THOUGHT,
          content: `任务状态变更为: ${payload.newStatus}`,
          data: { executionId: event.executionId, status: payload.newStatus },
        };
      case 'step.started':
        return {
          type: StreamEventType.ACTION,
          content: `正在执行: ${payload.stepName || payload.action || '系统步骤'}`,
          data: { stepId: payload.stepId },
        };
      case 'step.succeeded':
        let observationContent = '步骤执行成功。';
        if (payload.result) {
          const resultStr = typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result, null, 2);
          observationContent = `步骤执行成功，返回结果:\n${resultStr}`;
        }
        return {
          type: StreamEventType.OBSERVATION,
          content: observationContent,
          data: { stepId: payload.stepId, result: payload.result },
        };
      case 'step.failed':
        return {
          type: StreamEventType.ERROR,
          content: `步骤执行失败: ${payload.error || '未知错误'}`,
          data: { stepId: payload.stepId, error: payload.error },
        };
      case 'runtime.allocated':
        return {
          type: StreamEventType.THOUGHT,
          content: `🚀 已分配运行环境，准备开始执行...`,
        };
      case 'execution.input_submitted':
        return {
          type: StreamEventType.THOUGHT,
          content: `📥 已接收到您补充的信息，正在继续执行...`,
        };
      case 'execution.waiting_input':
      case 'step.waiting_input': {
        const missingInputs = Array.isArray(payload.requiredInputs)
          ? payload.requiredInputs.filter((item: any) => item?.missing)
          : [];
        return {
          type: StreamEventType.WAITING_INPUT,
          content: missingInputs.length > 0
            ? `⏳ 任务需要您的进一步操作或提供信息以继续执行。\n\n缺少参数：${missingInputs.map((item: any) => item.name).join('、')}`
            : `⏳ 任务需要您的进一步操作或提供信息以继续执行。`,
          data: {
            executionId: event.executionId,
            missingInputs,
          },
        };
      }
      default:
        return null;
    }
  }

  @Post('chat')
  @ApiOperation({ summary: 'Simple AI chat (non-streaming)' })
  async chat(
    @Body() body: ChatRequestDTO,
    @Req() req: Request & { traceId?: string },
  ): Promise<{ response: string; events: StreamEvent[] }> {
    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const mode: 'chat' | 'task' = body.config?.mode || 'task';

    if (mode === 'chat') {
      const modelId = body.modelId || 'default';
      const sessionId = body.sessionId || 'default';
      const client = this.modelService.getClient(modelId);
      if (!client) {
        return {
          response: `模型 ${modelId} 未初始化`,
          events: [{ type: StreamEventType.ERROR, content: `模型 ${modelId} 未初始化` }],
        };
      }

      const systemMessage = '你是一个智能助手，请用中文友好地回答用户的问题。';
      const chatSession = await this.sessionService.getChatSession(sessionId);
      const historyMessages: MultimodalChatMessage[] = (chatSession?.history || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      const userContent = body.message;
      const messages: MultimodalChatMessage[] = [
        { role: 'system', content: systemMessage },
        ...historyMessages,
        { role: 'user', content: userContent },
      ];
      const response = await client.chatCompletion(messages);

      await this.sessionService.appendChatMessages(sessionId, [
        {
          role: 'user',
          content: this.normalizeContentToText(userContent),
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        },
      ]);

      return {
        response,
        events: [{
          type: StreamEventType.RESULT,
          content: response,
          data: { traceId, sessionId, mode: 'chat' },
        }],
      };
    }

    const resolvedUser = await this.resolveAuthenticatedUser(req.headers.authorization);
    const context: ExecutionContext = {
      sessionId: body.sessionId || 'default',
      userId: resolvedUser.userId || body.userId || 'anonymous',
      userRoles: resolvedUser.userRoles?.length ? resolvedUser.userRoles : body.userRoles,
      authToken: req.headers.authorization,
      traceId,
      history: [],
      uploadedFiles: body.files || [],
    };

    const events: StreamEvent[] = [];
    let finalResponse = '';

    for await (const event of this.handleTaskMode(body, context, req.headers.authorization)) {
      const eventWithTrace = {
        ...event,
        data: {
          ...(event.data || {}),
          traceId,
        },
      };
      events.push(eventWithTrace);
      if (
        event.type === StreamEventType.RESULT
        || event.type === StreamEventType.WAITING_INPUT
        || event.type === StreamEventType.ERROR
      ) {
        finalResponse = event.content;
      }
    }

    return { response: finalResponse, events };
  }

  @Post('chat/upload')
  @ApiOperation({ summary: 'Upload file for chat' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadChatFile(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ fileId: string; fileName: string; mimeType: string; size: number }> {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    fileStore.set(fileId, {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      content: file.buffer.toString('base64'),
    });

    if (fileStore.size > 100) {
      const keys = Array.from(fileStore.keys());
      keys.slice(0, keys.length - 100).forEach((key) => fileStore.delete(key));
    }

    return {
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
