import { Injectable, Logger } from '@nestjs/common';
import { ControlPlaneClient } from '../../client/control-plane.client';
import {
  CONTROL_PLANE_APPROVAL_STATUS,
  CONTROL_PLANE_EXECUTION_STATUS,
} from '../../client/control-plane.contracts';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import { PlanDraftDTO } from '../../interfaces';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';
import { PlannerService } from '../planner';
import type { ExecutionContext, StreamEvent } from '../react-engine/interfaces';
import { StreamEventType } from '../react-engine/interfaces';
import { ReActEngineService } from '../react-engine/react-engine.service';
import type { ChatRequestDTO } from './chat.dto';
import { ChatExecutionStreamService } from './chat-execution-stream.service';
import { DeterministicTaskExecutionService } from './deterministic-task-execution.service';
import { ChatConversationService } from './chat-conversation.service';
import { SkillCacheService } from '../planner/skill/skill-cache.service';
import { NO_MATCHING_SKILL_MESSAGE } from '../planner/skill/skill-match-policy';
import type { WaitingInputSemantic } from './chat.types';
import { ChatWaitingInputService } from './chat-waiting-input.service';
import { PlanningDecisionShadowService } from './planning-decision-shadow.service';
import { TaskFallbackPolicyService } from './task-fallback-policy.service';
import { ChatTaskResumeService } from './chat-task-resume.service';
import { ChatPlanningPresentationService } from './chat-planning-presentation.service';
import { ScopedPlannerMemoryService } from './scoped-planner-memory.service';

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);
  private readonly taskResumeService: ChatTaskResumeService;
  private readonly planningPresentation: ChatPlanningPresentationService;

  constructor(
    private readonly controlPlaneClient: ControlPlaneClient,
    private readonly reactEngineService: ReActEngineService,
    private readonly plannerService: PlannerService,
    private readonly promptDebugSettingsService: PromptDebugSettingsService,
    private readonly waitingInputService: ChatWaitingInputService,
    private readonly executionStreamService: ChatExecutionStreamService,
    private readonly chatConversationService: ChatConversationService,
    private readonly deterministicTaskExecutionService?: DeterministicTaskExecutionService,
    private readonly skillCacheService?: SkillCacheService,
    private readonly planningDecisionShadowService?: PlanningDecisionShadowService,
    private readonly taskFallbackPolicyService?: TaskFallbackPolicyService,
    taskResumeService?: ChatTaskResumeService,
    planningPresentation?: ChatPlanningPresentationService,
    private readonly scopedPlannerMemoryService?: ScopedPlannerMemoryService
  ) {
    this.taskResumeService =
      taskResumeService ||
      new ChatTaskResumeService(controlPlaneClient, waitingInputService, executionStreamService);
    this.planningPresentation =
      planningPresentation || new ChatPlanningPresentationService(promptDebugSettingsService);
  }

  async buildTaskModeContext(
    body: ChatRequestDTO,
    authorization: string | undefined,
    traceId: string,
    history: ExecutionContext['history']
  ): Promise<{ context?: ExecutionContext; authError?: StreamEvent }> {
    const resolvedUser = await this.resolveAuthenticatedUser(authorization);

    if (!resolvedUser.userId) {
      this.logger.warn(
        `Rejecting anonymous task-mode request for session ${body.sessionId || 'default'}`
      );
      return {
        authError: this.buildTaskModeAuthRequiredEvent(),
      };
    }

    return {
      context: {
        sessionId: body.sessionId || 'default',
        userId: resolvedUser.userId,
        userRoles: resolvedUser.userRoles?.length ? resolvedUser.userRoles : body.userRoles,
        organizationId: resolvedUser.organizationId,
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
    authToken?: string
  ): AsyncGenerator<StreamEvent> {
    const traceId = context.traceId;
    const executionId = body.executionId || context.executionId;
    const user = {
      userId: context.userId,
      userRoles: context.userRoles,
      organizationId: context.organizationId,
    };
    const resolvedModelId =
      (body.modelId && body.modelId !== 'default' ? body.modelId : undefined) ||
      (body.config as any)?.modelId ||
      (body.config as any)?.model;

    const resume = await this.taskResumeService.prepare({
      executionId,
      message: body.message,
      modelId: resolvedModelId,
      authToken,
      user,
    });
    if (resume.handled) {
      yield* resume.events;
      return;
    }

    if (!executionId && this.deterministicTaskExecutionService) {
      const savedWorkflowResult =
        await this.deterministicTaskExecutionService.executeMatchedSavedWorkflow(body.message, {
          authToken,
          user,
        });
      if (savedWorkflowResult.matched) {
        if (!savedWorkflowResult.success || !savedWorkflowResult.executionId) {
          yield {
            type: StreamEventType.ERROR,
            content: `已匹配保存的工作流，但创建执行失败 [${savedWorkflowResult.errorCode || 'SAVED_WORKFLOW_EXECUTION_FAILED'}]: ${savedWorkflowResult.errorMessage || '无法创建执行单'}`,
          };
          return;
        }

        await this.planningDecisionShadowService?.record(body.message, {
          authToken,
          user,
          executionId: savedWorkflowResult.executionId,
          routeClass: 'replay_workflow',
          routeSource: 'saved_workflow',
          confidence: savedWorkflowResult.score ?? 1,
          reasonCodes: [`saved_workflow:${savedWorkflowResult.matchMethod || 'unknown'}`],
          candidateIds: savedWorkflowResult.workflow?.id ? [savedWorkflowResult.workflow.id] : [],
          selectedCapabilityIds: savedWorkflowResult.workflow?.id
            ? [savedWorkflowResult.workflow.id]
            : [],
        });

        yield {
          type: StreamEventType.THOUGHT,
          content: `已匹配你的固定工作流“${savedWorkflowResult.workflow?.name || '已保存工作流'}”，直接按已审查的冻结步骤执行，不再重新规划。执行单 ID: \`${savedWorkflowResult.executionId}\`。`,
          data: {
            executionId: savedWorkflowResult.executionId,
            routeSource: 'saved_workflow',
            savedWorkflowId: savedWorkflowResult.workflow?.id,
            savedWorkflowVersion: savedWorkflowResult.workflow?.version,
            matchScore: savedWorkflowResult.score,
            matchMethod: savedWorkflowResult.matchMethod,
            candidateCount: savedWorkflowResult.candidateCount,
            plannerInvoked: false,
          },
        };
        yield* this.executionStreamService.observeExecution(
          savedWorkflowResult.executionId,
          authToken,
          user,
          { modelId: resolvedModelId }
        );
        return;
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
        modelId: resolvedModelId,
        context: {
          sessionId: body.sessionId,
          uploadedFiles: body.files,
          system_collected: this.planningPresentation.buildUploadedFileParams(body.files),
          history: context.history,
        },
      },
      userId: context.userId,
      authToken,
      traceId,
    };

    const planningRequest = this.planningPresentation.buildPlanningRequest(
      body.message,
      body.files
    );
    const latestResult = await this.chatConversationService.getLatestCompletedTaskResult(
      body.sessionId || context.sessionId
    );
    const hasPreviousResult = Boolean(
      latestResult && (latestResult.structuredData !== undefined || latestResult.summaryText)
    );
    await this.planningDecisionShadowService?.recordLegacyRoute(
      body.message,
      { hasPreviousResult },
      { authToken, user }
    );
    let continuationMatchPhase: Awaited<ReturnType<PlannerService['matchSkillPhase']>> | undefined;
    let continuationPlanDraft: PlanDraftDTO | undefined;

    if (
      this.deterministicTaskExecutionService?.shouldAttemptSingleSkillContinuation(
        planningRequest,
        { hasPreviousResult }
      )
    ) {
      yield {
        type: StreamEventType.THOUGHT,
        content: '正在检查是否可将上一任务结果直接交给单个 Skill 执行...',
      };
      const candidateMatchPhase = await this.plannerService.matchSkillPhase(plannerInput);
      if (candidateMatchPhase.matchedSkill) {
        const candidatePlanDraft = await this.plannerService.completePlanFromMatchPhase({
          ...plannerInput,
          request: {
            ...plannerInput.request,
            context: {
              ...plannerInput.request.context,
              mode: 'single_step_continuation',
              previous_result: {
                executionId: latestResult?.executionId,
                resultType: latestResult?.resultType,
                resultTitle: latestResult?.resultTitle,
                structuredData: latestResult?.structuredData,
                detailText: latestResult?.summaryText,
              },
            },
          },
          matchPhase: candidateMatchPhase,
        });
        const continuationMetadata = candidatePlanDraft.metadata?.previous_result_continuation as
          | { applied?: boolean; projectedFields?: unknown[] }
          | undefined;
        const hasMissingInputs = candidatePlanDraft.required_inputs.some((input) => input.missing);
        if (
          candidatePlanDraft.planner_mode === 'skill' &&
          continuationMetadata?.applied === true &&
          !hasMissingInputs
        ) {
          continuationMatchPhase = candidateMatchPhase;
          continuationPlanDraft = candidatePlanDraft;
          yield {
            type: StreamEventType.THOUGHT,
            content: `上一任务结果已按输入 Schema 绑定到 ${candidateMatchPhase.matchedSkill.skillName}，将直接执行单 Skill，不调用拓扑规划模型。`,
            data: {
              routeSource: 'single_skill_continuation',
              sourceExecutionId: latestResult?.executionId,
              projectedFields: continuationMetadata.projectedFields || [],
              plannerInvoked: false,
            },
          };
        }
      }
    }

    if (
      !continuationPlanDraft &&
      this.deterministicTaskExecutionService?.shouldRouteToDeterministicPlan(planningRequest, {
        hasPreviousResult,
      })
    ) {
      yield {
        type: StreamEventType.THOUGHT,
        content: '正在获取用户可用 Skill 列表并进行确定性多步骤任务拆分规划...',
      };

      const availableSkills =
        (await this.skillCacheService?.loadAvailableSkills(authToken, traceId)) || [];
      const scopedMemory = await this.scopedPlannerMemoryService?.resolveForPlanning({
        authToken,
        user,
      });

      const result = await this.deterministicTaskExecutionService.executeDeterministicTask(
        body.message,
        context.userId,
        {
          authToken,
          user,
          availableSkills,
          systemInputs: {
            ...this.planningPresentation.buildUploadedFileParams(body.files),
            ...(latestResult?.structuredData !== undefined
              ? { previousResultData: latestResult.structuredData }
              : {}),
            ...(latestResult?.summaryText
              ? {
                  previousResultText: latestResult.summaryText,
                  previousResultTitle: latestResult.resultTitle,
                }
              : {}),
            ...(hasPreviousResult
              ? {
                  previousResultRef: {
                    executionId: latestResult?.executionId,
                    resultType: latestResult?.resultType,
                  },
                }
              : {}),
          },
          ...(scopedMemory ? { plannerContext: { scopedMemory } } : {}),
          planningRequest,
          traceId,
          modelId: resolvedModelId,
        }
      );

      if (result.success && result.executionId) {
        const planningRoute = result.planDraft?.planningRoute;
        await this.planningDecisionShadowService?.record(body.message, {
          authToken,
          user,
          executionId: result.executionId,
          routeClass: planningRoute?.routeClass || 'generated_plan',
          routeSource: planningRoute?.routeSource || 'llm_topology',
          confidence: planningRoute?.confidence ?? 1,
          reasonCodes: planningRoute?.reasonCodes || ['deterministic_plan_frozen'],
          candidateIds: planningRoute?.candidateIds || [],
          selectedCapabilityIds: planningRoute?.selectedCapabilityIds || [],
        });
        const missingInputs = (result.planDraft?.requiredUserInputs || []).filter(
          (i: any) => i.missing
        );
        if (missingInputs.length > 0) {
          yield {
            type: StreamEventType.WAITING_INPUT,
            content: this.waitingInputService.formatWaitingInputMessage({
              executionId: result.executionId,
              intro: `已规划好任务计划，但还需要补充 ${missingInputs.length} 项必要参数：`,
              missingInputs,
            }),
            data: {
              executionId: result.executionId,
              status: 'waiting_input',
              hasBusinessResult: false,
              missingInputs,
              plan: result.planDraft,
              ...(this.planningPresentation.canExposePromptDebug(context) &&
              result.planDraft?.promptDebug
                ? { promptDebug: result.planDraft.promptDebug }
                : {}),
            },
          };
          return;
        }

        yield {
          type: StreamEventType.THOUGHT,
          content: `已成功冻结 ${result.planDraft?.nodes?.length || 0} 步骤执行计划 (ID: ${result.executionId})，控制面已按拓扑顺序调度运行。`,
        };

        const nodeTitles = this.planningPresentation.formatDeterministicPlanNodes(
          result.planDraft?.nodes || []
        );
        yield {
          type: StreamEventType.THOUGHT,
          content: `已为你生成静态任务计划：\n\n${nodeTitles}\n\n执行单 ID: \`${result.executionId}\`。正在跟踪流程执行状态...\n`,
          data: {
            executionId: result.executionId,
            status: 'running',
            deterministicPlan: {
              objective: result.planDraft?.objective,
              nodes: result.planDraft?.nodes || [],
              finalOutputs: result.planDraft?.finalOutputs || [],
            },
            ...(this.planningPresentation.canExposePromptDebug(context) &&
            result.planDraft?.promptDebug
              ? { promptDebug: result.planDraft.promptDebug }
              : {}),
          },
        };

        yield* this.executionStreamService.observeExecution(
          result.executionId,
          authToken,
          user,
          { modelId: resolvedModelId }
        );
        return;
      } else {
        if (result.errorCode === 'CAPABILITY_NOT_FOUND') {
          yield {
            type: StreamEventType.RESULT,
            content: NO_MATCHING_SKILL_MESSAGE,
            data: {
              code: 'CAPABILITY_NOT_FOUND',
              status: 'not_started',
              executed: false,
            },
          };
          return;
        }
        yield {
          type: StreamEventType.ERROR,
          content: `任务规划/创建失败 [${result.errorCode || 'UNKNOWN_ERROR'}]: ${result.errorMessage || '无法拆分该任务'}`,
          data: {
            code: result.errorCode || 'UNKNOWN_ERROR',
            errorMessage: result.errorMessage || '无法拆分该任务',
            status: 'failed',
          },
        };
        return;
      }
    }

    const matchPhase =
      continuationMatchPhase || (await this.plannerService.matchSkillPhase(plannerInput));

    if (!matchPhase.matchedSkill) {
      if (matchPhase.failure) {
        yield {
          type: StreamEventType.ERROR,
          content: matchPhase.failure.message,
          data: {
            code: matchPhase.failure.code,
            status: 'not_started',
            executed: false,
            retryable: matchPhase.failure.retryable,
          },
        };
        return;
      }
      await this.planningDecisionShadowService?.record(body.message, {
        authToken,
        user,
        routeClass: 'exploratory_agent',
        routeSource: 'exploratory',
        confidence: 0,
        reasonCodes: [
          matchPhase.hasVisibleSkills ? 'no_candidate_above_threshold' : 'no_visible_capability',
        ],
      });
      yield {
        type: StreamEventType.RESULT,
        content: NO_MATCHING_SKILL_MESSAGE,
        data: {
          code: 'CAPABILITY_NOT_FOUND',
          status: 'not_started',
          executed: false,
        },
      };
      return;
    }

    if (matchPhase.matchedSkill) {
      yield {
        type: StreamEventType.THOUGHT,
        content: `已识别到技能: ${matchPhase.matchedSkill.skillName}，正在识别参数...`,
      };
    }

    const planDraft =
      continuationPlanDraft ||
      (await this.plannerService.completePlanFromMatchPhase({
        ...plannerInput,
        matchPhase,
      }));

    if (planDraft && planDraft.planner_mode === 'skill' && planDraft.skill_match) {
      const plannerPromptDebug = this.planningPresentation.canExposePromptDebug(context)
        ? this.planningPresentation.buildPlannerPromptDebug(body.message, planDraft)
        : undefined;
      const executionPromptDebug =
        this.planningPresentation.buildExecutionPromptDebug(plannerPromptDebug);
      const executionPlanDraft = this.planningPresentation.buildExecutionPlanDraft(planDraft);
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
                    .map((input) => [input.name, input.value])
                ),
              },
              usage: planDraft.usage,
              planDraft: executionPlanDraft,
            },
            this.waitingInputService.buildControlPlaneRequestOptions(authToken, user)
          );
          const executionStatus = execution.status || CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT;
          await this.planningDecisionShadowService?.record(body.message, {
            authToken,
            user,
            executionId: execution.id,
            routeClass: 'single_capability',
            routeSource: 'deterministic_match',
            confidence: planDraft.skill_match.confidence ?? 1,
            reasonCodes: ['single_capability_match'],
            selectedCapabilityIds: [planDraft.skill_match.skill_id],
          });

          if (executionStatus === CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT) {
            yield {
              type: StreamEventType.RESULT,
              content: this.waitingInputService.formatWaitingInputMessage({
                executionId: execution.id,
                intro: '已创建等待补充信息的执行单。',
                missingInputs,
                semantic:
                  this.waitingInputService.extractExecutionSemantic(execution) ||
                  waitingInputSemantic,
              }),
              data: {
                executionId: execution.id,
                status: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
                hasBusinessResult: false,
                missingInputs,
                semantic:
                  this.waitingInputService.extractExecutionSemantic(execution) ||
                  waitingInputSemantic,
                plan: planDraft,
                usage: execution.usage || planDraft.usage,
                ...(plannerPromptDebug ? { promptDebug: plannerPromptDebug } : {}),
              },
            };
            return;
          }

          if (executionStatus === CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL) {
            const approvalIntro =
              missingInputs.length > 0
                ? `任务已创建，已应用部分默认参数，但仍需审批。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${execution.id}`
                : `任务已创建，等待审批。\n\n当前审批状态: ${execution.approvalStatus || CONTROL_PLANE_APPROVAL_STATUS.PENDING}\n执行单 ID: ${execution.id}`;
            yield {
              type: StreamEventType.PENDING_APPROVAL,
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
            const startSummary =
              missingInputs.length > 0
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

          for await (const event of this.executionStreamService.observeExecution(
            execution.id,
            authToken,
            user,
            { modelId: resolvedModelId }
          )) {
            yield event;
          }
          return;
        } catch (error: any) {
          const errorMsg = error.response?.data?.message || error.message;
          yield {
            type: StreamEventType.ERROR,
            content: `创建等待输入执行单失败: ${errorMsg}`,
          };
          return;
        }

        yield {
          type: StreamEventType.WAITING_INPUT,
          content: this.waitingInputService.formatWaitingInputMessage({
            intro: `已识别到技能 ${planDraft.skill_match?.skill_name || '已识别技能'}，但还缺少必要信息。`,
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
                  .map((input) => [input.name, input.value])
              ),
            },
            usage: planDraft.usage,
            planDraft: executionPlanDraft,
          },
          this.waitingInputService.buildControlPlaneRequestOptions(authToken, user)
        );

        await this.planningDecisionShadowService?.record(body.message, {
          authToken,
          user,
          executionId: execution.id,
          routeClass: 'single_capability',
          routeSource: 'deterministic_match',
          confidence: planDraft.skill_match.confidence ?? 1,
          reasonCodes: ['single_capability_match'],
          selectedCapabilityIds: [planDraft.skill_match.skill_id],
        });

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

        for await (const event of this.executionStreamService.observeExecution(
          execution.id,
          authToken,
          user,
          { modelId: resolvedModelId }
        )) {
          yield event;
        }
        return;
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message;
        yield {
          type: StreamEventType.ERROR,
          content: `创建执行单失败: ${errorMsg}`,
        };
        if (!this.taskFallbackPolicyService?.isImplicitReactFallbackEnabled()) {
          return;
        }
        yield {
          type: StreamEventType.THOUGHT,
          content: '已显式启用兼容回退，尝试使用 ReAct 引擎处理...',
        };
      }
    }

    if (!this.taskFallbackPolicyService?.isImplicitReactFallbackEnabled()) {
      yield {
        type: StreamEventType.RESULT,
        content:
          '当前请求无法形成可验证的生产执行计划；任务未执行。可切换到独立探索模式创建候选能力或工作流。',
        data: {
          code: 'EXPLORATORY_REQUIRED',
          status: 'not_started',
          executed: false,
        },
      };
      return;
    }

    for await (const event of this.reactEngineService.execute({ ...body, traceId }, context)) {
      yield event;
    }
  }

  public async resolveAuthenticatedUser(
    authorization?: string
  ): Promise<{ userId?: string; userRoles?: string[]; organizationId?: string }> {
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

      const payload = (await response.json()) as {
        user?: { id?: string; role?: string };
        roles?: Array<{ name?: string }>;
        activeOrgId?: string | null;
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
        ...(typeof payload.activeOrgId === 'string' ? { organizationId: payload.activeOrgId } : {}),
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
