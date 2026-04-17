/**
 * ReAct Engine Service
 * 核心ReAct循环引擎，实现Thought → Action → Observation循环
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import { ToolExecutor } from './tool-executor';
import {
  StreamEvent,
  StreamEventType,
  ReActState,
  ReActConfig,
  ExecutionContext,
  ChatMessage,
  ChatRequestDTO,
  SkillMatchResult,
} from './interfaces';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseActionResponse,
  buildObservationPrompt,
  buildParamsConfirmPrompt,
} from './prompt-builder';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ReActConfig = {
  maxIterations: 10,  // 增加到10次，支持更复杂的多步骤流程
  modelId: 'default',
  tools: ['skill_match', 'generate_parameters', 'preview_params', 'document_render', 'param_collect', 'user_ask', 'file_parse'],
};

@Injectable()
export class ReActEngineService {
  private readonly logger = new Logger(ReActEngineService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  /**
   * 执行ReAct循环（流式输出）
   */
  async *execute(
    request: ChatRequestDTO,
    context: ExecutionContext,
  ): AsyncGenerator<StreamEvent> {
    const config: ReActConfig = {
      ...DEFAULT_CONFIG,
      ...request.config,
      modelId: request.modelId || DEFAULT_CONFIG.modelId,
    };

    const state: ReActState = {
      thought: '',
      action: '',
      actionInput: {},
      observation: '',
      iteration: 0,
      maxIterations: config.maxIterations,
      isFinished: false,
    };

    // 初始化消息列表，添加用户消息
    const messages: ChatMessage[] = [...context.history];
    if (request.message) {
      messages.push({ role: 'user', content: request.message });
    }
    const tools = this.toolExecutor.getTools(config.tools);

    // 开始循环
    while (!state.isFinished && state.iteration < state.maxIterations) {
      state.iteration++;

      this.logger.debug(`ReAct iteration ${state.iteration}/${state.maxIterations}`);

      // 1. 检查是否有工具返回的nextAction提示，如果有则跳过AI决策直接执行
      if (context.nextAction) {
        state.action = context.nextAction;
        state.actionInput = context.nextActionParams || {};
        state.thought = `根据工具返回的提示，执行下一步: ${context.nextAction}`;
        context.nextAction = undefined;  // 清除提示
        context.nextActionParams = undefined;

        // 发送thought事件
        yield {
          type: StreamEventType.THOUGHT,
          content: state.thought,
          iteration: state.iteration,
        };

        // 发送action事件
        yield {
          type: StreamEventType.ACTION,
          content: state.action,
          data: { actionInput: state.actionInput },
          iteration: state.iteration,
        };

        // 直接执行Action，跳过AI决策
        yield* this.executeAction(state, context);

        // 检查是否完成
        if (state.action === 'finish' || state.isFinished) {
          yield this.createResultEvent(state);
          break;
        }
        continue;  // 继续下一轮
      }

      // 2. 构建提示词并调用AI获取Thought和Action
      yield* this.generateThoughtAndAction(state, context, messages, tools, config);

      // 3. 执行Action
      if (state.action && state.action !== 'finish') {
        yield* this.executeAction(state, context);
      }

      // 3. 检查是否完成
      if (state.action === 'finish' || state.isFinished) {
        yield this.createResultEvent(state);
        break;
      }

      // 4. 如果需要用户输入，暂停循环
      const lastObservation = state.observation;
      if (lastObservation.includes('requiresUserInput') || lastObservation.includes('请提供')) {
        yield this.createWaitingEvent(state);
        break;
      }
    }

    // 超过最大迭代次数
    if (state.iteration >= state.maxIterations && !state.isFinished) {
      yield {
        type: StreamEventType.ERROR,
        content: `达到最大迭代次数 ${state.maxIterations}，任务未完成`,
        iteration: state.iteration,
      };
    }
  }

  /**
   * 生成Thought和Action
   */
  private async *generateThoughtAndAction(
    state: ReActState,
    context: ExecutionContext,
    messages: ChatMessage[],
    tools: ReturnType<typeof this.toolExecutor.getTools>,
    config: ReActConfig,
  ): AsyncGenerator<StreamEvent> {
    // 构建提示词
    const systemPrompt = buildSystemPrompt(tools, context.skill);
    // 提取用户输入，处理多模态内容
    const lastMessage = messages[messages.length - 1];
    let userInput = '';
    if (lastMessage?.content) {
      if (typeof lastMessage.content === 'string') {
        userInput = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        // 从多模态内容中提取文本部分
        const textBlocks = lastMessage.content.filter((b: any) => b.type === 'text');
        userInput = textBlocks.map((b: any) => b.text).join('\n');
      }
    }
    const userPrompt = buildUserPrompt(
      userInput,
      messages.slice(0, -1),
      context.uploadedFiles?.map((f) => f.fileName),
    );

    // 调用AI模型（流式）
    const client = this.modelService.getClientByModelId(config.modelId);
    if (!client) {
      yield {
        type: StreamEventType.ERROR,
        content: `模型 ${config.modelId} 未初始化`,
      };
      return;
    }

    // 流式调用
    const fullResponse = '';
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // 发送thought开始事件
    yield {
      type: StreamEventType.THOUGHT,
      content: '',
      iteration: state.iteration,
    };

    try {
      // 使用流式API
      const response = await client.chatCompletion(aiMessages);

      // 解析响应
      const parsed = parseActionResponse(response);

      if (parsed) {
        state.thought = parsed.thought;
        state.action = parsed.action;
        state.actionInput = parsed.actionInput;

        // 发送thought事件
        yield {
          type: StreamEventType.THOUGHT,
          content: parsed.thought,
          iteration: state.iteration,
        };

        // 发送action事件
        yield {
          type: StreamEventType.ACTION,
          content: `${parsed.action}`,
          data: { actionInput: parsed.actionInput },
          iteration: state.iteration,
        };
      } else {
        // 无法解析，直接作为回复
        state.isFinished = true;
        state.finalAnswer = response;
        yield {
          type: StreamEventType.THOUGHT,
          content: '直接回复用户',
          iteration: state.iteration,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      yield {
        type: StreamEventType.ERROR,
        content: `AI调用失败: ${errorMsg}`,
        iteration: state.iteration,
      };
    }
  }

  /**
   * 执行Action
   */
  private async *executeAction(
    state: ReActState,
    context: ExecutionContext,
  ): AsyncGenerator<StreamEvent> {
    const toolName = state.action;
    const params = state.actionInput;

    // 执行工具
    const event = await this.toolExecutor.executeToolStream(
      toolName,
      params,
      context,
      state.iteration,
    );

    state.observation = event.content;

    // 更新context中的skill信息
    if (event.data?.result?.data?.skill) {
      context.skill = event.data.result.data.skill as SkillMatchResult;
    }

    // 检查是否任务完成（如document_render返回taskComplete）
    if (event.data?.result?.data?.taskComplete) {
      state.isFinished = true;
      state.finalAnswer = event.content;
    }

    // 检查是否有nextAction提示
    if (event.data?.result?.nextAction) {
      context.nextAction = event.data.result.nextAction as string;
      context.nextActionParams = event.data.result.nextActionParams as Record<string, unknown>;
    }

    // 检查是否参数确认场景
    if (event.data?.result?.data?.allParamsReady) {
      // 参数完整，发送确认事件
      yield {
        type: StreamEventType.PARAMS_CONFIRM,
        content: '参数已收集完成，等待确认',
        data: {
          params: event.data.result.data.params,
          skill: context.skill,
        },
        iteration: state.iteration,
      };
    }

    yield event;

    // 构建下一次循环的输入
    if (!event.data?.requiresUserInput) {
      // 添加observation到消息历史
      const nextPrompt = buildObservationPrompt(
        state.observation,
        state.iteration,
        state.maxIterations,
      );
      // 这里可以继续循环
    }
  }

  /**
   * 创建结果事件
   */
  private createResultEvent(state: ReActState): StreamEvent {
    return {
      type: StreamEventType.RESULT,
      content: state.finalAnswer || '任务完成',
      iteration: state.iteration,
    };
  }

  /**
   * 创建等待用户输入事件
   */
  private createWaitingEvent(state: ReActState): StreamEvent {
    return {
      type: StreamEventType.RESULT,
      content: state.observation,
      data: { requiresUserInput: true },
      iteration: state.iteration,
    };
  }

  /**
   * 继续执行（用户回复后）
   */
  async *continueExecution(
    userReply: string,
    previousState: ReActState,
    context: ExecutionContext,
    config: ReActConfig,
  ): AsyncGenerator<StreamEvent> {
    // 重置状态
    previousState.isFinished = false;
    previousState.observation = userReply;

    // 继续循环
    yield* this.execute(
      {
        message: userReply,
        sessionId: context.sessionId,
        userId: context.userId,
        config,
      },
      context,
    );
  }
}