import { Injectable, Logger } from '@nestjs/common';
import { ControlPlaneClient } from '../../client/control-plane.client';
import {
  CONTROL_PLANE_APPROVAL_STATUS,
  CONTROL_PLANE_EXECUTION_STATUS,
} from '../../client/control-plane.contracts';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import { PlanDraftDTO } from '../../interfaces';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';
import { PlannerService } from '../planner/planner.service';
import type {
  ExecutionContext,
  LLMUsage,
  StreamEvent,
} from '../react-engine/interfaces';
import { StreamEventType } from '../react-engine/interfaces';
import { ReActEngineService } from '../react-engine/react-engine.service';
import type { ChatRequestDTO } from './chat.dto';
import { ChatExecutionStreamService } from './chat-execution-stream.service';
import type { ChatUserContext, WaitingInputSemantic } from './chat.types';
import { ChatWaitingInputService } from './chat-waiting-input.service';

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);

  constructor(
    private readonly controlPlaneClient: ControlPlaneClient,
    private readonly reactEngineService: ReActEngineService,
    private readonly plannerService: PlannerService,
    private readonly promptDebugSettingsService: PromptDebugSettingsService,
    private readonly waitingInputService: ChatWaitingInputService,
    private readonly executionStreamService: ChatExecutionStreamService,
  ) {}

  async buildTaskModeContext(
    body: ChatRequestDTO,
    authorization: string | undefined,
    traceId: string,
    history: ExecutionContext['history'],
  ): Promise<{ context?: ExecutionContext; authError?: StreamEvent }> {
    const resolvedUser = await this.resolveAuthenticatedUser(authorization);

    if (!resolvedUser.userId) {
      this.logger.warn(`Rejecting anonymous task-mode request for session ${body.sessionId || 'default'}`);
      return {
        authError: this.buildTaskModeAuthRequiredEvent(),
      };
    }

    return {
      context: {
        sessionId: body.sessionId || 'default',
        userId: resolvedUser.userId,
        userRoles: resolvedUser.userRoles?.length ? resolvedUser.userRoles : body.userRoles,
        authToken: authorization,
        traceId,
        history,
        uploadedFiles: body.files || [],
      },
    };
  }

  async *handleTaskMode(
    body: ChatRequestDTO,
    context: ExecutionContext,
    authToken?: string,
  ): AsyncGenerator<StreamEvent> {
    const traceId = context.traceId;
    const executionId = body.executionId || context.executionId;
    const user = {
      userId: context.userId,
      userRoles: context.userRoles,
    };

    if (executionId) {
      try {
        const execution = await this.controlPlaneClient.getExecution<{
          skillId?: string;
          status: string;
          semantic?: WaitingInputSemantic;
          normalizedInput?: {
            objective?: string;
            semantic?: WaitingInputSemantic;
          };
        }>(
          executionId,
          this.waitingInputService.buildControlPlaneRequestOptions(authToken, user),
        );

        if (execution.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT && body.message) {
          yield {
            type: StreamEventType.THOUGHT,
            content: '正在提交您补充的信息...',
          };

          const waitingInputDetails = await this.waitingInputService.loadWaitingInputDetails(
            executionId,
            authToken,
            user,
          );
          if (waitingInputDetails.waitingStepId) {
            try {
              const waitingInputPayload = await this.waitingInputService.buildWaitingInputPayload(
                body.message,
                waitingInputDetails.missingInputs,
                waitingInputDetails.allRequiredInputs,
                this.waitingInputService.extractExecutionSemantic(execution),
                execution.skillId,
                authToken,
                typeof execution.normalizedInput?.objective === 'string'
                  ? execution.normalizedInput.objective
                  : undefined,
                context.userId,
                body.modelId,
              );

              await this.controlPlaneClient.submitExecutionInput(
                executionId,
                {
                  stepId: waitingInputDetails.waitingStepId,
                  input: waitingInputPayload.input,
                  usage: waitingInputPayload.usage,
                },
                this.waitingInputService.buildControlPlaneRequestOptions(authToken, user),
              );

              const latestStateEvent = await this.executionStreamService.buildLatestExecutionStateEvent(
                executionId,
                authToken,
                user,
              );

              if (latestStateEvent?.type === StreamEventType.WAITING_INPUT) {
                const waitingPayload =
                  latestStateEvent.data
                  && typeof latestStateEvent.data === 'object'
                  && !Array.isArray(latestStateEvent.data)
                    ? latestStateEvent.data as {
                        missingInputs?: Array<{
                          name: string;
                          group_label?: string;
                          display_name?: string;
                          needs_confirmation?: boolean;
                        }>;
                        semantic?: WaitingInputSemantic;
                      }
                    : {};
                const remainingMissingInputs = Array.isArray(waitingPayload.missingInputs)
                  ? waitingPayload.missingInputs
                  : [];
                const semantic = waitingPayload.semantic;

                yield {
                  type: StreamEventType.THOUGHT,
                  content: this.waitingInputService.buildWaitingInputSubmissionFeedback({
                    executionId,
                    resolvedFieldNames: Object.keys(waitingInputPayload.input || {}),
                    remainingMissingInputs,
                    semantic,
                  }),
                };

                yield latestStateEvent;
                return;
              }

              yield {
                type: StreamEventType.THOUGHT,
                content: '信息已提交，任务继续执行。',
              };

              for await (const event of this.executionStreamService.observeExecution(executionId, authToken, user)) {
                yield event;
              }
              return;
            } catch (err: any) {
              yield {
                type: StreamEventType.ERROR,
                content: `提交信息失败: ${err.response?.data?.message || err.message}`,
              };
              return;
            }
          }
        }

        if (
          execution.status === CONTROL_PLANE_EXECUTION_STATUS.QUEUED
          || execution.status === CONTROL_PLANE_EXECUTION_STATUS.RUNNING
          || execution.status === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL
          || execution.status === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT
        ) {
          yield {
            type: StreamEventType.THOUGHT,
            content: `任务正在执行中 (状态: ${execution.status})，正在为您实时观察进度...`,
          };

          for await (const event of this.executionStreamService.observeExecution(executionId, authToken, user)) {
            yield event;
          }
          return;
        }
      } catch (error: any) {
        const isAuthError = error.response?.status === 401 || error.response?.status === 403;
        const isNotFoundError = error.response?.status === 404;

        if (isAuthError) {
          this.logger.error(`Authentication failed for execution ${executionId}: ${error.message}`);
          yield {
            type: StreamEventType.ERROR,
            content: '您的登录会话已过期或无效，请重新登录后再试。',
          };
          return;
        }

        if (!isNotFoundError) {
          this.logger.error(`Failed to fetch execution ${executionId}: ${error.message}`);
          yield {
            type: StreamEventType.ERROR,
            content: `无法恢复执行进度: ${error.response?.data?.message || error.message}`,
          };
          return;
        }

        this.logger.warn(`Execution ${executionId} not found, falling back to new plan.`);
      }
    }

    yield {
      type: StreamEventType.THOUGHT,
      content: '正在规划任务...',
    };

    const plannerInput = {
      request: {
        user_input: body.message,
        user_id: context.userId,
        modelId: body.modelId,
        context: {
          sessionId: body.sessionId,
          uploadedFiles: body.files,
          history: context.history,
        },
      },
      userId: context.userId,
      authToken,
      traceId,
    };
    const matchPhase = await this.plannerService.matchSkillPhase(plannerInput);

    if (matchPhase.matchedSkill) {
      yield {
        type: StreamEventType.THOUGHT,
        content: `已识别到技能: ${matchPhase.matchedSkill.skillName}，正在识别参数...`,
      };
    }

    const planDraft = await this.plannerService.completePlanFromMatchPhase({
      ...plannerInput,
      matchPhase,
    });

    if (planDraft && planDraft.planner_mode === 'skill' && planDraft.skill_match) {
      const plannerPromptDebug = this.canExposePromptDebug(context)
        ? this.buildPlannerPromptDebug(body.message, planDraft)
        : undefined;
      const executionPromptDebug = this.buildExecutionPromptDebug(plannerPromptDebug);
      const executionPlanDraft = this.buildExecutionPlanDraft(planDraft);
      const missingInputs = planDraft.required_inputs.filter((input) => input.missing);

      if (missingInputs.length > 0) {
        const waitingInputSemantic = planDraft.semantic;
        yield {
          type: StreamEventType.THOUGHT,
          content: `已识别到技能: ${planDraft.skill_match.skill_name}，正在创建可恢复的执行单...`,
        };

        try {
          const execution = await this.controlPlaneClient.createExecution<{
            id: string;
            status?: string;
            approvalStatus?: string;
            usage?: Record<string, unknown>;
            semantic?: WaitingInputSemantic;
            normalizedInput?: Record<string, unknown>;
          }>(
            {
              skillId: planDraft.skill_match.skill_id,
              ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
              input: {
                prompt: body.message,
                ...(executionPromptDebug ? { __promptDebug: executionPromptDebug } : {}),
                ...Object.fromEntries(
                  planDraft.required_inputs
                    .filter((input) => !input.missing)
                    .map((input) => [input.name, input.value]),
                ),
              },
              usage: planDraft.usage,
              planDraft: executionPlanDraft,
            },
            this.waitingInputService.buildControlPlaneRequestOptions(authToken, user),
          );
          const executionStatus = execution.status || CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT;

          if (executionStatus === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
            yield {
              type: StreamEventType.RESULT,
              content: this.waitingInputService.formatWaitingInputMessage({
                executionId: execution.id,
                intro: '已创建等待补充信息的执行单。',
                missingInputs,
                semantic: this.waitingInputService.extractExecutionSemantic(execution) || waitingInputSemantic,
              }),
              data: {
                executionId: execution.id,
                status: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
                hasBusinessResult: false,
                missingInputs,
                semantic: this.waitingInputService.extractExecutionSemantic(execution) || waitingInputSemantic,
                plan: planDraft,
                usage: execution.usage || planDraft.usage,
                ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
              },
            };
            return;
          }

          if (executionStatus === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL) {
            const approvalIntro = missingInputs.length > 0
              ? `任务已创建，已应用部分默认参数，但仍需审批。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${execution.id}`
              : `任务已创建，等待审批。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${execution.id}`;
            yield {
              type: StreamEventType.RESULT,
              content: approvalIntro,
              data: {
                executionId: execution.id,
                status: CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL,
                approvalStatus: execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING,
                hasBusinessResult: false,
                plan: planDraft,
                usage: execution.usage || planDraft.usage,
                ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
              },
            };
          } else {
            const startSummary = missingInputs.length > 0
              ? '已应用默认参数补齐可兜底项，并开始执行。'
              : planDraft.summary;
            yield {
              type: StreamEventType.RESULT,
              content: `任务已启动。执行单 ID: ${execution.id}\n\n${startSummary}`,
              data: {
                executionId: execution.id,
                status: executionStatus,
                hasBusinessResult: false,
                plan: planDraft,
                usage: execution.usage || planDraft.usage,
                ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
              },
            };
          }

          for await (const event of this.executionStreamService.observeExecution(execution.id, authToken, user)) {
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
          content: this.waitingInputService.formatWaitingInputMessage({
            intro: `已识别到技能 ${planDraft.skill_match.skill_name}，但还缺少必要信息。`,
            missingInputs,
            semantic: waitingInputSemantic,
          }),
          data: {
            status: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
            hasBusinessResult: false,
            missingInputs,
            semantic: waitingInputSemantic,
            plan: planDraft,
            ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
          },
        };
        return;
      }

      yield {
        type: StreamEventType.THOUGHT,
        content: `已匹配到技能: ${planDraft.skill_match.skill_name}，正在创建执行单...`,
      };

      try {
        const execution = await this.controlPlaneClient.createExecution<{ id: string }>(
          {
            skillId: planDraft.skill_match.skill_id,
            ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
            input: {
              prompt: body.message,
              ...(executionPromptDebug ? { __promptDebug: executionPromptDebug } : {}),
              ...Object.fromEntries(
                planDraft.required_inputs
                  .filter((input) => !input.missing)
                  .map((input) => [input.name, input.value]),
              ),
            },
            usage: planDraft.usage,
            planDraft: executionPlanDraft,
          },
          this.waitingInputService.buildControlPlaneRequestOptions(authToken, user),
        );

        yield {
          type: StreamEventType.RESULT,
          content: `任务已启动。执行单 ID: ${execution.id}\n\n${planDraft.summary}`,
          data: {
            executionId: execution.id,
            status: CONTROL_PLANE_EXECUTION_STATUS.QUEUED,
            hasBusinessResult: false,
            plan: planDraft,
            usage: planDraft.usage,
            ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
          },
        };

        for await (const event of this.executionStreamService.observeExecution(execution.id, authToken, user)) {
          yield event;
        }
        return;
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message;
        yield {
          type: StreamEventType.ERROR,
          content: `创建执行单失败: ${errorMsg}`,
        };
        yield {
          type: StreamEventType.THOUGHT,
          content: '创建执行单失败，尝试使用 ReAct 引擎直接处理...',
        };
      }
    }

    for await (const event of this.reactEngineService.execute({ ...body, traceId }, context)) {
      yield event;
    }
  }

  private canExposePromptDebug(context: ExecutionContext): boolean {
    return this.promptDebugSettingsService.isPromptDebugEnabled()
      && Boolean(context.userRoles?.includes('admin'));
  }

  private buildPlannerPromptDebug(
    message: string,
    planDraft: PlanDraftDTO,
  ): Record<string, unknown> {
    const metadata = (planDraft.metadata && typeof planDraft.metadata === 'object')
      ? planDraft.metadata as Record<string, unknown>
      : undefined;
    const debug = (metadata?.debug && typeof metadata.debug === 'object' && !Array.isArray(metadata.debug))
      ? metadata.debug as Record<string, unknown>
      : undefined;
    const llmCalls = Array.isArray(debug?.llmCalls)
      ? debug.llmCalls.filter((item) => item && typeof item === 'object')
      : [];
    const latestLlmCall = llmCalls.length > 0
      ? llmCalls[llmCalls.length - 1] as Record<string, unknown>
      : undefined;
    const notes = Array.isArray(debug?.notes)
      ? debug.notes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    const systemLines = [
      'Planner Debug Snapshot',
      `planner_mode: ${planDraft.planner_mode}`,
      `summary: ${planDraft.summary}`,
      `objective: ${planDraft.objective}`,
      `matched_skill: ${planDraft.skill_match?.skill_name || 'none'}`,
      `required_inputs: ${planDraft.required_inputs.map((item) => `${item.name}:${item.missing ? 'missing' : 'ready'}`).join(', ') || 'none'}`,
      `steps: ${planDraft.steps.map((step) => `${step.kind}:${step.title}`).join(' | ') || 'none'}`,
    ];

    return {
      debugSource: 'planner',
      systemPrompt: systemLines.join('\n'),
      userPrompt: message,
      systemPromptSectionKeys: ['planner_mode', 'planner_summary', 'planner_objective', 'planner_steps'],
      userPromptSectionKeys: ['user_message'],
      modelId: typeof latestLlmCall?.modelId === 'string' ? latestLlmCall.modelId : undefined,
      llmRequestMessages: Array.isArray(latestLlmCall?.requestMessages)
        ? latestLlmCall.requestMessages
        : undefined,
      llmResponseText: typeof latestLlmCall?.responseText === 'string'
        ? latestLlmCall.responseText
        : undefined,
      llmCalls,
      notes,
    };
  }

  private buildExecutionPlanDraft(planDraft: PlanDraftDTO): Record<string, unknown> {
    return {
      plan_id: planDraft.plan_id,
      planner_mode: planDraft.planner_mode,
      objective: planDraft.objective,
      summary: planDraft.summary,
      skill_match: planDraft.skill_match,
      steps: planDraft.steps,
      required_inputs: planDraft.required_inputs,
      risk_summary: planDraft.risk_summary,
      semantic: planDraft.semantic,
      usage: planDraft.usage,
    };
  }

  private buildExecutionPromptDebug(promptDebug?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!promptDebug) {
      return undefined;
    }

    return {
      debugSource: promptDebug.debugSource,
      systemPrompt: promptDebug.systemPrompt,
      userPrompt: promptDebug.userPrompt,
      systemPromptSectionKeys: promptDebug.systemPromptSectionKeys,
      userPromptSectionKeys: promptDebug.userPromptSectionKeys,
      modelId: promptDebug.modelId,
      notes: promptDebug.notes,
    };
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

  private buildTaskModeAuthRequiredEvent(): StreamEvent {
    return {
      type: StreamEventType.ERROR,
      content: '任务模式需要登录后使用，请重新登录后重试。',
      data: {
        errorCode: 'AUTH_LOGIN_REQUIRED',
        statusCode: 401,
      },
    };
  }
}
