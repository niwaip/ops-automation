/**
 * ReAct Engine Service
 * 核心ReAct循环引擎，实现Thought → Action → Observation循环
 */

import { Logger } from '@nestjs/common';
import {
  ReActState,
  ReActConfig,
  ExecutionContext,
  ChatMessage,
  ChatRequestDTO,
  RoutingMeta,
  PromptAssemblyMeta,
  PromptDebugPayload,
  DecisionContext,
} from './interfaces';
import {
  DecisionContextPromptSummary,
} from './prompt-builder';
import { buildDecisionContextPromptSummary } from './decision-context-summary';
import { ContextWindowManager } from './context-window-manager';
import { ModelRouterService } from './model-router.service';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';

const MAX_SAME_ACTION_RETRIES = Number(process.env.REACT_MAX_SAME_ACTION_RETRIES || 1);
const MAX_MODEL_INFERENCE_RETRIES = Number(process.env.REACT_MAX_MODEL_INFERENCE_RETRIES || 1);

export class ReActExecutionSupport {
  private readonly contextWindowManager = new ContextWindowManager();
  constructor(
    private readonly modelRouterService: ModelRouterService,
    private readonly promptDebugSettingsService: PromptDebugSettingsService,
    private readonly logger: Logger
  ) {}
  tracePrefix(context: ExecutionContext): string {
    return context.traceId ? `[${context.traceId}] ` : '';
  }

  mergeApprovedToolNames(
    existing: string[] | undefined,
    incoming: string[] | undefined
  ): string[] | undefined {
    const merged = Array.from(new Set([...(existing || []), ...(incoming || [])].filter(Boolean)));
    return merged.length > 0 ? merged : undefined;
  }

  getPendingApprovalToolName(state: ReActState): string | undefined {
    if (state.lastToolResult?.code !== 'tool_requires_approval') {
      return undefined;
    }
    const toolName = state.lastToolResult.data?.toolName;
    return typeof toolName === 'string' && toolName.trim().length > 0 ? toolName : undefined;
  }

  canResumeApprovedAction(request: ChatRequestDTO, state: ReActState): boolean {
    const pendingToolName = this.getPendingApprovalToolName(state);
    return Boolean(pendingToolName && request.approvedToolNames?.includes(pendingToolName));
  }

  buildPersistedContext(context: ExecutionContext): Partial<ExecutionContext> {
    return {
      skill: context.skill,
      availableSkills: context.availableSkills,
      uploadedFiles: context.uploadedFiles,
      collectedParams: context.collectedParams,
      documentContext: context.documentContext,
      userRoles: context.userRoles,
      capabilitySnapshot: context.capabilitySnapshot,
      approvedToolNames: context.approvedToolNames,
      executionId: context.executionId,
      originalUserInput: context.originalUserInput,
      currentFlowStep: context.currentFlowStep,
    };
  }

  appendReActTrace(messages: ChatMessage[], state: ReActState): ChatMessage[] {
    const decisionContext = this.buildDecisionContextPayload(state);
    const routingMeta = decisionContext.routing;
    const observationRecord = this.contextWindowManager.buildObservationRecord(
      state.observation || ''
    );
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

  appendProtocolViolationTrace(
    messages: ChatMessage[],
    response: string,
    protocolError: string,
    state: ReActState
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

  createInitialState(maxIterations: number): ReActState {
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

  resetRetryState(state: ReActState, target: 'same_action' | 'model_inference'): void {
    state.retryState = {
      ...(state.retryState || {}),
      [target === 'same_action' ? 'sameAction' : 'modelInference']: 0,
    };
  }

  buildRoutingMeta(state: ReActState): RoutingMeta {
    return {
      modelId: state.retryState?.activeModelId,
      attemptedModelIds: state.retryState?.attemptedModelIds,
      routingReason: state.retryState?.routingReason,
    };
  }

  buildDecisionContextSummary(state: ReActState): DecisionContextPromptSummary | undefined {
    return buildDecisionContextPromptSummary({
      routing: this.buildRoutingMeta(state),
      promptAssembly: this.buildPromptAssemblyMeta(state),
    });
  }

  setPromptAssemblyMeta(
    state: ReActState,
    systemSections: Array<{ key: string; source: string }>,
    userSections: Array<{ key: string; source: string }>
  ): void {
    state.promptAssembly = {
      systemPromptSectionKeys: systemSections.map((section) => section.key),
      systemPromptSectionSources: systemSections.map((section) => section.source),
      userPromptSectionKeys: userSections.map((section) => section.key),
      userPromptSectionSources: userSections.map((section) => section.source),
    };
  }

  buildPromptAssemblyMeta(state: ReActState): PromptAssemblyMeta {
    return {
      systemPromptSectionKeys: state.promptAssembly?.systemPromptSectionKeys,
      systemPromptSectionSources: state.promptAssembly?.systemPromptSectionSources,
      userPromptSectionKeys: state.promptAssembly?.userPromptSectionKeys,
      userPromptSectionSources: state.promptAssembly?.userPromptSectionSources,
    };
  }

  canExposePromptDebug(context: ExecutionContext): boolean {
    return (
      this.promptDebugSettingsService.isPromptDebugEnabled() &&
      Boolean(context.userRoles?.includes('admin'))
    );
  }

  buildPromptDebugPayload(
    state: ReActState,
    context: ExecutionContext
  ): PromptDebugPayload | undefined {
    if (!this.canExposePromptDebug(context)) {
      return undefined;
    }
    return state.promptDebug;
  }

  buildDecisionContextPayload(state: ReActState): DecisionContext {
    return {
      routing: this.buildRoutingMeta(state),
      promptAssembly: this.buildPromptAssemblyMeta(state),
    };
  }

  scheduleRetry(
    state: ReActState,
    context: ExecutionContext,
    target: 'same_action' | 'model_inference',
    options: {
      action?: string;
      params?: Record<string, unknown>;
      message?: string;
    } = {}
  ): boolean {
    const retryKey = target === 'same_action' ? 'sameAction' : 'modelInference';
    const maxRetries =
      target === 'same_action' ? MAX_SAME_ACTION_RETRIES : MAX_MODEL_INFERENCE_RETRIES;
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

  async ensureActiveModelId(
    state: ReActState,
    config: ReActConfig,
    context: ExecutionContext
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
      }
    );
    state.retryState = {
      ...(state.retryState || {}),
      activeModelId: routingDecision.modelId,
      attemptedModelIds: routingDecision.attemptedModelIds,
      routingReason: routingDecision.reason,
    };
    config.modelId = routingDecision.modelId;
    this.logger.debug(
      `Model routing initialized: ${routingDecision.reason} -> ${routingDecision.modelId}`
    );
  }

  async switchToFallbackModel(
    state: ReActState,
    config: ReActConfig,
    context: ExecutionContext
  ): Promise<boolean> {
    const activeModelId = state.retryState?.activeModelId || config.modelId;
    const routingDecision = this.modelRouterService.resolveFallbackModel(
      activeModelId,
      state.retryState?.attemptedModelIds || [],
      state.lastToolResult
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
    this.logger.warn(
      `${this.tracePrefix(context)}Model fallback selected: ${routingDecision.reason} -> ${routingDecision.modelId}`
    );

    return true;
  }

  /**
   * 执行ReAct循环（流式输出）
   */
}
