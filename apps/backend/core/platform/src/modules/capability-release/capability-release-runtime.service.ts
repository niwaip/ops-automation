import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import {
  getBrowserWorkerUrl,
  getCarboneExternalUrl,
  getCarboneServiceUrl,
  getControlPlaneApiUrl,
  getTemporalUiUrl,
} from '../../config/service-endpoints';
import { ActivityService } from '../temporal-workflow/temporal-activity.service';
import { SkillService } from '../skill/skill.service';
import { ToolCatalogService } from '../skill/tool-catalog.service';
import { ToolPromptExposure } from '../skill/interfaces';
import { CapabilityReleaseBrowserRecordingService } from './capability-release-browser-recording.service';
import { CapabilityReleaseSkillDraftService } from './capability-release-skill-draft.service';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  DeploymentRecordDTO,
  ExecuteCapabilityRuntimeDTO,
  ExecuteCapabilityRuntimeResultDTO,
} from './interfaces';

type SkillRuntimeToolPolicy = {
  name: string;
  promptExposure: ToolPromptExposure;
  defaultRequiresConfirmation: boolean;
  defaultRequiresApproval: boolean;
  status: string;
};

type RenderResolvedRequest = {
  publishedSkillId?: string;
  templateId?: string;
  skillId?: string;
  data: Record<string, unknown>;
  outputFormat?: string;
  outputName?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  prepareLocalizedRenderData?: boolean;
};

type GenerateRenderDataResponse = {
  success?: boolean;
  error?: string;
  renderResolvedRequest?: RenderResolvedRequest;
};

export interface CapabilityPublishedSkillRuntimeContext {
  publishedSkillId: string;
  releaseId: string;
  sourceType: string;
  runtimeType: string;
  runtimeSource: 'deployment' | 'sandbox_fallback' | 'flow_runtime_fallback';
  allowedToolNames: string[];
  toolPolicies: SkillRuntimeToolPolicy[];
  environment?: string | null;
  deploymentId?: string | null;
}

export interface CapabilityReleaseRuntimeExecutionOptions {
  executionId?: string;
  stepId?: string;
  capabilityVersion?: string;
  runtimeType?: string;
  runtimeSessionId?: string;
  phaseKey?: string;
  metadata?: Record<string, unknown>;
}

