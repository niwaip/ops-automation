import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import {
  getCarboneExternalUrl,
  getControlPlaneApiUrl,
  getTemporalUiUrl,
} from '../config/service-endpoints';
import type { ReleaseManagerActivityExecutionPort } from '../platform-runtime.ports';
import { CapabilityReleaseBrowserRuntimeService } from './capability-release-browser-runtime.service';
import { CapabilityReleaseDocumentRuntimeService } from './capability-release-document-runtime.service';
import {
  CapabilityPublishedSkillRuntimeContext,
  ReleaseRuntimeBindingService,
} from './release-runtime-binding.service';
import {
  CapabilityBuildDTO,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  ExecuteCapabilityRuntimeDTO,
  ExecuteCapabilityRuntimeResultDTO,
} from '../interfaces';
import { RELEASE_MANAGER_ACTIVITY_EXECUTION } from '../platform-runtime.tokens';

export { CapabilityPublishedSkillRuntimeContext };

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
    @Inject(RELEASE_MANAGER_ACTIVITY_EXECUTION)
    private readonly activityExecutionService: ReleaseManagerActivityExecutionPort,
    private readonly releaseRuntimeBindingService: ReleaseRuntimeBindingService,
    private readonly capabilityReleaseDocumentRuntimeService: CapabilityReleaseDocumentRuntimeService,
    private readonly capabilityReleaseBrowserRuntimeService: CapabilityReleaseBrowserRuntimeService
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
    return this.releaseRuntimeBindingService.getPublishedSkillRuntimeContext(skillId);
  }

  async executePublishedSkill(
    skillId: string,
    input: Record<string, unknown> | undefined,
    userId: string | undefined,
    options: CapabilityReleaseRuntimeExecutionOptions | undefined,
    accessors: CapabilityReleaseRuntimeAccessors
  ): Promise<ExecuteCapabilityRuntimeResultDTO> {
    const release = await this.releaseRuntimeBindingService.getReleaseByPublishedSkillOrThrow(skillId);
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
      const result = await this.activityExecutionService.executeCodeStreaming(
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
      return this.capabilityReleaseDocumentRuntimeService.executePublishedSkill(
        release,
        skillId,
        input,
        userId,
        options,
        accessors
      );
    }

    if (release.sourceType === 'browser_recording') {
      return this.capabilityReleaseBrowserRuntimeService.executePublishedSkill(
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
}
