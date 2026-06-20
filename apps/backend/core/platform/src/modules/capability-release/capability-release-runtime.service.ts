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
import { BrowserRecordingActionPolicyService } from './browser-recording-action-policy.service';
import { BrowserRecordingExecutionPlanValidatorService } from './browser-recording-execution-plan-validator.service';
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
  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO>;
  resolveTemporalExecutableBuildOrThrow(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId: string | undefined
  ): Promise<CapabilityBuildDTO>;
  resolveWorkflowFnOrThrow(payload: Record<string, unknown>): string;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown> | null
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

  // #region debug-point shared:approve-threshold-param
  private reportApproveThresholdDebug(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    msg: string,
    data: Record<string, unknown>,
    runId = 'pre-fix'
  ): void {
    const localFs = require('fs') as typeof import('fs');
    const envPaths = [
      '/app/.dbg/approve-threshold-param.env',
      '/Users/chain/Documents/MyProject/ops-automation/.dbg/approve-threshold-param.env',
    ];
    let serverUrl = 'http://host.docker.internal:7777/event';
    let sessionId = 'approve-threshold-param';
    for (const envPath of envPaths) {
      try {
        const envContent = localFs.readFileSync(envPath, 'utf8');
        const resolvedUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim();
        const resolvedSessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim();
        if (resolvedUrl) {
          serverUrl = resolvedUrl;
        }
        if (resolvedSessionId) {
          sessionId = resolvedSessionId;
        }
        break;
      } catch {}
    }
    const payload = {
      sessionId,
      runId,
      hypothesisId,
      location: 'capability-release-runtime.service',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    };
    void fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .catch(() =>
        fetch('http://host.docker.internal:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => undefined)
      );
  }
  // #endregion

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: ActivityService,
    private readonly skillService: SkillService,
    private readonly toolCatalogService: ToolCatalogService,
    private readonly browserRecordingActionPolicyService: BrowserRecordingActionPolicyService,
    private readonly browserRecordingExecutionPlanValidatorService: BrowserRecordingExecutionPlanValidatorService,
    private readonly capabilityReleaseBrowserRecordingService: CapabilityReleaseBrowserRecordingService,
    private readonly capabilityReleaseSkillDraftService: CapabilityReleaseSkillDraftService
  ) {}

  async executeCapabilityRuntime(
    dto: ExecuteCapabilityRuntimeDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseRuntimeAccessors
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
      accessors
    );
  }

  async getPublishedSkillRuntimeContext(
    skillId: string
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
      release.id
    );

    const lastDeployment = release.lastDeploymentId
      ? await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT *
             FROM deployment_records
             WHERE id = $1::uuid
             LIMIT 1`,
          release.lastDeploymentId
        )
      : [];

    const deploymentRow =
      (Array.isArray(lastDeployment) && lastDeployment[0]?.success ? lastDeployment[0] : null) ||
      latestSuccessfulDeploymentRows[0] ||
      null;

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
    accessors: CapabilityReleaseRuntimeAccessors
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const release = await this.getReleaseByPublishedSkillOrThrow(skillId);
    if (release.sourceType === 'temporal_workflow') {
      const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
      const build = await accessors.resolveTemporalExecutableBuildOrThrow(
        release,
        snapshot,
        undefined,
        userId
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
      const taskQueue =
        typeof snapshot.sourcePayload.taskQueue === 'string'
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
        }
      );
      await Promise.allSettled(progressTasks);

      const rawResult = result.result;
      const rawResultRecord =
        rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)
          ? (rawResult as Record<string, unknown>)
          : null;
      const runtimeStatus =
        typeof rawResultRecord?.status === 'string' ? rawResultRecord.status : undefined;
      const normalizedRuntimeStatus =
        typeof runtimeStatus === 'string' ? runtimeStatus.trim().toLowerCase() : undefined;
      const runtimeRequiresTakeover = rawResultRecord?.requiresTakeover === true;
      const runtimeRetryable = rawResultRecord?.retryable === true;
      const runtimeTakeoverReason =
        typeof rawResultRecord?.takeoverReason === 'string' ? rawResultRecord.takeoverReason : null;
      const runtimeSuccess =
        rawResultRecord?.success === false
          ? false
          : rawResultRecord?.success === true
            ? true
            : !normalizedRuntimeStatus ||
              ['completed', 'succeeded', 'success', 'rendered'].includes(normalizedRuntimeStatus);
      const effectiveSuccess = result.success && runtimeSuccess && !runtimeRequiresTakeover;
      const downloadUrl = extractDownloadUrl(rawResult);
      const temporalWorkflowId = result.workflowId;
      const temporalLink = temporalWorkflowId
        ? `${getTemporalUiUrl()}/namespaces/default/workflows/${temporalWorkflowId}`
        : null;
      const runtimeError =
        typeof rawResultRecord?.errorMessage === 'string'
          ? rawResultRecord.errorMessage
          : result.error || null;

      const normalizedResult =
        rawResult !== undefined && rawResult !== null
          ? typeof rawResult === 'object' && !Array.isArray(rawResult)
            ? {
                ...(rawResult as Record<string, unknown>),
                ...(downloadUrl ? { downloadUrl } : {}),
                ...(temporalLink ? { temporalLink } : {}),
              }
            : {
                result: rawResult,
                ...(downloadUrl ? { downloadUrl } : {}),
                ...(temporalLink ? { temporalLink } : {}),
              }
          : downloadUrl || temporalLink
            ? { ...(downloadUrl ? { downloadUrl } : {}), ...(temporalLink ? { temporalLink } : {}) }
            : null;

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
        }
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
      return this.executeDocumentPublishedSkill(
        release,
        skillId,
        input,
        userId,
        options,
        accessors
      );
    }

    if (release.sourceType === 'browser_recording') {
      return this.executeBrowserRecordingPublishedSkill(
        release,
        skillId,
        input,
        userId,
        options,
        accessors
      );
    }

    throw new BadRequestException(`当前不支持执行 ${release.sourceType} 类型的已发布 Skill`);
  }

  async executePublishedSkillByPromptForValidation(
    skillId: string,
    prompt: string,
    authToken?: string
  ): Promise<{
    success: boolean;
    logs: string[];
    result?: Record<string, unknown> | null;
    error?: string;
  }> {
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
      }
    );
    const executionId = createRes.data.id;
    logs.push(`[NL-Validation] 已创建执行单: ${executionId}`);

    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const detailRes = await axios.get<Record<string, unknown>>(
        `${controlPlaneUrl}/executions/${executionId}`,
        {
          headers: authToken ? { Authorization: authToken } : undefined,
        }
      );
      const status = String(detailRes.data?.status || '');
      logs.push(`[NL-Validation] 执行状态: ${status}`);

      if (status === 'succeeded') {
        return {
          success: true,
          logs,
          result:
            detailRes.data?.result && typeof detailRes.data.result === 'object'
              ? (detailRes.data.result as Record<string, unknown>)
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
              ? (detailRes.data.result as Record<string, unknown>)
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
      skillId
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
    accessors: CapabilityReleaseRuntimeAccessors
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const sourceTemplate =
      this.parseJson<Record<string, unknown>>(snapshot.sourcePayload.sourceTemplate) ||
      this.capabilityReleaseSkillDraftService.extractExecutionFlowSourceTemplate(
        snapshot.sourcePayload
      ) ||
      {};
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
      ...(renderRequest.outputFormat
        ? [`[DocumentRuntime] outputFormat=${renderRequest.outputFormat}`]
        : []),
      ...(renderRequest.outputName
        ? [`[DocumentRuntime] outputName=${renderRequest.outputName}`]
        : []),
      ...(renderRequest.sourceLanguage
        ? [`[DocumentRuntime] sourceLanguage=${renderRequest.sourceLanguage}`]
        : []),
      ...(renderRequest.targetLanguages?.length
        ? [`[DocumentRuntime] targetLanguages=${renderRequest.targetLanguages.join(',')}`]
        : []),
      ...(renderRequest.prepareLocalizedRenderData
        ? ['[DocumentRuntime] prepareLocalizedRenderData=true']
        : []),
    ];

    try {
      const response = await axios.post<Record<string, unknown>>(url, renderRequest, {
        timeout: 120000,
      });
      const responseData = response.data;
      const downloadUrl = extractDownloadUrl(responseData);

      const rawResult =
        responseData !== undefined && responseData !== null
          ? typeof responseData === 'object' && !Array.isArray(responseData)
            ? (responseData as Record<string, unknown>)
            : { result: responseData }
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
        }
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
        }
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
    accessors: CapabilityReleaseRuntimeAccessors
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const runtimeInput = input || {};
    // #region debug-point A:runtime-input-and-raw-template
    const rawExecutionPlan = asRecord(asRecord(snapshot.sourcePayload.apiEndpoints)?.runtimeMetadata)
      ? asRecord(asRecord(snapshot.sourcePayload.apiEndpoints)?.runtimeMetadata)?.executionPlan
      : undefined;
    const rawTemplateBranchConditions = Array.isArray(asRecord(rawExecutionPlan)?.templateSteps)
      ? (asRecord(rawExecutionPlan)?.templateSteps as unknown[])
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item)
          )
          .map((item) => asRecord(item.branch))
          .filter((branch): branch is Record<string, unknown> => Boolean(branch))
          .map((branch) => ({
            conditionFn: typeof branch.condition_fn === 'string' ? branch.condition_fn : null,
            description: typeof branch.description === 'string' ? branch.description : null,
            takeoverReason:
              typeof branch.takeover_reason === 'string' ? branch.takeover_reason : null,
          }))
      : [];
    if (
      rawTemplateBranchConditions.length > 0 ||
      runtimeInput.grossMarginThreshold !== undefined ||
      runtimeInput.threshold !== undefined
    ) {
      this.reportApproveThresholdDebug('A', 'browser recording runtime received threshold input', {
        skillId,
        releaseId: release.id,
        releaseName: (release as unknown as Record<string, unknown>).name || null,
        grossMarginThreshold: runtimeInput.grossMarginThreshold ?? null,
        threshold: runtimeInput.threshold ?? null,
        input: runtimeInput,
        rawTemplateBranchConditions,
      });
    }
    // #endregion
    const runtimeSessionId = options?.runtimeSessionId || `capability-runtime-${randomUUID()}`;
    const shouldResetSession = !options?.runtimeSessionId;
    const browserWorkerUrl = getBrowserWorkerUrl();
    const runtimeExecutionId = options?.executionId || `capability-runtime-${release.id}`;
    const planValidation = this.browserRecordingExecutionPlanValidatorService.validateForRuntime(
      snapshot.sourcePayload
    );
    const {
      backend,
      runtimeStepsToExecute,
      targetRuntimeStep,
      loopPlan,
      initialUrl,
      sessionPreferences,
    } = this.capabilityReleaseBrowserRecordingService.buildRuntimePlan(
      snapshot.sourcePayload,
      runtimeInput,
      options?.metadata
    );
    // #region debug-point B:resolved-runtime-branch
    const resolvedBranchSteps = runtimeStepsToExecute
      .filter((step) => step.action === 'branch' && step.branch)
      .map((step) => ({
        id: step.id,
        description: step.description || null,
        conditionFn: step.branch?.conditionFn || null,
        onMatch: step.branch?.onMatch || null,
        onMismatch: step.branch?.onMismatch || null,
        takeoverReason: step.branch?.takeoverReason || null,
      }));
    if (
      resolvedBranchSteps.length > 0 ||
      runtimeInput.grossMarginThreshold !== undefined ||
      runtimeInput.threshold !== undefined
    ) {
      this.reportApproveThresholdDebug('B', 'browser recording runtime resolved branch steps', {
        skillId,
        runtimeSessionId,
        grossMarginThreshold: runtimeInput.grossMarginThreshold ?? null,
        threshold: runtimeInput.threshold ?? null,
        resolvedBranchSteps,
      });
    }
    // #endregion
    const runtimeTrace = {
      ...planValidation.trace,
      releaseId: release.id,
      publishedSkillId: skillId,
      runtimeExecutionId,
      ...(release.currentSkillDraftId ? { skillDraftId: release.currentSkillDraftId } : {}),
    };
    const runtimeEvidence: Record<string, unknown> = {
      currentStepId: null,
      currentLoopIteration: null,
      currentRiskLevel: null,
      riskReason: null,
      lastReadValue: null,
      lastBranchDecision: null,
      takeoverReason: null,
    };
    const logs = [
      `[BrowserRuntime] 调用浏览器录制运行时`,
      `[BrowserRuntime] backend=${backend}`,
      `[BrowserRuntime] runtimeSessionId=${runtimeSessionId}`,
      `[BrowserRuntime] publishedSkillId=${skillId}`,
      `[BrowserRuntime] executionPlanVersion=${planValidation.executionPlanVersion || 'legacy/unknown'}`,
      `[BrowserRuntime] degradedMode=${planValidation.degradedMode}`,
      ...(planValidation.degradeReason
        ? [`[BrowserRuntime] degradeReason=${planValidation.degradeReason}`]
        : []),
      `[BrowserRuntime] stepCount=${runtimeStepsToExecute.length}`,
      ...(loopPlan
        ? [
            `[BrowserRuntime] loopMode=${loopPlan.mode}`,
            `[BrowserRuntime] loopMaxIterations=${loopPlan.maxIterations}`,
          ]
        : []),
    ];
    let preserveRuntimeSession = false;
    let currentPageUrl = initialUrl;

    try {
      const shouldInitBrowserSession =
        !options?.runtimeSessionId || !targetRuntimeStep || targetRuntimeStep.action === 'goto';
      if (shouldInitBrowserSession) {
        await axios.post<{ success: boolean; message?: string }>(
          `${browserWorkerUrl}/browser/init`,
          {
            backend,
            runtimeSessionId,
            ...(initialUrl ? { initialUrl } : {}),
            sessionPreferences,
          },
          { timeout: 60000 }
        );
      }

      const stepResults: Array<Record<string, unknown>> = [];
      const variables: Record<string, unknown> = {};
      const buildRuntimePayload = (): Record<string, unknown> => ({
        runtimeSessionId,
        backend,
        stepResults,
        variables,
        executionPlanVersion: planValidation.executionPlanVersion || 'legacy/unknown',
        degradedMode: planValidation.degradedMode,
        degradeReason: planValidation.degradeReason,
        trace: runtimeTrace,
        runtimeEvidence,
      });
      const buildFailureResult = (
        message: string,
        status?: 'blocked' | 'takeover_required',
        takeoverReason?: string
      ): ExecuteCapabilityRuntimeResultDTO => ({
        releaseId: release.id,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        publishedSkillId: skillId,
        runtime: 'browser_recording',
        ...(status ? { status } : {}),
        success: false,
        runtimeSessionId,
        ...(status === 'takeover_required' ? { requiresTakeover: true } : {}),
        ...(takeoverReason ? { takeoverReason } : {}),
        output: buildRuntimePayload(),
        result: buildRuntimePayload(),
        logs,
        error: message,
      });
      const buildBrowserRecordingAuditDetails = (
        details?: Record<string, unknown>
      ): Record<string, unknown> => ({
        publishedSkillId: skillId,
        capabilityId: skillId,
        capabilityVersion: options?.capabilityVersion || null,
        runtime: 'browser_recording',
        requestedRuntimeType: options?.runtimeType || null,
        executionId: options?.executionId || null,
        stepId: options?.stepId || null,
        runtimeSessionId,
        backend,
        executionPlanVersion: planValidation.executionPlanVersion || 'legacy/unknown',
        degradedMode: planValidation.degradedMode,
        degradeReason: planValidation.degradeReason,
        ...details,
      });
      const failWithAudit = async (input: {
        message: string;
        status?: 'blocked' | 'takeover_required';
        takeoverReason?: string;
        eventType?: string;
        summary?: string;
        details?: Record<string, unknown>;
      }): Promise<ExecuteCapabilityRuntimeResultDTO> => {
        await accessors.insertAuditEvent(
          release.id,
          input.eventType ||
            (input.status === 'takeover_required'
              ? 'skill_runtime_takeover_required'
              : input.status === 'blocked'
                ? 'skill_runtime_blocked'
                : 'skill_runtime_invoked'),
          userId,
          false,
          input.summary || `运行时调用 Browser Recording Skill 失败: ${skillId}`,
          buildBrowserRecordingAuditDetails({
            ...(input.takeoverReason ? { takeoverReason: input.takeoverReason } : {}),
            ...input.details,
          })
        );
        return buildFailureResult(input.message, input.status, input.takeoverReason);
      };

      if (!planValidation.valid) {
        const message = `executionPlan 校验失败: ${planValidation.errors.map((item) => item.message).join('；')}`;
        logs.push(`[BrowserRuntime][ValidationError] ${message}`);
        return failWithAudit({
          message,
          status: 'blocked',
          eventType: 'skill_runtime_blocked_by_execution_plan_validation',
          summary: `运行时阻断：Browser Recording executionPlan 校验失败: ${skillId}`,
          details: {
            planValidation,
          },
        });
      }

      const executeSequence = async (
        steps: Array<{
          id: string;
          name: string;
          action: string;
          target?: string;
          args?: Record<string, unknown>;
          outputVar?: string;
          branch?: {
            conditionFn: string;
            onMatch: 'continue' | 'stop';
            onMismatch: 'continue' | 'stop' | 'takeover';
            takeoverReason?: string;
            description?: string;
          };
          description?: string;
        }>,
        label: string
      ): Promise<ExecuteCapabilityRuntimeResultDTO | null> => {
        for (let index = 0; index < steps.length; index += 1) {
          const step = steps[index]!;
          const actionAssessment = this.browserRecordingActionPolicyService.assessRuntimeStep(
            step,
            { currentPageUrl }
          );
          runtimeEvidence.currentStepId = step.id;
          runtimeEvidence.currentRiskLevel = actionAssessment.riskLevel;
          runtimeEvidence.riskReason = actionAssessment.reason;
          logs.push(
            `[BrowserRuntime][${label}][Step ${index + 1}] ${step.action}${step.target ? ` -> ${step.target}` : ''}`
          );
          logs.push(
            `[BrowserRuntime][${label}][Risk] ${step.id} => ${actionAssessment.riskLevel} (${actionAssessment.reason})`
          );

          if (actionAssessment.riskLevel === 'forbidden') {
            const message = `运行时阻断高风险动作: ${actionAssessment.reason}`;
            logs.push(`[BrowserRuntime][Blocked] ${message}`);
            stepResults.push({
              stepId: step.id,
              name: step.name,
              action: step.action,
              target: step.target || null,
              output: null,
              blocked: true,
              riskLevel: actionAssessment.riskLevel,
              riskReason: actionAssessment.reason,
            });
            return failWithAudit({
              message,
              status: 'blocked',
              eventType: 'skill_runtime_blocked_by_action_policy',
              summary: `运行时阻断：Browser Recording 动作策略禁止执行: ${skillId}`,
              details: {
                stepId: step.id,
                action: step.action,
                target: step.target || null,
                riskLevel: actionAssessment.riskLevel,
                riskReason: actionAssessment.reason,
              },
            });
          }

          if (actionAssessment.riskLevel === 'confirm') {
            const takeoverReason = `运行时动作需要人工接管: ${actionAssessment.reason}`;
            preserveRuntimeSession = true;
            runtimeEvidence.takeoverReason = takeoverReason;
            await this.freezeBrowserRuntimeSession(
              browserWorkerUrl,
              runtimeSessionId,
              backend,
              takeoverReason
            );
            logs.push(`[BrowserRuntime][Takeover] ${takeoverReason}`);
            stepResults.push({
              stepId: step.id,
              name: step.name,
              action: step.action,
              target: step.target || null,
              output: null,
              takeover: true,
              takeoverReason,
              riskLevel: actionAssessment.riskLevel,
              riskReason: actionAssessment.reason,
            });
            return failWithAudit({
              message: takeoverReason,
              status: 'takeover_required',
              takeoverReason,
              eventType: 'skill_runtime_takeover_required_by_action_policy',
              summary: `运行时接管：Browser Recording 动作策略要求人工确认: ${skillId}`,
              details: {
                stepId: step.id,
                action: step.action,
                target: step.target || null,
                riskLevel: actionAssessment.riskLevel,
                riskReason: actionAssessment.reason,
              },
            });
          }

          if (step.action === 'takeover_gate') {
            preserveRuntimeSession = true;
            await this.freezeBrowserRuntimeSession(
              browserWorkerUrl,
              runtimeSessionId,
              backend,
              step.description || '人工接管'
            );
            const takeoverReason = step.description || '需要人工接管';
            runtimeEvidence.takeoverReason = takeoverReason;
            stepResults.push({
              stepId: step.id,
              name: step.name,
              action: step.action,
              target: step.target || null,
              output: null,
              takeover: true,
              takeoverReason,
              riskLevel: actionAssessment.riskLevel,
              riskReason: actionAssessment.reason,
            });
            return failWithAudit({
              message: takeoverReason,
              status: 'takeover_required',
              takeoverReason,
              summary: `运行时接管：Browser Recording takeover gate 触发: ${skillId}`,
              details: {
                stepId: step.id,
                action: step.action,
                target: step.target || null,
              },
            });
          }

          if (step.action === 'read_value') {
            const readAction = step.target ? 'get_text' : 'read_page';
            const response = await axios.post<{
              success: boolean;
              snapshotId?: string;
              output?: Record<string, unknown>;
              errorCode?: string;
              errorMessage?: string;
            }>(
              `${browserWorkerUrl}/browser/execute-step`,
              {
                executionId: runtimeExecutionId,
                runtimeSessionId,
                backend,
                stepId: `${options?.stepId || release.id}:${step.id}`,
                action: readAction,
                ...(step.target ? { target: step.target } : {}),
                ...(step.args && Object.keys(step.args).length > 0 ? { args: step.args } : {}),
              },
              { timeout: 120000 }
            );
            const result = response.data;
            if (!result.success) {
              const message = result.errorMessage || `浏览器步骤执行失败: ${step.action}`;
              logs.push(`[BrowserRuntime][Error] ${message}`);
              return failWithAudit({
                message,
                summary: `运行时调用 Browser Recording Skill 失败: ${skillId}`,
                details: {
                  stepId: step.id,
                  action: step.action,
                  target: step.target || null,
                },
              });
            }
            const textValue = this.extractBrowserStepText(result.output);
            if (step.outputVar) {
              variables[step.outputVar] = textValue;
            }
            runtimeEvidence.lastReadValue = {
              var: step.outputVar || null,
              value: textValue,
            };
            stepResults.push({
              stepId: step.id,
              name: step.name,
              action: step.action,
              target: step.target || null,
              snapshotId: result.snapshotId || null,
              output: result.output || null,
              text: textValue,
              outputVar: step.outputVar || null,
              riskLevel: actionAssessment.riskLevel,
              riskReason: actionAssessment.reason,
            });
            continue;
          }

          if (step.action === 'branch') {
            const branchResult = this.evaluateBrowserBranchStep(step, variables);
            runtimeEvidence.lastBranchDecision = {
              condition: step.branch?.conditionFn || null,
              result: branchResult.outcome,
            };
            // #region debug-point C:branch-evaluation
            this.reportApproveThresholdDebug('C', 'browser recording branch evaluated', {
              skillId,
              runtimeSessionId,
              grossMarginThreshold: runtimeInput.grossMarginThreshold ?? null,
              threshold: runtimeInput.threshold ?? null,
              branchCondition: step.branch?.conditionFn || null,
              variables,
              outcome: branchResult.outcome,
              message: branchResult.message || null,
              error: branchResult.error || null,
              takeoverReason: branchResult.takeoverReason || null,
            });
            // #endregion
            stepResults.push({
              stepId: step.id,
              name: step.name,
              action: step.action,
              target: step.target || null,
              output: null,
              riskLevel: actionAssessment.riskLevel,
              riskReason: actionAssessment.reason,
              ...(branchResult.message ? { message: branchResult.message } : {}),
              ...(branchResult.error ? { error: branchResult.error } : {}),
              ...(branchResult.takeover
                ? { takeover: true, takeoverReason: branchResult.takeoverReason || null }
                : {}),
            });
            if (branchResult.outcome === 'continue') {
              continue;
            }
            if (branchResult.outcome === 'takeover') {
              preserveRuntimeSession = true;
              const takeoverReason = branchResult.takeoverReason || '条件未满足，需要人工接管';
              runtimeEvidence.takeoverReason = takeoverReason;
              await this.freezeBrowserRuntimeSession(
                browserWorkerUrl,
                runtimeSessionId,
                backend,
                takeoverReason
              );
              logs.push(`[BrowserRuntime][Takeover] ${takeoverReason}`);
              return failWithAudit({
                message: takeoverReason,
                status: 'takeover_required',
                takeoverReason,
                eventType: 'skill_runtime_takeover_required_by_branch',
                summary: `运行时接管：Browser Recording 条件分支要求人工介入: ${skillId}`,
                details: {
                  stepId: step.id,
                  action: step.action,
                  target: step.target || null,
                  branchCondition: step.branch?.conditionFn || null,
                },
              });
            }
            const message = branchResult.error || '浏览器分支步骤停止执行';
            logs.push(`[BrowserRuntime][Error] ${message}`);
            return failWithAudit({
              message,
              status: 'blocked',
              eventType: 'skill_runtime_blocked_by_branch',
              summary: `运行时阻断：Browser Recording 条件分支停止执行: ${skillId}`,
              details: {
                stepId: step.id,
                action: step.action,
                target: step.target || null,
                branchCondition: step.branch?.conditionFn || null,
              },
            });
          }

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
            { timeout: 120000 }
          );

          const result = response.data;
          if (!result.success) {
            const message = result.errorMessage || `浏览器步骤执行失败: ${step.action}`;
            if (result.shouldTakeover) {
              preserveRuntimeSession = true;
            }
            logs.push(`[BrowserRuntime][Error] ${message}`);
            return failWithAudit({
              message,
              summary: `运行时调用 Browser Recording Skill 失败: ${skillId}`,
              details: {
                stepId: step.id,
                action: step.action,
                target: step.target || null,
                shouldTakeover: result.shouldTakeover || false,
                browserTakeoverReason: result.takeoverReason || null,
              },
            });
          }

          if (step.action === 'goto') {
            const navigationUrl =
              (typeof step.args?.url === 'string' && step.args.url.trim()) ||
              (typeof step.target === 'string' && step.target.trim()) ||
              undefined;
            if (navigationUrl) {
              currentPageUrl = navigationUrl;
            }
          }

          stepResults.push({
            stepId: step.id,
            name: step.name,
            action: step.action,
            target: step.target || null,
            snapshotId: result.snapshotId || null,
            output: result.output || null,
            riskLevel: actionAssessment.riskLevel,
            riskReason: actionAssessment.reason,
          });
        }

        return null;
      };

      const readLoopStopSignal = async (
        iteration: number,
        phase: 'before' | 'after'
      ): Promise<{
        failure: ExecuteCapabilityRuntimeResultDTO | null;
        rawValue?: unknown;
        normalizedValue?: string;
      }> => {
        if (!loopPlan) {
          return { failure: null };
        }
        runtimeEvidence.currentLoopIteration = iteration;
        const stopStep = loopPlan.stopWhen.read.step;
        const action = stopStep.action === 'read_page' ? 'read_page' : 'get_text';
        logs.push(`[BrowserRuntime][Loop ${iteration}][${phase}] 读取终止条件`);
        const response = await axios.post<{
          success: boolean;
          snapshotId?: string;
          output?: Record<string, unknown>;
          errorMessage?: string;
        }>(
          `${browserWorkerUrl}/browser/execute-step`,
          {
            executionId: runtimeExecutionId,
            runtimeSessionId,
            backend,
            stepId: `${options?.stepId || release.id}:${stopStep.id}:${phase}:${iteration}`,
            action,
            ...(stopStep.target ? { target: stopStep.target } : {}),
            ...(stopStep.args && Object.keys(stopStep.args).length > 0
              ? { args: stopStep.args }
              : {}),
          },
          { timeout: 120000 }
        );
        const result = response.data;
        if (!result.success) {
          const message = result.errorMessage || '读取循环终止条件失败';
          logs.push(`[BrowserRuntime][Error] ${message}`);
          return {
            failure: await failWithAudit({
              message,
              status: 'blocked',
              eventType: 'skill_runtime_blocked_by_loop_stop_read',
              summary: `运行时阻断：Browser Recording 循环终止条件读取失败: ${skillId}`,
              details: {
                stepId: stopStep.id,
                action,
                target: stopStep.target || null,
                phase,
                iteration,
              },
            }),
          };
        }
        const rawValue =
          loopPlan.stopWhen.read.type === 'page_signal'
            ? this.extractLoopPageSignalValue(result.output, loopPlan.stopWhen.read.key)
            : this.extractBrowserStepText(result.output);
        const normalizedValue =
          typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue ?? null);
        stepResults.push({
          stepId: `${stopStep.id}:${phase}:${iteration}`,
          name: `${stopStep.name} (${phase})`,
          action: 'loop_stop_read',
          target: stopStep.target || null,
          output: result.output || null,
          text: normalizedValue,
          meta: {
            phase,
            iteration,
            stopReadType: loopPlan.stopWhen.read.type,
            description: loopPlan.stopWhen.description,
          },
        });
        return { failure: null, rawValue, normalizedValue };
      };

      if (loopPlan && !targetRuntimeStep) {
        if (loopPlan.preLoopSteps.length > 0) {
          const preResult = await executeSequence(loopPlan.preLoopSteps, 'PreLoop');
          if (preResult) {
            return preResult;
          }
        }

        for (let iteration = 1; iteration <= loopPlan.maxIterations; iteration += 1) {
          const beforeStop = await readLoopStopSignal(iteration, 'before');
          if (beforeStop.failure) {
            return beforeStop.failure;
          }
          if (this.evaluateLoopStopCondition(loopPlan.stopWhen.conditionFn, beforeStop.rawValue)) {
            logs.push(`[BrowserRuntime][Loop ${iteration}] 终止条件已满足，结束循环`);
            break;
          }

          const beforeSignature = beforeStop.normalizedValue;
          const iterationResult = await executeSequence(
            loopPlan.iterationSteps,
            `Loop ${iteration}`
          );
          if (iterationResult) {
            return iterationResult;
          }

          const afterStop = await readLoopStopSignal(iteration, 'after');
          if (afterStop.failure) {
            return afterStop.failure;
          }
          if (this.evaluateLoopStopCondition(loopPlan.stopWhen.conditionFn, afterStop.rawValue)) {
            logs.push(`[BrowserRuntime][Loop ${iteration}] 已达到终止条件`);
            break;
          }

          if (beforeSignature === afterStop.normalizedValue) {
            const message = `循环第 ${iteration} 轮执行后页面状态无进展`;
            logs.push(`[BrowserRuntime][Loop][NoProgress] ${message}`);
            if (loopPlan.onNoProgress === 'takeover') {
              preserveRuntimeSession = true;
              runtimeEvidence.takeoverReason = message;
              await this.freezeBrowserRuntimeSession(
                browserWorkerUrl,
                runtimeSessionId,
                backend,
                message
              );
              return failWithAudit({
                message,
                status: 'takeover_required',
                takeoverReason: message,
                eventType: 'skill_runtime_takeover_required_by_loop_no_progress',
                summary: `运行时接管：Browser Recording 循环无进展: ${skillId}`,
                details: {
                  iteration,
                },
              });
            }
            return failWithAudit({
              message,
              status: 'blocked',
              eventType: 'skill_runtime_blocked_by_loop_no_progress',
              summary: `运行时阻断：Browser Recording 循环无进展: ${skillId}`,
              details: {
                iteration,
              },
            });
          }

          if (iteration === loopPlan.maxIterations) {
            const message = `已达到最大循环次数 ${loopPlan.maxIterations}`;
            logs.push(`[BrowserRuntime][Loop][Stop] ${message}`);
            return failWithAudit({
              message,
              status: 'blocked',
              eventType: 'skill_runtime_blocked_by_loop_limit',
              summary: `运行时阻断：Browser Recording 达到最大循环次数: ${skillId}`,
              details: {
                iteration,
                maxIterations: loopPlan.maxIterations,
              },
            });
          }
        }

        if (loopPlan.postLoopSteps.length > 0) {
          const postResult = await executeSequence(loopPlan.postLoopSteps, 'PostLoop');
          if (postResult) {
            return postResult;
          }
        }
      } else {
        const linearResult = await executeSequence(runtimeStepsToExecute, 'Linear');
        if (linearResult) {
          return linearResult;
        }
      }

      const normalizedResult = buildRuntimePayload();

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
          executionPlanVersion: planValidation.executionPlanVersion || 'legacy/unknown',
          degradedMode: planValidation.degradedMode,
          degradeReason: planValidation.degradeReason,
        }
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
      const axiosLikeError = error as
        | { response?: { status?: number; data?: unknown }; message?: string }
        | undefined;
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
          executionPlanVersion: planValidation.executionPlanVersion || 'legacy/unknown',
          degradedMode: planValidation.degradedMode,
          degradeReason: planValidation.degradeReason,
          error: message,
        }
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
        await axios
          .post(
            `${browserWorkerUrl}/browser/reset`,
            { backend, runtimeSessionId },
            { timeout: 30000 }
          )
          .catch(() => undefined);
      }
    }
  }

  private extractBrowserStepText(output?: Record<string, unknown>): string {
    const rawValue =
      (typeof output?.text === 'string' && output.text) ||
      (typeof output?.stdout === 'string' && output.stdout) ||
      '';
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return '';
    }

    const resultBlockMatch = trimmed.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);
    const candidate = resultBlockMatch?.[1]?.trim() || trimmed;
    if (candidate.startsWith('"') && candidate.endsWith('"')) {
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === 'string') {
          return parsed.trim();
        }
      } catch {
        return candidate.slice(1, -1).trim();
      }
    }
    return candidate;
  }

  private extractLoopPageSignalValue(output: unknown, key: string): unknown {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return undefined;
    }
    const keyParts = trimmedKey
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean);
    let current: unknown = output;
    for (const part of keyParts) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private evaluateLoopStopCondition(conditionFn: string, value: unknown): boolean {
    try {
      const evaluator = new Function(
        'value',
        `const fn = (value) => ${conditionFn}; return fn(value);`
      ) as (input: unknown) => unknown;
      return Boolean(evaluator(value));
    } catch {
      if (typeof value === 'number') {
        return value === 0;
      }
      if (typeof value === 'string') {
        return value.trim().length === 0;
      }
      return value === false || value == null;
    }
  }

  private evaluateBrowserBranchStep(
    step: {
      branch?: {
        conditionFn: string;
        onMatch: 'continue' | 'stop';
        onMismatch: 'continue' | 'stop' | 'takeover';
        takeoverReason?: string;
        description?: string;
      };
    },
    variables: Record<string, unknown>
  ): {
    outcome: 'continue' | 'stop' | 'takeover';
    message?: string;
    error?: string;
    takeover?: boolean;
    takeoverReason?: string;
  } {
    const branch = step.branch;
    if (!branch?.conditionFn) {
      return {
        outcome: 'stop',
        error: 'branch step missing conditionFn',
      };
    }

    try {
      const evaluator = new Function(
        'ctx',
        `const fn = ${branch.conditionFn}; return fn(ctx);`
      ) as (ctx: Record<string, unknown>) => unknown;
      const matched = Boolean(evaluator(variables));
      const outcome = matched ? branch.onMatch : branch.onMismatch;

      if (outcome === 'continue') {
        return {
          outcome: 'continue',
          message: matched ? '条件成立，继续执行' : '条件不成立，但配置为继续执行',
        };
      }
      if (outcome === 'stop') {
        return {
          outcome: 'stop',
          error: matched ? '条件成立，按配置停止执行' : '条件不满足，按配置停止执行',
          message: branch.description || '条件分歧停止执行',
        };
      }
      return {
        outcome: 'takeover',
        takeover: true,
        error: branch.takeoverReason || '条件不满足，需要人工接管',
        message: branch.description || '条件分歧触发人工接管',
        takeoverReason: branch.takeoverReason || '条件不满足，需要人工接管',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        outcome: 'stop',
        error: `执行条件表达式失败: ${message}`,
      };
    }
  }

  private async freezeBrowserRuntimeSession(
    browserWorkerUrl: string,
    runtimeSessionId: string,
    backend: string,
    reason: string
  ): Promise<void> {
    await axios
      .post(
        `${browserWorkerUrl}/browser/freeze`,
        {
          runtimeSessionId,
          backend,
          reason,
        },
        { timeout: 30000 }
      )
      .catch(() => undefined);
  }

  private resolveDocumentRenderInput(
    input: Record<string, unknown> | undefined,
    sourceTemplate: Record<string, unknown>
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
      sourceTemplate.target_languages
    );
    const sourceLanguage = this.pickFirstNonEmptyString(
      normalizedInput.sourceLanguage,
      normalizedInput.source_language,
      sourceTemplate.sourceLanguage,
      sourceTemplate.source_language
    );
    const prepareLocalizedRenderData = this.pickFirstBoolean(
      normalizedInput.prepareLocalizedRenderData,
      normalizedInput.prepare_localized_render_data,
      sourceTemplate.prepareLocalizedRenderData,
      sourceTemplate.prepare_localized_render_data
    );

    return {
      templateId: this.pickFirstNonEmptyString(
        normalizedInput.templateId,
        normalizedInput.template_id,
        sourceTemplate.templateId
      ),
      skillId: this.pickFirstNonEmptyString(
        normalizedInput.skillId,
        normalizedInput.skill_id,
        sourceTemplate.skillId
      ),
      outputFormat: this.pickFirstNonEmptyString(
        normalizedInput.outputFormat,
        normalizedInput.output_format,
        normalizedInput.format,
        sourceTemplate.format
      ),
      outputName: this.pickFirstNonEmptyString(
        normalizedInput.outputName,
        normalizedInput.output_name,
        sourceTemplate.outputName,
        sourceTemplate.output_name
      ),
      sourceLanguage,
      targetLanguages,
      prepareLocalizedRenderData:
        prepareLocalizedRenderData === undefined
          ? Boolean(sourceLanguage) || targetLanguages.length > 0
            ? true
            : undefined
          : prepareLocalizedRenderData,
      data,
    };
  }

  private async resolveDocumentRenderRequest(
    publishedSkillId: string,
    renderInput: ReturnType<CapabilityReleaseRuntimeService['resolveDocumentRenderInput']>
  ): Promise<RenderResolvedRequest> {
    const fallbackRequest: RenderResolvedRequest = {
      publishedSkillId,
      templateId: renderInput.templateId,
      skillId: renderInput.skillId,
      data: renderInput.data,
      outputFormat: renderInput.outputFormat,
      ...(renderInput.outputName ? { outputName: renderInput.outputName } : {}),
      ...(renderInput.sourceLanguage ? { sourceLanguage: renderInput.sourceLanguage } : {}),
      ...(renderInput.targetLanguages.length > 0
        ? { targetLanguages: renderInput.targetLanguages }
        : {}),
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
          ...(renderInput.targetLanguages.length > 0
            ? { targetLanguages: renderInput.targetLanguages }
            : {}),
          ...(renderInput.prepareLocalizedRenderData !== undefined
            ? { prepareLocalizedRenderData: renderInput.prepareLocalizedRenderData }
            : {}),
        },
        {
          timeout: 120000,
        }
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

  private omitRuntimeEnvelopeFields(value: Record<string, unknown>): Record<string, unknown> {
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
    const match = log.match(
      /执行(?:浏览器 Phase |共享文档渲染 |共享 HTTP 请求 |共享结构化转换 )?Activity:\s*(.+?)\s*$/
    );
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
      }
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