export interface CapabilityReleaseRuntimeAccessors {
  getCurrentSnapshotOrThrow(
    release: CapabilityReleaseDTO,
  ): Promise<CapabilitySourceSnapshotDTO>;
  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId: string | undefined,
  ): Promise<CapabilityBuildDTO>;
  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null,
  ): Promise<void>;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const toExternalCarboneUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${getCarboneExternalUrl()}${trimmed}`;
  }
  return `${getCarboneExternalUrl()}/${trimmed.replace(/^\/+/, '')}`;
};

const extractDownloadUrl = (value: unknown): string | undefined => {
  const queue: unknown[] = [value];
  const visited = new Set<unknown>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 50) {
    const current = queue.shift();
    inspected += 1;

    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = current as Record<string, unknown>;
    const directUrl = [record.downloadUrl, record.download_url, record.url]
      .map((item) => toExternalCarboneUrl(item))
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (directUrl) {
      return directUrl;
    }

    Object.values(record).forEach((item) => {
      if (item && typeof item === 'object') {
        queue.push(item);
      }
    });
  }

  return undefined;
};

@Injectable()
export class CapabilityReleaseRuntimeService {
  private readonly logger = new Logger(CapabilityReleaseRuntimeService.name);
  private readonly controlPlaneApiUrl = getControlPlaneApiUrl();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly skillService: SkillService,
    private readonly toolCatalogService: ToolCatalogService,
    private readonly capabilityReleaseBrowserRecordingService: CapabilityReleaseBrowserRecordingService,
    private readonly capabilityReleaseSkillDraftService: CapabilityReleaseSkillDraftService,
  ) {}

  async executeCapabilityRuntime(
    dto: ExecuteCapabilityRuntimeDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseRuntimeAccessors,
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const capabilityId = dto.capabilityId || dto.publishedSkillId;
    if (!capabilityId) {
      throw new BadRequestException('capabilityId 或 publishedSkillId 不能为空');
    }

    return this.executePublishedSkill(
      capabilityId,
      dto.input,
      userId,
      {
        executionId: dto.executionId,
        stepId: dto.stepId,
        capabilityVersion: dto.capabilityVersion,
        runtimeType: dto.runtimeType,
        runtimeSessionId: dto.runtimeSessionId,
        phaseKey: dto.phaseKey,
        metadata: dto.metadata,
      },
      accessors,
    );
  }

  async getPublishedSkillRuntimeContext(
    skillId: string,
  ): Promise<CapabilityPublishedSkillRuntimeContext> {
    const release = await this.getReleaseByPublishedSkillOrThrow(skillId);
    const toolBindings = await this.skillService.getSkillToolBindings(skillId);
    const allowedToolNames = toolBindings.validation.effectiveTools;
    const toolPolicies = await this.buildRuntimeToolPolicies(allowedToolNames);

    const latestSuccessfulDeploymentRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM deployment_records
       WHERE release_id = $1::uuid
         AND success = true
       ORDER BY created_at DESC
       LIMIT 1`,
      release.id,
    );

    const lastDeployment =
      release.lastDeploymentId
        ? await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT *
             FROM deployment_records
             WHERE id = $1::uuid
             LIMIT 1`,
            release.lastDeploymentId,
          )
        : [];

    const deploymentRow =
      (Array.isArray(lastDeployment) && lastDeployment[0]?.success ? lastDeployment[0] : null)
      || latestSuccessfulDeploymentRows[0]
      || null;

    if (deploymentRow) {
      const deployment = this.mapDeployment(deploymentRow);
      return {
        publishedSkillId: skillId,
        releaseId: release.id,
        sourceType: release.sourceType,
        runtimeType: deployment.runtimeType,
        runtimeSource: 'deployment',
        allowedToolNames,
        toolPolicies,
        environment: deployment.environment,
        deploymentId: deployment.id,
      };
    }

    if (release.sourceType === 'temporal_workflow') {
      return {
        publishedSkillId: skillId,
        releaseId: release.id,
        sourceType: release.sourceType,
        runtimeType: 'sandbox',
        runtimeSource: 'sandbox_fallback',
        allowedToolNames,
        toolPolicies,
        environment: null,
        deploymentId: null,
      };
    }

    return {
      publishedSkillId: skillId,
      releaseId: release.id,
      sourceType: release.sourceType,
      runtimeType: 'flow_runtime',
      runtimeSource: 'flow_runtime_fallback',
      allowedToolNames,
      toolPolicies,
      environment: null,
      deploymentId: null,
    };
  }

  async executePublishedSkill(
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId: string | undefined,
    options: CapabilityReleaseRuntimeExecutionOptions | undefined,
    accessors: CapabilityReleaseRuntimeAccessors,
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const release = await this.getReleaseByPublishedSkillOrThrow(skillId);
    if (release.sourceType === 'temporal_workflow') {
      const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
      const build = await accessors.resolveTemporalExecutableBuildOrThrow(
        release,
        snapshot,
        undefined,
        userId,
      );
      const runtimeSessionId = options?.runtimeSessionId || `capability-runtime-${randomUUID()}`;
      const normalizedInput: Record<string, any> = {
        ...((input as Record<string, any>) || {}),
      };
      if (!normalizedInput.runtimeSessionId) {
        normalizedInput.runtimeSessionId = runtimeSessionId;
      }
      if (!normalizedInput.workflowId) {
        normalizedInput.workflowId = runtimeSessionId;
      }

      const fn = accessors.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
      const taskQueue = typeof snapshot.sourcePayload.taskQueue === 'string'
        ? snapshot.sourcePayload.taskQueue
        : 'SKILL_TASK_QUEUE';
      const generatedCode = build.generatedCode || '';
      const logs: string[] = [];
      const progressTasks: Promise<void>[] = [];
      let activityOrder = 0;
      const result = await this.activityService.executeCodeStreaming(
        generatedCode,
        fn,
        taskQueue,
        normalizedInput,
        (log) => {
          logs.push(log);
          const activityName = this.extractWorkflowActivityNameFromLog(log);
          if (!activityName || !options?.executionId || !options.phaseKey) {
            return;
          }

          activityOrder += 1;
          const progressTask = this.pushWorkflowActivityProgress({
            executionId: options.executionId,
            parentPhaseKey: options.phaseKey,
            runtimeSessionId,
            activityOrder,
            activityName,
            userId,
          });
          progressTasks.push(progressTask);
          void progressTask.catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error || '');
            this.logger.warn(`Failed to push workflow activity progress: ${message}`);
          });
        },
        {
          preferSandboxStreaming: true,
        },
      );
      await Promise.allSettled(progressTasks);

      const rawResult = result.result;
      const rawResultRecord = rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)
        ? rawResult as Record<string, unknown>
        : null;
      const runtimeStatus = typeof rawResultRecord?.status === 'string'
        ? rawResultRecord.status
        : undefined;
      const normalizedRuntimeStatus = typeof runtimeStatus === 'string'
        ? runtimeStatus.trim().toLowerCase()
        : undefined;
      const runtimeRequiresTakeover = rawResultRecord?.requiresTakeover === true;
      const runtimeRetryable = rawResultRecord?.retryable === true;
      const runtimeTakeoverReason = typeof rawResultRecord?.takeoverReason === 'string'
        ? rawResultRecord.takeoverReason
        : null;
      const runtimeSuccess = rawResultRecord?.success === false
        ? false
        : rawResultRecord?.success === true
          ? true
          : !normalizedRuntimeStatus
            || ['completed', 'succeeded', 'success', 'rendered'].includes(normalizedRuntimeStatus);
      const effectiveSuccess = result.success && runtimeSuccess && !runtimeRequiresTakeover;
      const downloadUrl = extractDownloadUrl(rawResult);
      const temporalWorkflowId = result.workflowId;
      const temporalLink = temporalWorkflowId
        ? `${getTemporalUiUrl()}/namespaces/default/workflows/${temporalWorkflowId}`
        : null;
      const runtimeError = typeof rawResultRecord?.errorMessage === 'string'
        ? rawResultRecord.errorMessage
        : result.error || null;

      const normalizedResult = (rawResult !== undefined && rawResult !== null)
        ? (typeof rawResult === 'object' && !Array.isArray(rawResult)
          ? {
              ...(rawResult as Record<string, unknown>),
              ...(downloadUrl ? { downloadUrl } : {}),
              ...(temporalLink ? { temporalLink } : {}),
            }
          : {
              result: rawResult,
              ...(downloadUrl ? { downloadUrl } : {}),
              ...(temporalLink ? { temporalLink } : {}),
            })
        : (downloadUrl || temporalLink
          ? { ...(downloadUrl ? { downloadUrl } : {}), ...(temporalLink ? { temporalLink } : {}) }
          : null);

      await accessors.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        effectiveSuccess,
        effectiveSuccess
          ? `运行时调用 Skill 成功: ${skillId}`
          : `运行时调用 Skill 失败: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'temporal_workflow',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          runtimeSessionId,
          fn,
          taskQueue,
          temporalWorkflowId,
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'temporal_workflow',
        fn,
        taskQueue,
        status:
          runtimeRequiresTakeover || normalizedRuntimeStatus === 'takeover_required'
            ? 'takeover_required'
            : normalizedRuntimeStatus === 'waiting'
              ? 'waiting'
              : normalizedRuntimeStatus === 'blocked'
                ? 'blocked'
                : effectiveSuccess
                  ? 'completed'
                  : 'failed',
        success: effectiveSuccess,
        runtimeSessionId,
        downloadUrl: downloadUrl || null,
        temporalWorkflowId: temporalWorkflowId || null,
        output: normalizedResult,
        result: normalizedResult,
        retryable: runtimeRetryable,
        requiresTakeover: runtimeRequiresTakeover || runtimeStatus === 'takeover_required',
        takeoverReason: runtimeTakeoverReason,
        logs,
        error: runtimeError,
      };
    }

    if (release.sourceType === 'execution_flow_template') {
      return this.executeDocumentPublishedSkill(release, skillId, input, userId, options, accessors);
    }

    if (release.sourceType === 'browser_recording') {
      return this.executeBrowserRecordingPublishedSkill(release, skillId, input, userId, options, accessors);
    }

    throw new BadRequestException(`当前不支持执行 ${release.sourceType} 类型的已发布 Skill`);
  }

  async executePublishedSkillByPromptForValidation(
    skillId: string,
    prompt: string,
    authToken?: string,
  ): Promise<{ success: boolean; logs: string[]; result?: Record<string, unknown> | null; error?: string }> {
    const runtimeContext = await this.getPublishedSkillRuntimeContext(skillId);
    const controlPlaneUrl = getControlPlaneApiUrl();
    const logs: string[] = [
      `[NL-Validation] 使用自然语言调用已发布 Skill: ${skillId}`,
      `[NL-Validation] runtimeType=${runtimeContext.runtimeType}, runtimeSource=${runtimeContext.runtimeSource}`,
    ];

    const createRes = await axios.post<{ id: string }>(
      `${controlPlaneUrl}/executions`,
      {
        skillId,
        runtimeType: runtimeContext.runtimeType,
        input: {
          prompt,
        },
      },
      {
        headers: authToken ? { Authorization: authToken } : undefined,
      },
    );
    const executionId = createRes.data.id;
    logs.push(`[NL-Validation] 已创建执行单: ${executionId}`);

    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const detailRes = await axios.get<Record<string, unknown>>(
        `${controlPlaneUrl}/executions/${executionId}`,
        {
          headers: authToken ? { Authorization: authToken } : undefined,
        },
      );
      const status = String(detailRes.data?.status || '');
      logs.push(`[NL-Validation] 执行状态: ${status}`);

      if (status === 'succeeded') {
        return {
          success: true,
          logs,
          result:
            detailRes.data?.result && typeof detailRes.data.result === 'object'
              ? detailRes.data.result as Record<string, unknown>
              : null,
        };
      }

      if (status === 'failed' || status === 'cancelled' || status === 'rolled_back') {
        const failureReason = String(detailRes.data?.failureReason || '执行失败');
        return {
          success: false,
          logs,
          error: failureReason,
          result:
            detailRes.data?.result && typeof detailRes.data.result === 'object'
              ? detailRes.data.result as Record<string, unknown>
              : null,
        };
      }

      if (status === 'waiting_input' || status === 'pending_approval') {
        return {
          success: false,
          logs,
          error: `自然语言验证未完成：执行进入 ${status}，请补充信息或审批后重试`,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    return {
      success: false,
      logs,
      error: '自然语言验证超时：执行长时间未进入终态',
    };
  }

  private async buildRuntimeToolPolicies(toolNames: string[]): Promise<SkillRuntimeToolPolicy[]> {
    const uniqueToolNames = Array.from(new Set(toolNames.filter(Boolean)));
    if (uniqueToolNames.length === 0) {
      return [];
    }

    const catalogMap = await this.toolCatalogService.getCatalogItemsByNames(uniqueToolNames);
    return uniqueToolNames.map((toolName) => {
      const catalogItem = catalogMap.get(toolName);
      return {
        name: toolName,
        promptExposure: catalogItem?.promptExposure || 'prompt_and_runtime',
        defaultRequiresConfirmation: Boolean(catalogItem?.defaultRequiresConfirmation),
        defaultRequiresApproval: Boolean(catalogItem?.defaultRequiresApproval),
        status: catalogItem?.status || 'active',
      };
    });
  }

  private async getReleaseByPublishedSkillOrThrow(skillId: string): Promise<CapabilityReleaseDTO> {
    const releaseRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT *
       FROM capability_releases
       WHERE published_skill_id = $1::uuid
         AND archived_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      skillId,
    );

    if (!releaseRows[0]) {
      throw new NotFoundException('未找到与该 Skill 绑定的 Capability');
    }

    return this.mapRelease(releaseRows[0]);
  }

  private async executeDocumentPublishedSkill(
    release: CapabilityReleaseDTO,
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId: string | undefined,
    options: CapabilityReleaseRuntimeExecutionOptions | undefined,
    accessors: CapabilityReleaseRuntimeAccessors,
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const sourceTemplate =
      this.parseJson<Record<string, unknown>>(snapshot.sourcePayload.sourceTemplate)
      || this.capabilityReleaseSkillDraftService.extractExecutionFlowSourceTemplate(snapshot.sourcePayload)
      || {};
    const renderInput = this.resolveDocumentRenderInput(input, sourceTemplate);
    const renderRequest = await this.resolveDocumentRenderRequest(skillId, renderInput);
    const resolvedTemplateId = renderRequest.templateId || renderInput.templateId;
    const resolvedSkillId = renderRequest.skillId || renderInput.skillId;
    const url = `${getCarboneServiceUrl()}/studio/render-resolved`;
    const logs = [
      '[DocumentRuntime] 调用文档运行时: resolved_render',
      `[DocumentRuntime] endpoint=${url}`,
      `[DocumentRuntime] publishedSkillId=${skillId}`,
      ...(resolvedTemplateId ? [`[DocumentRuntime] templateId=${resolvedTemplateId}`] : []),
      ...(resolvedSkillId ? [`[DocumentRuntime] sourceSkillId=${resolvedSkillId}`] : []),
      ...(renderRequest.outputFormat ? [`[DocumentRuntime] outputFormat=${renderRequest.outputFormat}`] : []),
      ...(renderRequest.outputName ? [`[DocumentRuntime] outputName=${renderRequest.outputName}`] : []),
      ...(renderRequest.sourceLanguage ? [`[DocumentRuntime] sourceLanguage=${renderRequest.sourceLanguage}`] : []),
      ...(renderRequest.targetLanguages?.length
        ? [`[DocumentRuntime] targetLanguages=${renderRequest.targetLanguages.join(',')}`]
        : []),
      ...(renderRequest.prepareLocalizedRenderData ? ['[DocumentRuntime] prepareLocalizedRenderData=true'] : []),
    ];

    try {
      const response = await axios.post<Record<string, unknown>>(url, renderRequest, {
        timeout: 120000,
      });
      const responseData = response.data;
      const downloadUrl = extractDownloadUrl(responseData);

      const rawResult = (responseData !== undefined && responseData !== null)
        ? (typeof responseData === 'object' && !Array.isArray(responseData)
          ? responseData as Record<string, unknown>
          : { result: responseData })
        : {};

      const normalizedResult = {
        ...rawResult,
        ...(downloadUrl ? { downloadUrl } : {}),
        ...(resolvedTemplateId ? { templateId: resolvedTemplateId } : {}),
        ...(resolvedSkillId ? { skillId: resolvedSkillId } : {}),
      };

      await accessors.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        true,
        `运行时调用 Document Skill 成功: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'document',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          sourceTemplate,
          renderMode: 'resolved',
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'document',
        success: true,
        downloadUrl: downloadUrl || null,
        output: normalizedResult,
        result: normalizedResult,
        logs,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Document runtime execution failed';
      logs.push(`[DocumentRuntime][Error] ${message}`);

      await accessors.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        false,
        `运行时调用 Document Skill 失败: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'document',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          sourceTemplate,
          renderMode: 'resolved',
          error: message,
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'document',
        success: false,
        downloadUrl: null,
        output: null,
        result: null,
        logs,
        error: message,
      };
    }
  }

  private async executeBrowserRecordingPublishedSkill(
    release: CapabilityReleaseDTO,
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId: string | undefined,
    options: CapabilityReleaseRuntimeExecutionOptions | undefined,
    accessors: CapabilityReleaseRuntimeAccessors,
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const runtimeInput = input || {};
    const runtimeSessionId = options?.runtimeSessionId || `capability-runtime-${randomUUID()}`;
    const shouldResetSession = !options?.runtimeSessionId;
    const browserWorkerUrl = getBrowserWorkerUrl();
    const runtimeExecutionId = options?.executionId || `capability-runtime-${release.id}`;
    const {
      backend,
      runtimeStepsToExecute,
      targetRuntimeStep,
      initialUrl,
      sessionPreferences,
    } = this.capabilityReleaseBrowserRecordingService.buildRuntimePlan(
      snapshot.sourcePayload,
      runtimeInput,
      options?.metadata,
    );
    const logs = [
      `[BrowserRuntime] 调用浏览器录制运行时`,
      `[BrowserRuntime] backend=${backend}`,
      `[BrowserRuntime] runtimeSessionId=${runtimeSessionId}`,
      `[BrowserRuntime] publishedSkillId=${skillId}`,
      `[BrowserRuntime] stepCount=${runtimeStepsToExecute.length}`,
    ];
    let preserveRuntimeSession = false;

    try {
      const shouldInitBrowserSession = !options?.runtimeSessionId || !targetRuntimeStep || targetRuntimeStep.action === 'goto';
      if (shouldInitBrowserSession) {
        await axios.post<{ success: boolean; message?: string }>(
          `${browserWorkerUrl}/browser/init`,
          {
            backend,
            runtimeSessionId,
            ...(initialUrl ? { initialUrl } : {}),
            sessionPreferences,
          },
          { timeout: 60000 },
        );
      }

      const stepResults: Array<Record<string, unknown>> = [];
      for (let index = 0; index < runtimeStepsToExecute.length; index += 1) {
        const step = runtimeStepsToExecute[index] as {
          id: string;
          name: string;
          action: string;
          target?: string;
          args?: Record<string, unknown>;
        };
        logs.push(`[BrowserRuntime][Step ${index + 1}] ${step.action}${step.target ? ` -> ${step.target}` : ''}`);

        const response = await axios.post<{
          success: boolean;
          snapshotId?: string;
          output?: Record<string, unknown>;
          errorCode?: string;
          errorMessage?: string;
          shouldTakeover?: boolean;
          takeoverReason?: string;
        }>(
          `${browserWorkerUrl}/browser/execute-step`,
          {
            executionId: runtimeExecutionId,
            runtimeSessionId,
            backend,
            stepId: `${options?.stepId || release.id}:${step.id}`,
            action: step.action,
            ...(step.target ? { target: step.target } : {}),
            ...(step.args && Object.keys(step.args).length > 0 ? { args: step.args } : {}),
          },
          { timeout: 120000 },
        );

        const result = response.data;
        if (!result.success) {
          const message = result.errorMessage || `浏览器步骤执行失败: ${step.action}`;
          if (result.shouldTakeover) {
            preserveRuntimeSession = true;
          }
          logs.push(`[BrowserRuntime][Error] ${message}`);
          return {
            releaseId: release.id,
            capabilityId: skillId,
            capabilityVersion: options?.capabilityVersion || null,
            publishedSkillId: skillId,
            runtime: 'browser_recording',
            success: false,
            output: {
              stepResults,
              failedStep: step.name,
              failedAction: step.action,
              snapshotId: result.snapshotId || null,
            },
            result: {
              stepResults,
              failedStep: step.name,
              failedAction: step.action,
              snapshotId: result.snapshotId || null,
            },
            logs,
            error: message,
          };
        }

        stepResults.push({
          stepId: step.id,
          name: step.name,
          action: step.action,
          target: step.target || null,
          snapshotId: result.snapshotId || null,
          output: result.output || null,
        });
      }

      const normalizedResult = {
        runtimeSessionId,
        backend,
        stepResults,
      };

      await accessors.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        true,
        `运行时调用 Browser Recording Skill 成功: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'browser_recording',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          runtimeSessionId,
          backend,
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'browser_recording',
        success: true,
        output: normalizedResult,
        result: normalizedResult,
        logs,
        error: null,
      };
    } catch (error) {
      const axiosLikeError = error as { response?: { status?: number; data?: unknown }; message?: string } | undefined;
      const message = axiosLikeError?.response
        ? (() => {
            const detail = axiosLikeError.response?.data;
            if (detail !== undefined) {
              return `HTTP ${axiosLikeError.response?.status || 500}: ${JSON.stringify(detail)}`;
            }
            return axiosLikeError.message || 'Browser recording runtime execution failed';
          })()
        : error instanceof Error
          ? error.message
          : 'Browser recording runtime execution failed';
      logs.push(`[BrowserRuntime][Error] ${message}`);

      await accessors.insertAuditEvent(
        release.id,
        'skill_runtime_invoked',
        userId,
        false,
        `运行时调用 Browser Recording Skill 失败: ${skillId}`,
        {
          publishedSkillId: skillId,
          capabilityId: skillId,
          capabilityVersion: options?.capabilityVersion || null,
          runtime: 'browser_recording',
          requestedRuntimeType: options?.runtimeType || null,
          executionId: options?.executionId || null,
          stepId: options?.stepId || null,
          runtimeSessionId,
          backend,
          error: message,
        },
      );

      return {
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'browser_recording',
        success: false,
        output: null,
        result: null,
        logs,
        error: message,
      };
    } finally {
      if (shouldResetSession && !preserveRuntimeSession) {
        await axios.post(
          `${browserWorkerUrl}/browser/reset`,
          { backend, runtimeSessionId },
          { timeout: 30000 },
        ).catch(() => undefined);
      }
    }
  }

  private resolveDocumentRenderInput(
    input: Record<string, unknown> | undefined,
    sourceTemplate: Record<string, unknown>,
  ): {
    templateId?: string;
    skillId?: string;
    outputFormat?: string;
    outputName?: string;
    sourceLanguage?: string;
    targetLanguages: string[];
    prepareLocalizedRenderData?: boolean;
    data: Record<string, unknown>;
  } {
    const normalizedInput = input || {};
    const directData = asRecord(normalizedInput.data);
    const directParams = asRecord(normalizedInput.params);
    const data = directData || directParams || this.omitRuntimeEnvelopeFields(normalizedInput);
    const targetLanguages = this.pickFirstStringArray(
      normalizedInput.targetLanguages,
      normalizedInput.target_languages,
      sourceTemplate.targetLanguages,
      sourceTemplate.target_languages,
    );
    const sourceLanguage = this.pickFirstNonEmptyString(
      normalizedInput.sourceLanguage,
      normalizedInput.source_language,
      sourceTemplate.sourceLanguage,
      sourceTemplate.source_language,
    );
    const prepareLocalizedRenderData = this.pickFirstBoolean(
      normalizedInput.prepareLocalizedRenderData,
      normalizedInput.prepare_localized_render_data,
      sourceTemplate.prepareLocalizedRenderData,
      sourceTemplate.prepare_localized_render_data,
    );

    return {
      templateId: this.pickFirstNonEmptyString(
        normalizedInput.templateId,
        normalizedInput.template_id,
        sourceTemplate.templateId,
      ),
      skillId: this.pickFirstNonEmptyString(
        normalizedInput.skillId,
        normalizedInput.skill_id,
        sourceTemplate.skillId,
      ),
      outputFormat: this.pickFirstNonEmptyString(
        normalizedInput.outputFormat,
        normalizedInput.output_format,
        normalizedInput.format,
        sourceTemplate.format,
      ),
      outputName: this.pickFirstNonEmptyString(
        normalizedInput.outputName,
        normalizedInput.output_name,
        sourceTemplate.outputName,
        sourceTemplate.output_name,
      ),
      sourceLanguage,
      targetLanguages,
      prepareLocalizedRenderData:
        prepareLocalizedRenderData === undefined
          ? (Boolean(sourceLanguage) || targetLanguages.length > 0 ? true : undefined)
          : prepareLocalizedRenderData,
      data,
    };
  }

  private async resolveDocumentRenderRequest(
    publishedSkillId: string,
    renderInput: ReturnType<CapabilityReleaseRuntimeService['resolveDocumentRenderInput']>,
  ): Promise<RenderResolvedRequest> {
    const fallbackRequest: RenderResolvedRequest = {
      publishedSkillId,
      templateId: renderInput.templateId,
      skillId: renderInput.skillId,
      data: renderInput.data,
      outputFormat: renderInput.outputFormat,
      ...(renderInput.outputName ? { outputName: renderInput.outputName } : {}),
      ...(renderInput.sourceLanguage ? { sourceLanguage: renderInput.sourceLanguage } : {}),
      ...(renderInput.targetLanguages.length > 0 ? { targetLanguages: renderInput.targetLanguages } : {}),
      ...(renderInput.prepareLocalizedRenderData !== undefined
        ? { prepareLocalizedRenderData: renderInput.prepareLocalizedRenderData }
        : {}),
    };

    try {
      const response = await axios.post<GenerateRenderDataResponse>(
        `${getCarboneServiceUrl()}/studio/generate-render-data-with-skill`,
        {
          publishedSkillId,
          templateId: renderInput.templateId,
          skillId: renderInput.skillId,
          simulatedData: renderInput.data,
          outputFormat: renderInput.outputFormat,
          ...(renderInput.outputName ? { outputName: renderInput.outputName } : {}),
          ...(renderInput.sourceLanguage ? { sourceLanguage: renderInput.sourceLanguage } : {}),
          ...(renderInput.targetLanguages.length > 0 ? { targetLanguages: renderInput.targetLanguages } : {}),
          ...(renderInput.prepareLocalizedRenderData !== undefined
            ? { prepareLocalizedRenderData: renderInput.prepareLocalizedRenderData }
            : {}),
        },
        {
          timeout: 120000,
        },
      );
      const standardizedRequest = response.data?.renderResolvedRequest;
      const standardizedData = asRecord(standardizedRequest?.data);
      if (response.data?.success && standardizedRequest && standardizedData) {
        return {
          ...standardizedRequest,
          data: standardizedData,
          ...(standardizedRequest.outputFormat ? {} : { outputFormat: renderInput.outputFormat }),
        };
      }
    } catch {
      // 标准数据生成失败时回退到直连 render-resolved，兼容仅模板渲染等历史场景。
    }

    return fallbackRequest;
  }

  private omitRuntimeEnvelopeFields(
    value: Record<string, unknown>,
  ): Record<string, unknown> {
    const omittedKeys = new Set([
      'templateId',
      'template_id',
      'skillId',
      'skill_id',
      'params',
      'data',
      'outputFormat',
      'output_format',
      'format',
      'outputName',
      'output_name',
      'sourceLanguage',
      'source_language',
      'targetLanguages',
      'target_languages',
      'prepareLocalizedRenderData',
      'prepare_localized_render_data',
      'action',
      'sourceTemplate',
    ]);

    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, current]) => {
      if (!omittedKeys.has(key)) {
        acc[key] = current;
      }
      return acc;
    }, {});
  }

  private pickFirstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstStringArray(...values: unknown[]): string[] {
    for (const value of values) {
      if (!Array.isArray(value)) {
        continue;
      }
      const normalized = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (normalized.length > 0) {
        return normalized;
      }
    }
    return [];
  }

  private pickFirstBoolean(...values: unknown[]): boolean | undefined {
    for (const value of values) {
      if (typeof value === 'boolean') {
        return value;
      }
    }
    return undefined;
  }

  private extractWorkflowActivityNameFromLog(log: string): string | null {
    const match = log.match(/执行(?:浏览器 Phase |共享文档渲染 |共享 HTTP 请求 |共享结构化转换 )?Activity:\s*(.+?)\s*$/);
    return match && typeof match[1] === 'string' && match[1].trim() ? match[1].trim() : null;
  }

  private async pushWorkflowActivityProgress(input: {
    executionId: string;
    parentPhaseKey: string;
    runtimeSessionId?: string;
    activityOrder: number;
    activityName: string;
    userId?: string;
  }): Promise<void> {
    const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
    if (!internalSecret) {
      return;
    }

    await axios.post(
      `${this.controlPlaneApiUrl}/executions/${input.executionId}/phases/progress`,
      {
        parentPhaseKey: input.parentPhaseKey,
        activityOrder: input.activityOrder,
        activityName: input.activityName,
        runtimeSessionId: input.runtimeSessionId,
      },
      {
        timeout: 10000,
        headers: {
          'x-internal-auth': internalSecret,
          'x-user-id': input.userId || 'platform-runtime',
          'x-user-role': 'admin',
          'x-user-name': 'platform-runtime',
        },
      },
    );
  }

  private parseJson<T = unknown>(value: unknown): T {
    if (value === null || value === undefined) {
      return value as T;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }

  private mapRelease(raw: any): CapabilityReleaseDTO {
    return {
      id: raw.id,
      sourceType: raw.source_type,
      sourceId: raw.source_id,
      sourceName: raw.source_name,
      sourceStatus: raw.source_status,
      releaseVersion: Number(raw.release_version || 1),
      status: raw.status,
      approvalStatus: raw.approval_status,
      deploymentStatus: raw.deployment_status,
      currentSourceSnapshotId: raw.current_source_snapshot_id,
      currentBuildId: raw.current_build_id,
      latestSuccessfulBuildId: raw.latest_successful_build_id,
      latestValidationId: raw.latest_validation_id,
      latestSuccessfulValidationId: raw.latest_successful_validation_id,
      currentSkillDraftId: raw.current_skill_draft_id,
      publishedSkillId: raw.published_skill_id,
      lastDeploymentId: raw.last_deployment_id,
      lastDeploymentEnvironment: raw.last_deployment_environment,
      rollbackOfReleaseId: raw.rollback_of_release_id,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
      updatedAt: this.toIsoString(raw.updated_at),
    };
  }

  private mapDeployment(raw: any): DeploymentRecordDTO {
    return {
      id: raw.id,
      releaseId: raw.release_id,
      publishedSkillId: raw.published_skill_id,
      environment: raw.environment,
      runtimeType: raw.runtime_type,
      artifactUri: raw.artifact_uri,
      artifactHash: raw.artifact_hash,
      workerVersion: raw.worker_version,
      reloadStrategy: raw.reload_strategy,
      requestPayload: this.parseJson(raw.request_payload_json) || null,
      resultSnapshot: this.parseJson(raw.result_snapshot_json) || null,
      logs: this.parseJson<string[]>(raw.logs_json) || [],
      status: raw.status,
      success: Boolean(raw.success),
      smokeValidationId: raw.smoke_validation_id,
      rollbackTargetReleaseId: raw.rollback_target_release_id,
      startedAt: raw.started_at ? this.toIsoString(raw.started_at) : null,
      finishedAt: raw.finished_at ? this.toIsoString(raw.finished_at) : null,
      createdBy: raw.created_by,
      createdAt: this.toIsoString(raw.created_at),
    };
  }

  private toIsoString(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(String(value)).toISOString();
  }
}
