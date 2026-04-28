/**
 * ReAct Engine Service
 * 核心ReAct循环引擎，实现Thought → Action → Observation循环
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import { ToolExecutor } from './tool-executor';
import { SessionService } from '../redis/session.service';
import {
  AvailableSkillDefinition,
  StreamEvent,
  StreamEventType,
  ReActState,
  ReActConfig,
  ExecutionContext,
  ChatMessage,
  ChatRequestDTO,
  SkillMatchResult,
  ToolResult,
  ToolDefinition,
} from './interfaces';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseActionResponse,
  buildObservationPrompt,
} from './prompt-builder';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ReActConfig = {
  maxIterations: 10,  // 增加到10次，支持更复杂的多步骤流程
  modelId: 'default',
  tools: ['skill_match', 'generate_parameters', 'preview_params', 'document_render', 'param_collect', 'user_ask', 'file_parse', 'api_call', 'flow_execute'],
  mode: 'task',
};

@Injectable()
export class ReActEngineService {
  private readonly logger = new Logger(ReActEngineService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly toolExecutor: ToolExecutor,
    private readonly sessionService: SessionService,
  ) {}

  private tracePrefix(context: ExecutionContext): string {
    return context.traceId ? `[${context.traceId}] ` : '';
  }

  private async loadAvailableSkills(context: ExecutionContext): Promise<AvailableSkillDefinition[]> {
    if (!context.userId) {
      return [];
    }

    try {
      const authUrl = process.env.AUTH_SERVICE_URL
        || (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production'
          ? 'http://ops-auth:3001'
          : 'http://localhost:3001');
      const response = await fetch(`${authUrl}/skills`, {
        headers: {
          ...(context.authToken ? { Authorization: context.authToken } : {}),
          ...(context.traceId ? { 'x-trace-id': context.traceId } : {}),
        },
      });

      if (!response.ok) {
        this.logger.warn(`${this.tracePrefix(context)}Failed to load available skills: ${response.status}`);
        return [];
      }

      const payload = await response.json() as { skills?: Array<Record<string, unknown>> };
      const rawSkills = Array.isArray(payload.skills) ? payload.skills : [];

      return rawSkills.map((item) => {
        const apiEndpoints = (typeof item.apiEndpoints === 'object' && item.apiEndpoints)
          ? item.apiEndpoints as AvailableSkillDefinition['apiEndpoints']
          : undefined;

        return {
          skillId: String(item.id || ''),
          skillName: String(item.name || ''),
          description: typeof item.description === 'string' ? item.description : undefined,
          triggerKeywords: Array.isArray(item.triggerKeywords) ? item.triggerKeywords.map(String) : [],
          paramsSchema: (item.paramsSchema as AvailableSkillDefinition['paramsSchema']) || { properties: {}, required: [] },
          templateId: typeof item.templateId === 'string' ? item.templateId : undefined,
          carboneTemplateId: typeof item.carboneTemplateId === 'string' ? item.carboneTemplateId : undefined,
          carboneSkillId: typeof item.carboneSkillId === 'string' ? item.carboneSkillId : undefined,
          executionFlowTemplateIds: Array.isArray(item.executionFlowTemplateIds) ? item.executionFlowTemplateIds.map(String) : [],
          executionFlow: Array.isArray(item.executionFlow)
            ? item.executionFlow
                .map((step) => (step && typeof step === 'object'
                  ? String((step as Record<string, unknown>).name || (step as Record<string, unknown>).type || '')
                  : ''))
                .filter(Boolean)
            : [],
          apiEndpoints,
          goal: apiEndpoints?.runtimeMetadata?.goal,
          expectedResult: apiEndpoints?.runtimeMetadata?.expectedResult,
          outputParams: apiEndpoints?.runtimeMetadata?.outputParams,
        };
      }).filter((item) => item.skillId && item.skillName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`${this.tracePrefix(context)}Failed to load available skills: ${message}`);
      return [];
    }
  }

  private createInitialState(maxIterations: number): ReActState {
    return {
      thought: '',
      action: '',
      actionInput: {},
      observation: '',
      iteration: 0,
      maxIterations,
      isFinished: false,
      isWaitingForUserInput: false,
    };
  }

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

    let state: ReActState;
    let messages: ChatMessage[];

    // 注入角色信息
    if (request.userRoles) {
      context.userRoles = request.userRoles;
    }
    if (request.message?.trim()) {
      context.originalUserInput = request.message.trim();
    }

    // 绑定 executionId 到 context
    if (request.executionId) {
      context.executionId = request.executionId;
      this.logger.log(`${this.tracePrefix(context)}Bound executionId ${request.executionId} to context`);
    }

    // 尝试从Session中恢复
    const savedSession = await this.sessionService.getSession(context.sessionId);
    if (savedSession) {
      // 已进入等待用户输入状态时，若本次没有新输入，则直接返回等待事件，避免重复执行工具
      if (savedSession.state.isWaitingForUserInput && !request.message?.trim()) {
        this.logger.debug(`${this.tracePrefix(context)}Session ${context.sessionId} is waiting for user input`);
        yield this.createWaitingEvent(savedSession.state);
        return;
      }

      const shouldStartNewRun = savedSession.state.isFinished
        || savedSession.state.iteration >= savedSession.state.maxIterations;

      if (shouldStartNewRun) {
        this.logger.log(`${this.tracePrefix(context)}Resetting finished session ${context.sessionId} for a new task run`);
        await this.sessionService.deleteSession(context.sessionId);
        // 不要从旧session恢复context，让skill_match重新匹配
        state = this.createInitialState(config.maxIterations);
        messages = savedSession.history;
      } else {
        this.logger.log(`${this.tracePrefix(context)}Resuming session ${context.sessionId} at iteration ${savedSession.state.iteration}`);
        state = savedSession.state;
        messages = savedSession.history;
        // 收到新输入后解除等待状态，继续后续步骤
        if (request.message?.trim()) {
          state.isWaitingForUserInput = false;
        }
        // 恢复context中的数据
        if (savedSession.context) {
          Object.assign(context, savedSession.context);
        }
      }
      
      // 如果 Session 中没存角色（旧数据），优先使用当前请求带的角色
      if (request.userRoles) {
        context.userRoles = request.userRoles;
      }
      
      // 如果新请求带了消息，作为新用户输入加入历史
      if (request.message) {
        messages.push({
          role: 'user',
          content: request.message,
          timestamp: new Date(),
        });
      }
    } else {
      state = this.createInitialState(config.maxIterations);

      // 初始化消息列表，添加用户消息
      messages = [...context.history];
      if (request.message) {
        messages.push({
          role: 'user',
          content: request.message,
          timestamp: new Date(),
        });
      }
    }
    
    // 加载动态流程工具
    await this.toolExecutor.loadDynamicFlowTools(false, context.traceId);

    context.availableSkills = await this.loadAvailableSkills(context);

    // 获取工具列表时应用权限过滤 (任务模式强制收紧)
    const configuredTools = config.mode === 'task'
      ? config.tools.filter((toolName) => !['skill_match', 'api_call'].includes(toolName))
      : config.tools;
    const tools = this.toolExecutor.getTools(configuredTools, context.userRoles);
    context.allowedToolNames = tools.map((tool) => tool.name);

    // 开始循环
    while (!state.isFinished && state.iteration < state.maxIterations) {
      state.iteration++;
      state.thought = '';
      state.action = '';
      state.actionInput = {};
      state.isWaitingForUserInput = false;

      this.logger.debug(`${this.tracePrefix(context)}ReAct iteration ${state.iteration}/${state.maxIterations}`);

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

        // 将这一步加入历史
        messages.push({
          role: 'assistant',
          content: JSON.stringify({
            thought: state.thought,
            action: state.action,
            actionInput: state.actionInput
          }),
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration },
        });
        messages.push({
          role: 'user',
          content: `Observation: ${state.observation}`,
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration },
        });

        // 检查是否完成
        if (state.action === 'finish' || state.isFinished) {
          yield this.createResultEvent(state);
          await this.sessionService.deleteSession(context.sessionId);
          break;
        }
        if (state.isWaitingForUserInput) {
          await this.sessionService.saveSession(context.sessionId, {
            state,
            history: messages,
            context: {
              skill: context.skill,
              availableSkills: context.availableSkills,
              uploadedFiles: context.uploadedFiles,
              collectedParams: context.collectedParams,
              userRoles: context.userRoles,
            },
          });
          yield this.createWaitingEvent(state);
          break;
        }
        continue;  // 继续下一轮
      }

      // 1.5 检查预编译执行流 (Fast-track)
      if (
        config.mode !== 'task'
        && context.skill?.executionFlow
        && context.currentFlowStep !== undefined
        && context.currentFlowStep < context.skill.executionFlow.length
      ) {
        const flowTool = context.skill.executionFlow[context.currentFlowStep];
        if (!flowTool) {
          context.currentFlowStep++;
          continue;
        }
        this.logger.debug(`${this.tracePrefix(context)}Fast-track: executing flow step ${context.currentFlowStep + 1}/${context.skill.executionFlow.length} - ${flowTool}`);

        state.action = flowTool;
        state.thought = `[自动执行] 进入预编译流程步骤 ${context.currentFlowStep + 1}: ${flowTool}`;

        // 自动构建参数
        if (flowTool === 'generate_parameters') {
          const originalUserMessage = messages.find(m => m.role === 'user' && !m.metadata?.isReAct);
          state.actionInput = { 
            skillId: context.skill.carboneSkillId, 
            description: typeof originalUserMessage?.content === 'string' ? originalUserMessage.content : '' 
          };
        } else if (flowTool === 'document_render') {
          state.actionInput = {
            templateId: context.skill.carboneTemplateId,
            data: context.collectedParams || {}
          };
        } else {
          state.actionInput = context.collectedParams || {};
        }

        context.currentFlowStep++;

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

        // 执行Action
        yield* this.executeAction(state, context);

        // 将这一步加入历史
        messages.push({
          role: 'assistant',
          content: JSON.stringify({
            thought: state.thought,
            action: state.action,
            actionInput: state.actionInput
          }),
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration },
        });
        messages.push({
          role: 'user',
          content: `Observation: ${state.observation}`,
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration },
        });

        // 检查是否完成
        if (state.action === 'finish' || state.isFinished) {
          yield this.createResultEvent(state);
          await this.sessionService.deleteSession(context.sessionId);
          break;
        }
        if (state.isWaitingForUserInput) {
          await this.sessionService.saveSession(context.sessionId, {
            state,
            history: messages,
            context: {
              skill: context.skill,
              availableSkills: context.availableSkills,
              uploadedFiles: context.uploadedFiles,
              collectedParams: context.collectedParams,
              userRoles: context.userRoles,
            },
          });
          yield this.createWaitingEvent(state);
          break;
        }
        continue; // 跳过 AI 决策，进入下一轮流处理或普通循环
      }

      // 2. 构建提示词并调用AI获取Thought和Action
      const aiResponse = await this.generateThoughtAndAction(state, context, messages, tools, config);
      for await (const event of aiResponse) {
        yield event;
      }

      // AI 决策失败时，保留上下文并暂停，等待用户补充或重试
      if (state.isWaitingForUserInput && !state.action && !state.isFinished) {
        await this.sessionService.saveSession(context.sessionId, {
          state,
          history: messages,
          context: {
            skill: context.skill,
            availableSkills: context.availableSkills,
            uploadedFiles: context.uploadedFiles,
            collectedParams: context.collectedParams,
            userRoles: context.userRoles,
          },
        });
        yield this.createWaitingEvent(state);
        break;
      }

      // 3. 执行Action
      if (state.action && state.action !== 'finish') {
        // 检查动作是否需要确认
        const tool = this.toolExecutor.getTool(state.action);
        if (tool?.requiresConfirmation && !request.isConfirmed) {
          yield {
            type: StreamEventType.ACTION_CONFIRM,
            content: `操作 "${state.action}" 需要您的确认才能执行。`,
            data: {
              action: state.action,
              actionInput: state.actionInput,
            },
            iteration: state.iteration,
          };

          // 暂停循环，等待确认
          // 持久化当前状态以便恢复
          await this.sessionService.saveSession(context.sessionId, {
            state,
            history: messages,
            context: {
              skill: context.skill,
              availableSkills: context.availableSkills,
              uploadedFiles: context.uploadedFiles,
              collectedParams: context.collectedParams,
              userRoles: context.userRoles, // 存入 Session
            }
          });
          break;
        }

        // 将AI响应加入历史
        messages.push({
          role: 'assistant',
          content: JSON.stringify({
            thought: state.thought,
            action: state.action,
            actionInput: state.actionInput
          }),
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration },
        });

        yield* this.executeAction(state, context);

        // 将观察结果加入历史
        messages.push({
          role: 'user',
          content: `Observation: ${state.observation}`,
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration },
        });

        // 每一轮迭代后持久化状态
        await this.sessionService.saveSession(context.sessionId, {
          state,
          history: messages,
          context: {
            skill: context.skill,
            availableSkills: context.availableSkills,
            uploadedFiles: context.uploadedFiles,
            collectedParams: context.collectedParams,
            userRoles: context.userRoles,
          }
        });
      }

      // 3. 检查是否完成
      if (state.action === 'finish' || state.isFinished) {
        yield this.createResultEvent(state);
        await this.sessionService.deleteSession(context.sessionId);
        break;
      }

      // 4. 如果需要用户输入，暂停循环（显式标记，不依赖文案关键词）
      if (state.isWaitingForUserInput) {
        await this.sessionService.saveSession(context.sessionId, {
          state,
          history: messages,
          context: {
            skill: context.skill,
            availableSkills: context.availableSkills,
            uploadedFiles: context.uploadedFiles,
            collectedParams: context.collectedParams,
            userRoles: context.userRoles,
          },
        });
        yield this.createWaitingEvent(state);
        break;
      }
    }

    // 超过最大迭代次数
    if (state.iteration >= state.maxIterations && !state.isFinished) {
      await this.sessionService.saveSession(context.sessionId, {
        state,
        history: messages,
        context: {
          skill: context.skill,
          availableSkills: context.availableSkills,
          uploadedFiles: context.uploadedFiles,
          collectedParams: context.collectedParams,
          userRoles: context.userRoles,
        },
      });
      yield {
        type: StreamEventType.ERROR,
        content: `达到最大迭代次数 ${state.maxIterations}，任务未完成`,
        data: {
          taskStatus: 'failed',
          canResume: true,
        },
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
    tools: ToolDefinition[],
    config: ReActConfig,
  ): AsyncGenerator<StreamEvent> {
    // 构建提示词
    const systemPrompt = buildSystemPrompt(
      tools,
      context.skill,
      context.availableSkills || [],
      config.mode || 'task',
    );
    
    // 提取最初的用户输入
    const originalUserMessage = messages.find(m => m.role === 'user' && !m.metadata?.isReAct);
    let userInput = '';
    if (originalUserMessage?.content) {
      if (typeof originalUserMessage.content === 'string') {
        userInput = originalUserMessage.content;
      } else if (Array.isArray(originalUserMessage.content as unknown)) {
        // 从多模态内容中提取文本部分
        const contentArray = originalUserMessage.content as unknown as Array<{ type: string; text?: string }>;
        const textBlocks = contentArray.filter((b) => b.type === 'text');
        userInput = textBlocks.map((b) => b.text || '').join('\n');
      }
    }

    const userPrompt = buildUserPrompt(
      userInput,
      messages,
      context.uploadedFiles?.map((f) => f.fileName),
    );

    // 调用AI模型（流式）
    const client = this.modelService.getClient(config.modelId);
    if (!client) {
      yield {
        type: StreamEventType.ERROR,
        content: `模型 ${config.modelId} 未初始化`,
      };
      return;
    }

    // 禁用 JSON Mode，统一使用文本协议输出
    client.updateConfig({ useJsonMode: false });

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
      const response = await client.chatCompletion(aiMessages as any);

      // 解析响应
      const parsed = parseActionResponse(response);

      if (parsed) {
        state.thought = parsed.thought;
        state.action = parsed.action;
        state.actionInput = parsed.actionInput;

        if (parsed.action === 'finish' && typeof parsed.actionInput.answer === 'string') {
          state.isFinished = true;
          state.finalAnswer = parsed.actionInput.answer;
        }

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
        const protocolError =
          '协议错误：模型输出未遵循标准 ReAct 协议。请严格按 "Thought:", "Action:", "Action Input:" 或 "Final Answer:" 输出，不要使用任何私有 tool_call 格式。';
        state.thought = '检测到协议违规，要求模型按统一协议重试';
        state.action = '';
        state.actionInput = {};
        state.observation = protocolError;

        messages.push({
          role: 'assistant',
          content: response,
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration, protocolViolation: true },
        });
        messages.push({
          role: 'user',
          content: `Observation: ${protocolError}`,
          timestamp: new Date(),
          metadata: { isReAct: true, iteration: state.iteration, protocolViolation: true },
        });

        yield {
          type: StreamEventType.ERROR,
          content: protocolError,
          iteration: state.iteration,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      state.observation = `AI调用失败: ${errorMsg}`;
      state.isWaitingForUserInput = true;
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
    state.isWaitingForUserInput = Boolean(event.data?.requiresUserInput) || toolName === 'user_ask';

    // Extract result data with proper typing
    const resultData = event.data?.result as ToolResult | undefined;
    const innerData = resultData?.data;

    // 优先输出结构化的用户提示文案，避免仅显示“参数不完整”这类内部描述
    if (state.isWaitingForUserInput && resultData?.userInputPrompt) {
      state.observation = resultData.userInputPrompt;
    }

    // 更新context中的skill信息
    if (innerData?.skill) {
      context.skill = innerData.skill as SkillMatchResult;
    }

    // 检查是否任务完成（如document_render返回taskComplete）
    if (innerData?.taskComplete && !state.isWaitingForUserInput) {
      state.isFinished = true;
      state.finalAnswer = typeof innerData.finalAnswer === 'string' && innerData.finalAnswer.trim()
        ? innerData.finalAnswer
        : event.content;
    }

    // 检查是否有nextAction提示
    if (state.isWaitingForUserInput) {
      // 等待用户输入时强制停止后续自动链路，避免继续执行下一工具
      context.nextAction = undefined;
      context.nextActionParams = undefined;
    } else if (resultData?.nextAction) {
      context.nextAction = resultData.nextAction;
      context.nextActionParams = resultData.nextActionParams as Record<string, unknown>;
    }

    // 检查是否参数确认场景 (仅在工具执行成功时触发)
    if (resultData?.success && innerData?.allParamsReady) {
      // 参数完整，发送确认事件
      yield {
        type: StreamEventType.PARAMS_CONFIRM,
        content: '参数已收集完成，等待确认',
        data: {
          params: innerData.params,
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
    const baseContent = state.finalAnswer || state.observation || '任务完成';
    const content = this.appendTaskCompletedCheckbox(baseContent);
    return {
      type: StreamEventType.RESULT,
      content,
      data: {
        taskStatus: 'completed',
      },
      iteration: state.iteration,
    };
  }

  private appendTaskCompletedCheckbox(content: string): string {
    if (content.includes('- [x] 任务完成')) {
      return content;
    }
    return `${content}\n\n- [x] 任务完成（可改为未完成）`;
  }

  /**
   * 创建等待用户输入事件
   */
  private createWaitingEvent(state: ReActState): StreamEvent {
    return {
      type: StreamEventType.WAITING_INPUT,
      content: state.observation,
      data: {
        requiresUserInput: true,
        taskStatus: 'waiting_input',
        action: state.action,
      },
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

  /**
   * Create initial execution steps for an Execution
   */
  async createExecutionSteps(
    executionId: string,
    _skill: SkillMatchResult,
  ): Promise<void> {
    this.logger.warn(
      `Execution step creation has been delegated to control-plane in v3; skipping local step creation for execution ${executionId}`,
    );
  }

  /**
   * Update current step status
   */
  async updateCurrentStep(
    context: ExecutionContext,
    status: string,
    _additionalData?: {
      outputJson?: Record<string, unknown>;
      errorMessage?: string;
      errorCode?: string;
      snapshotId?: string;
    },
  ): Promise<void> {
    if (!context.executionId || !context.currentStepId) {
      return;
    }

    this.logger.warn(
      `${this.tracePrefix(context)}Step status writes are delegated to control-plane in v3; `
      + `skipping local update for ${context.currentStepId} -> ${status}`,
    );
  }

  /**
   * Finalize execution - update Execution status
   */
  async finalizeExecution(
    context: ExecutionContext,
    status: 'succeeded' | 'failed' | 'cancelled' | 'human_control',
    result?: Record<string, unknown>,
    _failureReason?: string,
  ): Promise<void> {
    if (!context.executionId) {
      return;
    }

    this.logger.warn(
      `${this.tracePrefix(context)}Execution finalization is delegated to control-plane in v3; `
      + `skipping local finalize for ${context.executionId} -> ${status}`,
    );
  }
}
