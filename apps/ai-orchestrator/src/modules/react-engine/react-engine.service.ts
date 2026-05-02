/**
 * ReAct Engine Service
 * 核心ReAct循环引擎，实现Thought → Action → Observation循环
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModelService } from '../model/model.service';
import { ToolExecutor } from './tool-executor';
import { SessionService } from '../redis/session.service';
import { CapabilityResolver } from './capability-resolver';
import {
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
  RoutingMeta,
  PromptAssemblyMeta,
  PromptDebugPayload,
  DecisionContext,
  LLMCallDetail,
} from './interfaces';
import {
  buildSystemPromptSections,
  buildUserPromptSections,
  DecisionContextPromptSummary,
  parseActionResponse,
  buildObservationPrompt,
  renderPromptSections,
} from './prompt-builder';
import { buildDecisionContextPromptSummary } from './decision-context-summary';
import { ContextWindowManager } from './context-window-manager';
import { ModelRouterService } from './model-router.service';
import {
  attachErrorCategory,
  decideRecoveryAction,
} from './error-recovery-policy';
import { LLMResponse } from '../../interfaces';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';
import { CONTROL_PLANE_EXECUTION_STATUS } from '../../client/control-plane.contracts';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ReActConfig = {
  maxIterations: 10,  // 增加到10次，支持更复杂的多步骤流程
  modelId: 'default',
  tools: ['skill_match', 'document_intake', 'generate_parameters', 'preview_params', 'document_render', 'document_param_recover', 'param_collect', 'user_ask', 'file_parse', 'api_call', 'flow_execute'],
  mode: 'task',
};

const MAX_SAME_ACTION_RETRIES = Number(process.env.REACT_MAX_SAME_ACTION_RETRIES || 1);
const MAX_MODEL_INFERENCE_RETRIES = Number(process.env.REACT_MAX_MODEL_INFERENCE_RETRIES || 1);

@Injectable()
export class ReActEngineService {
  private readonly logger = new Logger(ReActEngineService.name);
  private readonly contextWindowManager = new ContextWindowManager();

  constructor(
    private readonly modelService: ModelService,
    private readonly toolExecutor: ToolExecutor,
    private readonly sessionService: SessionService,
    private readonly capabilityResolver: CapabilityResolver,
    private readonly modelRouterService: ModelRouterService,
    private readonly promptDebugSettingsService: PromptDebugSettingsService = new PromptDebugSettingsService(),
  ) {}

  private tracePrefix(context: ExecutionContext): string {
    return context.traceId ? `[${context.traceId}] ` : '';
  }

  private mergeApprovedToolNames(
    existing: string[] | undefined,
    incoming: string[] | undefined,
  ): string[] | undefined {
    const merged = Array.from(new Set([...(existing || []), ...(incoming || [])].filter(Boolean)));
    return merged.length > 0 ? merged : undefined;
  }

  private getPendingApprovalToolName(state: ReActState): string | undefined {
    if (state.lastToolResult?.code !== 'tool_requires_approval') {
      return undefined;
    }
    const toolName = state.lastToolResult.data?.toolName;
    return typeof toolName === 'string' && toolName.trim().length > 0 ? toolName : undefined;
  }

  private canResumeApprovedAction(
    request: ChatRequestDTO,
    state: ReActState,
  ): boolean {
    const pendingToolName = this.getPendingApprovalToolName(state);
    return Boolean(
      pendingToolName
      && request.approvedToolNames?.includes(pendingToolName),
    );
  }

  private buildPersistedContext(context: ExecutionContext): Partial<ExecutionContext> {
    return {
      skill: context.skill,
      availableSkills: context.availableSkills,
      uploadedFiles: context.uploadedFiles,
      collectedParams: context.collectedParams,
      documentContext: context.documentContext,
      userRoles: context.userRoles,
      capabilitySnapshot: context.capabilitySnapshot,
      approvedToolNames: context.approvedToolNames,
    };
  }

  private appendReActTrace(
    messages: ChatMessage[],
    state: ReActState,
  ): ChatMessage[] {
    const decisionContext = this.buildDecisionContextPayload(state);
    const routingMeta = decisionContext.routing;
    const observationRecord = this.contextWindowManager.buildObservationRecord(state.observation || '');
    const nextMessages = [
      ...messages,
      {
        role: 'assistant' as const,
        content: JSON.stringify({
          thought: state.thought,
          action: state.action,
          actionInput: state.actionInput,
        }),
        timestamp: new Date(),
        metadata: {
          isReAct: true,
          iteration: state.iteration,
          routing: routingMeta,
          decisionContext,
        },
      },
      {
        role: 'user' as const,
        content: observationRecord.content,
        timestamp: new Date(),
        metadata: {
          isReAct: true,
          iteration: state.iteration,
          routing: routingMeta,
          decisionContext,
          ...observationRecord.meta,
        },
      },
    ];

    return this.contextWindowManager.compactReActHistory(state, nextMessages);
  }

  private appendProtocolViolationTrace(
    messages: ChatMessage[],
    response: string,
    protocolError: string,
    state: ReActState,
  ): ChatMessage[] {
    const decisionContext = this.buildDecisionContextPayload(state);
    const routingMeta = decisionContext.routing;
    const observationRecord = this.contextWindowManager.buildObservationRecord(protocolError);
    const nextMessages = [
      ...messages,
      {
        role: 'assistant' as const,
        content: response,
        timestamp: new Date(),
        metadata: {
          isReAct: true,
          iteration: state.iteration,
          protocolViolation: true,
          routing: routingMeta,
          decisionContext,
        },
      },
      {
        role: 'user' as const,
        content: observationRecord.content,
        timestamp: new Date(),
        metadata: {
          isReAct: true,
          iteration: state.iteration,
          protocolViolation: true,
          routing: routingMeta,
          decisionContext,
          ...observationRecord.meta,
        },
      },
    ];

    return this.contextWindowManager.compactReActHistory(state, nextMessages);
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
      retryState: {},
    };
  }

  private resetRetryState(
    state: ReActState,
    target: 'same_action' | 'model_inference',
  ): void {
    state.retryState = {
      ...(state.retryState || {}),
      [target === 'same_action' ? 'sameAction' : 'modelInference']: 0,
    };
  }

  private buildRoutingMeta(state: ReActState): RoutingMeta {
    return {
      modelId: state.retryState?.activeModelId,
      attemptedModelIds: state.retryState?.attemptedModelIds,
      routingReason: state.retryState?.routingReason,
    };
  }

  private buildDecisionContextSummary(state: ReActState): DecisionContextPromptSummary | undefined {
    return buildDecisionContextPromptSummary({
      routing: this.buildRoutingMeta(state),
      promptAssembly: this.buildPromptAssemblyPayload(state),
    });
  }

  private setPromptAssemblyMeta(
    state: ReActState,
    systemSections: Array<{ key: string; source: string }>,
    userSections: Array<{ key: string; source: string }>,
  ): void {
    state.promptAssembly = {
      systemPromptSectionKeys: systemSections.map((section) => section.key),
      systemPromptSectionSources: systemSections.map((section) => section.source),
      userPromptSectionKeys: userSections.map((section) => section.key),
      userPromptSectionSources: userSections.map((section) => section.source),
    };
  }

  private buildPromptAssemblyMeta(state: ReActState): PromptAssemblyMeta {
    return {
      systemPromptSectionKeys: state.promptAssembly?.systemPromptSectionKeys,
      systemPromptSectionSources: state.promptAssembly?.systemPromptSectionSources,
      userPromptSectionKeys: state.promptAssembly?.userPromptSectionKeys,
      userPromptSectionSources: state.promptAssembly?.userPromptSectionSources,
    };
  }

  private buildPromptAssemblyPayload(state: ReActState): PromptAssemblyMeta {
    return this.buildPromptAssemblyMeta(state);
  }

  private canExposePromptDebug(context: ExecutionContext): boolean {
    return this.promptDebugSettingsService.isPromptDebugEnabled()
      && Boolean(context.userRoles?.includes('admin'));
  }

  private buildPromptDebugPayload(
    state: ReActState,
    context: ExecutionContext,
  ): PromptDebugPayload | undefined {
    if (!this.canExposePromptDebug(context)) {
      return undefined;
    }
    return state.promptDebug;
  }

  private buildDecisionContextPayload(state: ReActState): DecisionContext {
    return {
      routing: this.buildRoutingMeta(state),
      promptAssembly: this.buildPromptAssemblyPayload(state),
    };
  }

  private scheduleRetry(
    state: ReActState,
    context: ExecutionContext,
    target: 'same_action' | 'model_inference',
    options: {
      action?: string;
      params?: Record<string, unknown>;
      message?: string;
    } = {},
  ): boolean {
    const retryKey = target === 'same_action' ? 'sameAction' : 'modelInference';
    const maxRetries = target === 'same_action'
      ? MAX_SAME_ACTION_RETRIES
      : MAX_MODEL_INFERENCE_RETRIES;
    const currentRetries = state.retryState?.[retryKey] || 0;
    if (currentRetries >= maxRetries) {
      return false;
    }

    state.retryState = {
      ...(state.retryState || {}),
      [retryKey]: currentRetries + 1,
    };
    state.isWaitingForUserInput = false;
    if (options.message) {
      state.observation = options.message;
    }

    if (target === 'same_action' && options.action) {
      context.nextAction = options.action;
      context.nextActionParams = options.params || {};
    }

    return true;
  }

  private async ensureActiveModelId(
    state: ReActState,
    config: ReActConfig,
    context: ExecutionContext,
  ): Promise<void> {
    const routingDecision = this.modelRouterService.resolveInitialModel(
      config.modelId,
      state.retryState?.activeModelId,
      state.retryState?.attemptedModelIds,
      {
        mode: context.capabilitySnapshot?.mode || config.mode,
        userInput: context.originalUserInput,
        userRoles: context.userRoles,
        availableSkills: context.availableSkills,
      },
    );
    state.retryState = {
      ...(state.retryState || {}),
      activeModelId: routingDecision.modelId,
      attemptedModelIds: routingDecision.attemptedModelIds,
      routingReason: routingDecision.reason,
    };
    config.modelId = routingDecision.modelId;
    this.logger.debug(`Model routing initialized: ${routingDecision.reason} -> ${routingDecision.modelId}`);
  }

  private async switchToFallbackModel(
    state: ReActState,
    config: ReActConfig,
    context: ExecutionContext,
  ): Promise<boolean> {
    const activeModelId = state.retryState?.activeModelId || config.modelId;
    const routingDecision = this.modelRouterService.resolveFallbackModel(
      activeModelId,
      state.retryState?.attemptedModelIds || [],
      state.lastToolResult,
    );
    if (!routingDecision) {
      return false;
    }

    state.retryState = {
      ...(state.retryState || {}),
      activeModelId: routingDecision.modelId,
      attemptedModelIds: routingDecision.attemptedModelIds,
      routingReason: routingDecision.reason,
      modelInference: 0,
    };
    config.modelId = routingDecision.modelId;
    state.isWaitingForUserInput = false;
    state.observation = `当前模型恢复失败，已按 ${routingDecision.reason} 策略切换到后备模型 ${routingDecision.modelId} 继续执行。`;
    this.logger.warn(`${this.tracePrefix(context)}Model fallback selected: ${routingDecision.reason} -> ${routingDecision.modelId}`);

    return true;
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
    context.approvedToolNames = this.mergeApprovedToolNames(
      context.approvedToolNames,
      request.approvedToolNames,
    );
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
      const canResumeApprovedAction = this.canResumeApprovedAction(request, savedSession.state);
      // 已进入等待用户输入状态时，若本次没有新输入，则直接返回等待事件，避免重复执行工具
      if (savedSession.state.isWaitingForUserInput && !request.message?.trim() && !canResumeApprovedAction) {
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
        if (request.message?.trim() || canResumeApprovedAction) {
          state.isWaitingForUserInput = false;
        }
        // 恢复context中的数据
        if (savedSession.context) {
          Object.assign(context, savedSession.context);
        }
        context.approvedToolNames = this.mergeApprovedToolNames(
          context.approvedToolNames,
          request.approvedToolNames,
        );
        if (canResumeApprovedAction && state.action) {
          context.nextAction = state.action;
          context.nextActionParams = state.actionInput || {};
          this.logger.log(`${this.tracePrefix(context)}Resuming approved action ${state.action} for session ${context.sessionId}`);
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

    const capabilitySnapshot = await this.capabilityResolver.resolveIfNeeded(request, context);
    context.capabilitySnapshot = capabilitySnapshot;
    context.userRoles = capabilitySnapshot.roles;
    context.availableSkills = capabilitySnapshot.visibleSkills.map((skill) => ({
      skillId: skill.skillId,
      skillName: skill.skillName,
      description: skill.description,
      triggerKeywords: skill.triggerKeywords,
      paramsSchema: skill.paramsSchema,
      templateId: skill.templateId,
      carboneSkillId: skill.carboneSkillId,
      carboneTemplateId: skill.carboneTemplateId,
      executionFlowTemplateIds: skill.executionFlowTemplateIds,
      executionFlow: skill.executionFlow,
      goal: skill.runtimeHints?.goal,
      expectedResult: skill.runtimeHints?.expectedResult,
      outputParams: skill.runtimeHints?.outputParams,
      executionType: skill.executionType,
      effectiveTools: capabilitySnapshot.selectedSkillId === skill.skillId
        ? (capabilitySnapshot.skillScopedToolNames || [])
        : undefined,
    }));
    context.allowedToolNames = capabilitySnapshot.visibleTools.map((tool) => tool.name);
    context.selectedSkillToolNames = capabilitySnapshot.skillScopedToolNames || [];
    const tools = this.toolExecutor.getTools(context.allowedToolNames, context.userRoles);
    await this.ensureActiveModelId(state, config, context);

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
          data: {
            actionInput: state.actionInput,
            promptDebug: this.buildPromptDebugPayload(state, context),
            promptAssembly: this.buildPromptAssemblyPayload(state),
            routing: this.buildRoutingMeta(state),
            decisionContext: this.buildDecisionContextPayload(state),
          },
          iteration: state.iteration,
        };

        // 直接执行Action，跳过AI决策
        yield* this.executeAction(state, context);

        // 将这一步加入历史
        messages = this.appendReActTrace(messages, state);

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
            context: this.buildPersistedContext(context),
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
          data: {
            actionInput: state.actionInput,
            promptDebug: this.buildPromptDebugPayload(state, context),
            promptAssembly: this.buildPromptAssemblyPayload(state),
            routing: this.buildRoutingMeta(state),
            decisionContext: this.buildDecisionContextPayload(state),
          },
          iteration: state.iteration,
        };

        // 执行Action
        yield* this.executeAction(state, context);

        // 将这一步加入历史
        messages = this.appendReActTrace(messages, state);

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
              documentContext: context.documentContext,
              userRoles: context.userRoles,
              capabilitySnapshot: context.capabilitySnapshot,
            },
          });
          yield this.createWaitingEvent(state);
          break;
        }
        continue; // 跳过 AI 决策，进入下一轮流处理或普通循环
      }

      // 2. 构建提示词并调用AI获取Thought和Action
      const aiResponse = this.generateThoughtAndAction(state, context, messages, tools, config);
      for await (const event of aiResponse) {
        yield event;
      }

      // AI 决策失败时，保留上下文并暂停，等待用户补充或重试
      if (!state.action && !state.isFinished) {
        const recoveryAction = decideRecoveryAction('model_inference', state.lastToolResult);
        if (recoveryAction.type === 'retry' && recoveryAction.retryTarget === 'model_inference') {
          const scheduled = this.scheduleRetry(state, context, 'model_inference', {
            message: recoveryAction.message,
          });
          if (scheduled) {
            continue;
          }
          const fallbackSwitched = await this.switchToFallbackModel(state, config, context);
          if (fallbackSwitched) {
            continue;
          }
          state.isWaitingForUserInput = true;
          state.observation = recoveryAction.message || state.observation;
        }
      }

      if (state.isWaitingForUserInput && !state.action && !state.isFinished) {
        await this.sessionService.saveSession(context.sessionId, {
          state,
          history: messages,
          context: this.buildPersistedContext(context),
        });
        yield this.createWaitingEvent(state);
        break;
      }

      // 3. 执行Action
      if (state.action && state.action !== 'finish') {
        // 检查动作是否需要确认
        const tool = this.toolExecutor.getTool(state.action);
        const requiresConfirmation = Boolean(
          tool?.requiresConfirmation
          || context.capabilitySnapshot?.policies.requireConfirmToolNames.includes(state.action)
          || context.capabilitySnapshot?.visibleTools.find((item) => item.name === state.action)?.requiresConfirmation,
        );
        if (requiresConfirmation && !request.isConfirmed) {
          yield {
            type: StreamEventType.ACTION_CONFIRM,
            content: `操作 "${state.action}" 需要您的确认才能执行。`,
            data: {
              action: state.action,
              actionInput: state.actionInput,
              promptDebug: this.buildPromptDebugPayload(state, context),
              promptAssembly: this.buildPromptAssemblyPayload(state),
              routing: this.buildRoutingMeta(state),
              decisionContext: this.buildDecisionContextPayload(state),
            },
            iteration: state.iteration,
          };

          // 暂停循环，等待确认
          // 持久化当前状态以便恢复
          await this.sessionService.saveSession(context.sessionId, {
            state,
            history: messages,
            context: this.buildPersistedContext(context),
          });
          break;
        }

        yield* this.executeAction(state, context);

        // 将AI响应与观察结果加入历史（会进行裁剪和滚动摘要）
        messages = this.appendReActTrace(messages, state);

        // 每一轮迭代后持久化状态
        await this.sessionService.saveSession(context.sessionId, {
          state,
          history: messages,
          context: this.buildPersistedContext(context),
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
          context: this.buildPersistedContext(context),
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
        context: this.buildPersistedContext(context),
      });
      yield {
        type: StreamEventType.ERROR,
        content: `达到最大迭代次数 ${state.maxIterations}，任务未完成`,
        data: {
          taskStatus: CONTROL_PLANE_EXECUTION_STATUS.FAILED,
          promptDebug: this.buildPromptDebugPayload(state, context),
          canResume: true,
          promptAssembly: this.buildPromptAssemblyPayload(state),
          routing: this.buildRoutingMeta(state),
          decisionContext: this.buildDecisionContextPayload(state),
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
    const systemSections = buildSystemPromptSections(
      tools,
      context.skill,
      context.availableSkills || [],
      config.mode || 'task',
      context.capabilitySnapshot,
    );
    const systemPrompt = renderPromptSections(systemSections);
    
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

    const userSections = buildUserPromptSections(
      userInput,
      messages,
      context.uploadedFiles?.map((f) => f.fileName),
      state.contextSummary,
      this.buildDecisionContextSummary(state),
    );
    const userPrompt = renderPromptSections(userSections);
    this.setPromptAssemblyMeta(state, systemSections, userSections);
    state.promptDebug = this.canExposePromptDebug(context)
      ? {
        debugSource: 'react-engine',
        systemPrompt,
        userPrompt,
        systemPromptSectionKeys: systemSections.map((section) => section.key),
        systemPromptSectionSources: systemSections.map((section) => section.source),
        userPromptSectionKeys: userSections.map((section) => section.key),
        userPromptSectionSources: userSections.map((section) => section.source),
        modelId: config.modelId,
        llmRequestMessages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        llmCalls: [
          {
            stage: 'react-engine',
            label: 'ReAct 推理',
            modelId: config.modelId,
            requestMessages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          },
        ],
      }
      : undefined;
    this.logger.debug(
      `${this.tracePrefix(context)}Prompt assembly: `
      + `system=${state.promptAssembly?.systemPromptSectionKeys?.join(',') || 'none'} `
      + `user=${state.promptAssembly?.userPromptSectionKeys?.join(',') || 'none'}`,
    );

    // 调用AI模型（流式）
    const client = this.modelService.getClient(config.modelId);
    if (!client) {
      state.lastToolResult = {
        success: false,
        output: `模型 ${config.modelId} 未初始化`,
        code: 'model_not_initialized',
        severity: 'error',
        data: {
          error: 'model_not_initialized',
          errorCategory: 'provider_error',
          modelId: config.modelId,
        },
        meta: {
          toolName: 'model_inference',
          ...this.buildRoutingMeta(state),
          ...this.buildPromptAssemblyMeta(state),
        },
      };
      yield {
        type: StreamEventType.ERROR,
        content: `模型 ${config.modelId} 未初始化`,
        data: {
          code: state.lastToolResult.code,
          severity: state.lastToolResult.severity,
          meta: state.lastToolResult.meta,
          promptDebug: this.buildPromptDebugPayload(state, context),
          promptAssembly: this.buildPromptAssemblyPayload(state),
          routing: this.buildRoutingMeta(state),
          decisionContext: this.buildDecisionContextPayload(state),
          toolResult: state.lastToolResult,
        },
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
      const rawResponse = await client.chatCompletion(aiMessages as any);
      const response = this.normalizeLLMResponse(rawResponse);
      if (state.promptDebug) {
        const llmCalls = Array.isArray(state.promptDebug.llmCalls)
          ? [...state.promptDebug.llmCalls]
          : [];
        const lastCall = llmCalls[llmCalls.length - 1];
        if (lastCall) {
          lastCall.responseText = response.content;
        }
        state.promptDebug = {
          ...state.promptDebug,
          modelId: config.modelId,
          llmRequestMessages: aiMessages.map((message) => ({
            role: message.role as 'system' | 'user' | 'assistant',
            content: String(message.content || ''),
          })),
          llmResponseText: response.content,
          llmCalls,
        };
      }

      // 记录消耗 (P2-1)
      await this.recordLLMCall(state, config.modelId, response);

      // 解析响应
      const parsed = parseActionResponse(response.content);

      if (parsed) {
        this.resetRetryState(state, 'model_inference');
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
          data: {
            actionInput: parsed.actionInput,
            promptDebug: this.buildPromptDebugPayload(state, context),
            promptAssembly: this.buildPromptAssemblyPayload(state),
            routing: this.buildRoutingMeta(state),
            decisionContext: this.buildDecisionContextPayload(state),
            usage: state.usage,
          },
          iteration: state.iteration,
        };
      } else {
        const protocolError =
          '协议错误：模型输出未遵循标准 ReAct 协议。请严格按 "Thought:", "Action:", "Action Input:" 或 "Final Answer:" 输出，不要使用任何私有 tool_call 格式。';
        state.thought = '检测到协议违规，要求模型按统一协议重试';
        state.action = '';
        state.actionInput = {};
        state.observation = protocolError;
        state.lastToolResult = {
          success: false,
          output: protocolError,
          code: 'protocol_error',
          severity: 'error',
          data: {
            error: 'protocol_error',
            errorCategory: 'protocol_error',
          },
          meta: {
            toolName: 'model_inference',
            ...this.buildRoutingMeta(state),
            ...this.buildPromptAssemblyMeta(state),
          },
        };

        messages = this.appendProtocolViolationTrace(messages, response.content, protocolError, state);

        yield {
          type: StreamEventType.ERROR,
          content: protocolError,
          data: {
            code: state.lastToolResult.code,
            severity: state.lastToolResult.severity,
            meta: state.lastToolResult.meta,
            promptDebug: this.buildPromptDebugPayload(state, context),
            promptAssembly: this.buildPromptAssemblyPayload(state),
            routing: this.buildRoutingMeta(state),
            decisionContext: this.buildDecisionContextPayload(state),
            toolResult: state.lastToolResult,
          },
          iteration: state.iteration,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      state.observation = `AI调用失败: ${errorMsg}`;
      state.isWaitingForUserInput = true;
      state.lastToolResult = {
        success: false,
        output: `AI调用失败: ${errorMsg}`,
        code: 'provider_error',
        severity: 'error',
        data: {
          error: 'provider_error',
          errorCategory: 'provider_error',
          message: errorMsg,
        },
        meta: {
          toolName: 'model_inference',
          ...this.buildRoutingMeta(state),
          ...this.buildPromptAssemblyMeta(state),
        },
      };
      yield {
        type: StreamEventType.ERROR,
        content: `AI调用失败: ${errorMsg}`,
        data: {
          code: state.lastToolResult.code,
          severity: state.lastToolResult.severity,
          meta: state.lastToolResult.meta,
          promptDebug: this.buildPromptDebugPayload(state, context),
          promptAssembly: this.buildPromptAssemblyPayload(state),
          routing: this.buildRoutingMeta(state),
          decisionContext: this.buildDecisionContextPayload(state),
          toolResult: state.lastToolResult,
        },
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
    const rawResultData = event.data?.result as ToolResult | undefined;
    const resultData = attachErrorCategory(rawResultData);
    const innerData = resultData?.data;
    if (event.data && resultData) {
      event.data.result = resultData as unknown as Record<string, unknown>;
      event.data.code = resultData.code;
      event.data.severity = resultData.severity;
      event.data.meta = {
        ...(resultData.meta || {}),
        ...this.buildRoutingMeta(state),
        ...this.buildPromptAssemblyMeta(state),
      };
      event.data.promptAssembly = this.buildPromptAssemblyPayload(state);
      event.data.decisionContext = this.buildDecisionContextPayload(state);
      event.data.errorCategory = typeof innerData?.errorCategory === 'string'
        ? innerData.errorCategory
        : undefined;
      event.data.routing = this.buildRoutingMeta(state);
    }

    state.lastToolResult = resultData;
    if (resultData?.success) {
      this.resetRetryState(state, 'same_action');
    }

    // 优先输出结构化的用户提示文案，避免仅显示“参数不完整”这类内部描述
    if (state.isWaitingForUserInput && resultData?.userInputPrompt) {
      state.observation = resultData.userInputPrompt;
    }

    const recoveryAction = decideRecoveryAction(toolName, resultData);
    if (recoveryAction.type === 'next_action' && !state.isWaitingForUserInput) {
      context.nextAction = recoveryAction.action;
      context.nextActionParams = {
        errorMessage: state.observation || `${toolName} failed`,
        currentParams: context.collectedParams || {},
        userInput: context.originalUserInput || '',
        ...(recoveryAction.params || {}),
      };
      if (recoveryAction.observationSuffix) {
        state.observation = `${state.observation}\n\n${recoveryAction.observationSuffix}`;
      }
    } else if (recoveryAction.type === 'wait_user_input') {
      state.isWaitingForUserInput = true;
      state.observation = recoveryAction.message || state.observation;
      context.nextAction = undefined;
      context.nextActionParams = undefined;
    } else if (recoveryAction.type === 'terminate') {
      state.isFinished = true;
      state.observation = recoveryAction.message || state.observation;
      state.finalAnswer = recoveryAction.message || state.observation || '任务终止';
      state.finalResultData = {
        ...(resultData?.data || {}),
        taskStatus: 'terminated',
        finalAnswer: state.finalAnswer,
      };
      context.nextAction = undefined;
      context.nextActionParams = undefined;
    } else if (recoveryAction.type === 'retry' && recoveryAction.retryTarget === 'same_action') {
      this.scheduleRetry(state, context, 'same_action', {
        action: toolName,
        params,
        message: recoveryAction.message,
      });
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
      state.finalResultData = innerData as Record<string, unknown>;
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
          promptDebug: this.buildPromptDebugPayload(state, context),
          promptAssembly: this.buildPromptAssemblyPayload(state),
          routing: this.buildRoutingMeta(state),
          decisionContext: this.buildDecisionContextPayload(state),
        },
        iteration: state.iteration,
      };
    }

    yield event;

    if (!event.data?.requiresUserInput) {
      buildObservationPrompt(
        state.observation,
        state.iteration,
        state.maxIterations,
      );
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
        hasBusinessResult: !!state.finalResultData,
        result: state.finalResultData,
        toolResult: state.lastToolResult,
        code: state.lastToolResult?.code,
        severity: state.lastToolResult?.severity,
        meta: {
          ...(state.lastToolResult?.meta || {}),
          ...this.buildRoutingMeta(state),
          ...this.buildPromptAssemblyMeta(state),
        },
        promptDebug: state.promptDebug,
        promptAssembly: this.buildPromptAssemblyPayload(state),
        routing: this.buildRoutingMeta(state),
        decisionContext: this.buildDecisionContextPayload(state),
        usage: state.usage,
        downloadUrl: state.finalResultData?.downloadUrl,
      },
      iteration: state.iteration,
    };
  }

  private appendTaskCompletedCheckbox(content: string): string {
    if (content.includes('任务完成')) {
      return content;
    }
    return `${content}\n\n任务完成`;
  }

  /**
   * 创建等待用户输入事件
   */
  private createWaitingEvent(state: ReActState): StreamEvent {
    const approvalToolName = this.getPendingApprovalToolName(state);
    return {
      type: StreamEventType.WAITING_INPUT,
      content: state.observation,
      data: {
        requiresUserInput: true,
        taskStatus: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
        waitReason: approvalToolName ? 'approval' : 'user_input',
        approvalToolName,
        action: state.action,
        toolResult: state.lastToolResult,
        code: state.lastToolResult?.code,
        severity: state.lastToolResult?.severity,
        meta: {
          ...(state.lastToolResult?.meta || {}),
          ...this.buildRoutingMeta(state),
          ...this.buildPromptAssemblyMeta(state),
        },
        promptDebug: state.promptDebug,
        promptAssembly: this.buildPromptAssemblyPayload(state),
        routing: this.buildRoutingMeta(state),
        decisionContext: this.buildDecisionContextPayload(state),
        usage: state.usage,
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
   * 记录 LLM 调用消耗 (P2-1)
   */
  private async recordLLMCall(
    state: ReActState,
    modelId: string,
    response: LLMResponse,
    type: 'reasoning' | 'auxiliary' = 'reasoning',
  ): Promise<void> {
    if (!state.usage) {
      state.usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        completion_tokens_details: {
          reasoning_tokens: 0,
        },
        totalCost: 0,
        currency: 'CNY', // 默认币种
        calls: [],
      };
    }

    const usage = response.usage;
    const rateLimit = response.rateLimit;
    let cost = 0;
    let currency = state.usage.currency;

    if (usage) {
      // 获取模型计费信息
      const model = await this.modelService.getModel(modelId);
      if (model?.pricing) {
        const inputCost = (usage.prompt_tokens / 1000) * model.pricing.input_price_per_1k;
        const outputCost = (usage.completion_tokens / 1000) * model.pricing.output_price_per_1k;
        cost = inputCost + outputCost;
        currency = model.pricing.currency;
      }

      state.usage.prompt_tokens += usage.prompt_tokens;
      state.usage.completion_tokens += usage.completion_tokens;
      state.usage.total_tokens += usage.total_tokens;

      if (usage.completion_tokens_details?.reasoning_tokens) {
        if (!state.usage.completion_tokens_details) {
          state.usage.completion_tokens_details = { reasoning_tokens: 0 };
        }
        state.usage.completion_tokens_details.reasoning_tokens = (state.usage.completion_tokens_details.reasoning_tokens || 0) + usage.completion_tokens_details.reasoning_tokens;
      }

      state.usage.totalCost += cost;
      state.usage.currency = currency;
    }

    const callDetail: LLMCallDetail = {
      iteration: state.iteration,
      modelId,
      usage,
      rateLimit,
      cost,
      currency,
      timestamp: new Date(),
      type,
    };

    state.usage.calls.push(callDetail);

    this.logger.debug(
      `${this.tracePrefix({ sessionId: '' } as any)}LLM Call Recorded: `
      + `model=${modelId} tokens=${usage?.total_tokens || 0} cost=${cost.toFixed(6)}${currency}`,
    );
  }

  private normalizeLLMResponse(response: string | LLMResponse | undefined): LLMResponse {
    if (!response) {
      return { content: '' };
    }

    if (typeof response === 'string') {
      return { content: response };
    }

    return {
      content: response.content || '',
      usage: response.usage,
      rateLimit: response.rateLimit,
    };
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
    status:
      | typeof CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.FAILED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.CANCELLED
      | typeof CONTROL_PLANE_EXECUTION_STATUS.HUMAN_CONTROL,
    _result?: Record<string, unknown>,
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
