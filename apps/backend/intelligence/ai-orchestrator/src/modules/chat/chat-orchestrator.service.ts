import { Injectable, Logger, Optional } from '@nestjs/common';
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
import {
  NO_MATCHING_SKILL_MESSAGE,
  formatNoMatchingSkillMessage,
} from '../planner/skill/skill-match-policy';
import type { WaitingInputSemantic } from './chat.types';
import { ChatWaitingInputService } from './chat-waiting-input.service';
import { PlanningDecisionShadowService } from './planning-decision-shadow.service';
import { TaskFallbackPolicyService } from './task-fallback-policy.service';
import { ChatTaskResumeService } from './chat-task-resume.service';
import { ChatPlanningPresentationService } from './chat-planning-presentation.service';
import { ScopedPlannerMemoryService } from './scoped-planner-memory.service';
import { formatFriendlyExecutionError } from './chat-error-formatter';
import { ModelService } from '../model/model.service';
import { ChatMediaService } from './chat-media.service';

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
    private readonly scopedPlannerMemoryService?: ScopedPlannerMemoryService,
    @Optional() private readonly modelService?: ModelService,
    @Optional() private readonly chatMediaService?: ChatMediaService
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
    history: ExecutionContext['history'],
    trustedIdentity?: { userId: string; userRoles?: string[]; organizationId?: string }
  ): Promise<{ context?: ExecutionContext; authError?: StreamEvent }> {
    const resolvedUser = trustedIdentity || (await this.resolveAuthenticatedUser(authorization));

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
          const friendlyMessage = formatFriendlyExecutionError(
            savedWorkflowResult.errorMessage,
            {
              skillName: savedWorkflowResult.workflow?.name,
              phase: 'saved_workflow',
            }
          );
          yield {
            type: StreamEventType.ERROR,
            content: `已匹配保存的工作流，但创建执行失败 [${savedWorkflowResult.errorCode || 'SAVED_WORKFLOW_EXECUTION_FAILED'}]: ${friendlyMessage}`,
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

    const planningRequest = this.planningPresentation.buildPlanningRequest(
      body.message,
      body.files
    );

    const isExplicitWebSearch =
      Boolean(
        body.config?.webSearch === true ||
        body.config?.web_search_enabled === true ||
        (context as any)?.webSearch === true ||
        (context as any)?.web_search_enabled === true ||
        /(?:^|[^a-zA-Z0-9])(?:请?帮我)?(?:搜索|联网搜索|全网搜索|检索|搜一下|查一下|查找|查询|搜搜|查查)/i.test(planningRequest)
      ) && !/邮件|email|收件箱/i.test(planningRequest);

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
          web_search_enabled: isExplicitWebSearch,
          webSearch: isExplicitWebSearch,
        },
      },
      userId: context.userId,
      authToken,
      traceId,
    };
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
        (await this.skillCacheService?.loadAvailableSkills(
          authToken,
          traceId,
          undefined,
          isExplicitWebSearch
        )) || [];
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
            ...(hasPreviousResult
              ? {
                  taskContext: {
                    schemaVersion: 'task-context/v1',
                    references: [
                      {
                        kind: 'session_result',
                        selector: 'latest_compatible',
                        executionId: latestResult?.executionId,
                        semanticType: latestResult?.resultType || 'content.unknown',
                        schemaVersion: 'execution-result/v1',
                        trustLevel: 'verified_execution',
                        structuredData: latestResult?.structuredData,
                        detailText: latestResult?.summaryText,
                      },
                    ],
                  },
                }
              : {}),
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

        yield* this.executionStreamService.observeExecution(result.executionId, authToken, user, {
          modelId: resolvedModelId,
        });
        return;
      } else {
        if (result.errorCode === 'CAPABILITY_NOT_FOUND') {
          yield {
            type: StreamEventType.RESULT,
            content: formatNoMatchingSkillMessage(body.message),
            data: {
              code: 'CAPABILITY_NOT_FOUND',
              status: 'not_started',
              executed: false,
            },
          };
          return;
        }
        const friendlyMessage = formatFriendlyExecutionError(result.errorMessage, {
          phase: 'planning',
        });
        yield {
          type: StreamEventType.ERROR,
          content: `任务规划/创建失败 [${result.errorCode || 'UNKNOWN_ERROR'}]: ${friendlyMessage}`,
          data: {
            code: result.errorCode || 'UNKNOWN_ERROR',
            errorMessage: friendlyMessage,
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

      if (this.modelService && !this.isExternalSystemMutationRequest(body.message)) {
        await this.planningDecisionShadowService?.record(body.message, {
          authToken,
          user,
          routeClass: 'native_task',
          routeSource: 'native_llm',
          confidence: 1,
          reasonCodes: ['llm_native_execution'],
        });

        yield* this.executeLlmNativeTask(body, context, resolvedModelId);
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
        content: formatNoMatchingSkillMessage(body.message),
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
        request: {
          ...plannerInput.request,
          context: {
            ...plannerInput.request.context,
            ...(hasPreviousResult
              ? {
                  mode: 'single_step_continuation',
                  previous_result: {
                    executionId: latestResult?.executionId,
                    resultType: latestResult?.resultType,
                    resultTitle: latestResult?.resultTitle,
                    structuredData: latestResult?.structuredData,
                    detailText: latestResult?.summaryText,
                  },
                }
              : {}),
          },
        },
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
              skillVersion: planDraft.skill_match.skill_version,
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
          const friendlyMessage = formatFriendlyExecutionError(error, {
            skillName: planDraft.skill_match?.skill_name,
            phase: 'waiting_input',
          });
          yield {
            type: StreamEventType.ERROR,
            content: friendlyMessage,
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
            skillVersion: planDraft.skill_match.skill_version,
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
        const friendlyMessage = formatFriendlyExecutionError(error, {
          skillName: planDraft.skill_match?.skill_name,
          phase: 'execution',
        });
        yield {
          type: StreamEventType.ERROR,
          content: friendlyMessage,
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

  private isExternalSystemMutationRequest(text: string): boolean {
    const normalized = text.trim();
    return (
      /(?:调用|请求|触发|执行).*(?:接口|api|webhook|脚本|系统)/i.test(normalized) ||
      /(?:发送|推送|发一条).*(?:到|至|给).*(?:钉钉|飞书|企业微信|slack|邮件|邮箱|sms|短信)/i.test(normalized) ||
      /(?:修改|更新|删除|插入|写入|清空|drop|delete|insert|update).*(?:在|从|于)?.*(?:数据库|数据表|表结构|集群|服务器|k8s|pod)/i.test(normalized) ||
      /(?:在|从|于)?.*(?:数据库|数据表|表结构|集群|服务器|k8s|pod).*(?:修改|更新|删除|插入|写入|清空|drop|delete|insert|update)/i.test(normalized) ||
      /(?:重启|停止|启动|关闭|销毁).*(?:服务器|容器|pod|集群|实例|虚拟机)/i.test(normalized) ||
      /(?:服务器|容器|pod|集群|实例|虚拟机).*(?:重启|停止|启动|关闭|销毁)/i.test(normalized)
    );
  }

  private async *executeLlmNativeTask(
    body: ChatRequestDTO,
    context: ExecutionContext,
    resolvedModelId?: string
  ): AsyncGenerator<StreamEvent> {
    yield {
      type: StreamEventType.THOUGHT,
      content: '任务属于原生模型能力范畴（无需调用外部工具），在工作模式受控环境中执行...',
    };

    if (!this.modelService) {
      yield {
        type: StreamEventType.ERROR,
        content: '模型服务不可用，无法执行原生任务。',
      };
      return;
    }

    const modelId =
      resolvedModelId ||
      this.chatConversationService.resolvePreferredChatModelId(body);
    const thinkingEnabled = this.chatConversationService.isThinkingEnabled(body);
    const reasoningConfig = await this.chatConversationService.resolveReasoningConfig(
      body,
      modelId
    );

    const messageContent = this.chatMediaService
      ? await this.chatMediaService.buildMessageContent(body.message, body.files)
      : body.message;

    const systemPrompt =
      '你是一个专业的高级AI助手。当前运行在工作模式（受控生产模式）。针对无需调用外部工具的任务，请直接给出严谨、准确、结构清晰且高质量的完整回答或成果。';

    const messages = await this.chatConversationService.buildConversationMessages(
      body.sessionId || context.sessionId || 'default',
      systemPrompt,
      messageContent,
      context.userId
    );

    let fullContent = '';
    let responseUsage: any = undefined;
    const queue: StreamEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let isDone = false;
    let streamError: unknown = null;

    const pushEvent = (evt: StreamEvent) => {
      queue.push(evt);
      if (resolveNext) {
        const fn = resolveNext;
        resolveNext = null;
        fn();
      }
    };

    this.modelService
      .callModelStreamWithMessages(
        modelId,
        messages,
        (chunk: string) => {
          fullContent += chunk;
          pushEvent({
            type: StreamEventType.OBSERVATION,
            content: this.chatConversationService.getVisibleChatContent(fullContent, thinkingEnabled),
            data: {
              mode: 'task',
              thinking: thinkingEnabled,
              reasoning: reasoningConfig.enabled === true,
            },
          });
        },
        { reasoning: reasoningConfig }
      )
      .then((resp) => {
        responseUsage = resp?.usage;
        isDone = true;
        if (resolveNext) {
          const fn = resolveNext;
          resolveNext = null;
          fn();
        }
      })
      .catch((err) => {
        streamError = err;
        isDone = true;
        if (resolveNext) {
          const fn = resolveNext;
          resolveNext = null;
          fn();
        }
      });

    while (!isDone || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          resolveNext = r;
        });
      }
      while (queue.length > 0) {
        yield queue.shift()!;
      }
    }

    if (streamError) {
      const errMsg = streamError instanceof Error ? streamError.message : String(streamError);
      yield {
        type: StreamEventType.ERROR,
        content: `执行原生模型任务失败: ${errMsg}`,
      };
      return;
    }

    const visibleContent = this.chatConversationService.getVisibleChatContent(
      fullContent || '处理完成',
      thinkingEnabled
    );

    yield {
      type: StreamEventType.RESULT,
      content: visibleContent,
      data: {
        code: 'NATIVE_TASK_COMPLETED',
        status: 'completed',
        executed: true,
        hasBusinessResult: true,
        executionMode: 'native_llm',
        usage: responseUsage,
      },
    };
  }
}
