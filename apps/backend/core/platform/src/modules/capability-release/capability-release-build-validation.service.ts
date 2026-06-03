import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionFlowTemplateService } from '../execution-flow/execution-flow-template.service';
import { TemporalWorkflowService } from '../temporal-workflow/temporal-workflow.service';
import { CapabilityReleaseBrowserRecordingService } from './capability-release-browser-recording.service';
import { CapabilityReleaseRuntimeService } from './capability-release-runtime.service';
import { CapabilityReleaseSkillDraftService } from './capability-release-skill-draft.service';
import { CapabilityReleaseTemporalSchemaService } from './capability-release-temporal-schema.service';
import {
  CapabilityBuildDTO,
  CapabilityBuildType,
  CapabilityReleaseDTO,
  CapabilitySourceSnapshotDTO,
  CapabilityValidationDTO,
  CreateCapabilityBuildDTO,
  GenerateSkillDraftDTO,
  SkillDraftDTO,
  ValidateCapabilityDTO,
} from './interfaces';

export interface CapabilityReleaseBuildValidationAccessors {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO>;
  getBuildOrThrow(id: string): Promise<CapabilityBuildDTO>;
  getValidationOrThrow(id: string): Promise<CapabilityValidationDTO>;
  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO>;
  getLatestSuccessfulValidationOrThrow(releaseId: string): Promise<CapabilityValidationDTO>;
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

@Injectable()
export class CapabilityReleaseBuildValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly temporalWorkflowService: TemporalWorkflowService,
    private readonly executionFlowTemplateService: ExecutionFlowTemplateService,
    private readonly capabilityReleaseRuntimeService: CapabilityReleaseRuntimeService,
    private readonly capabilityReleaseBrowserRecordingService: CapabilityReleaseBrowserRecordingService,
    private readonly capabilityReleaseSkillDraftService: CapabilityReleaseSkillDraftService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService,
  ) {}

  async build(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseBuildValidationAccessors,
  ): Promise<{ release: CapabilityReleaseDTO; build: CapabilityBuildDTO }> {
    const release = await accessors.getReleaseOrThrow(id);
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const buildId = randomUUID();
    const buildType = dto.buildType || this.getDefaultBuildType(release.sourceType);
    const modelId = dto.modelId || 'default';
    const inputSnapshot = snapshot.sourcePayload;

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        logs_json, status, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, '[]'::jsonb, 'running', now(), $7::uuid, now()
      )`,
      buildId,
      id,
      snapshot.id,
      buildType,
      modelId,
      JSON.stringify(inputSnapshot),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'building', current_build_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      id,
      buildId,
    );

    await accessors.insertAuditEvent(id, 'build_started', userId, true, `开始构建 (${buildType})`);

    try {
      const logs: string[] = [];
      let generatedCode: string | null = null;
      let generatedConfig: Record<string, unknown> | null = null;
      let diffSummary: string | null = null;

      logs.push(`[${new Date().toISOString()}] 开始构建，类型: ${buildType}`);
      logs.push(`[${new Date().toISOString()}] 模型: ${modelId}`);

      if (release.sourceType === 'temporal_workflow') {
        logs.push(`[${new Date().toISOString()}] 识别为 Temporal 工作流，开始解析 DSL`);
        const workflowDsl = this.expectRecord(inputSnapshot.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(inputSnapshot.activityDsl, '缺少 activityDsl');
        logs.push(`[${new Date().toISOString()}] 调用 AI 生成工作流代码`);
        const result = await this.temporalWorkflowService.generateWorkflowCode(
          workflowDsl as any,
          activityDsl as any,
          dto.errorContext,
        );
        if (!result.success || !result.code) {
          throw new Error(result.error || 'Temporal 工作流代码生成失败');
        }
        generatedCode = result.code;
        diffSummary = '已生成 Temporal Workflow Python 代码';
        logs.push(`[${new Date().toISOString()}] 代码生成完成，长度: ${generatedCode?.length || 0} 字符`);
      } else {
        generatedConfig = inputSnapshot;
        diffSummary = '模板型能力已固化当前配置快照，可进入验证和草案生成阶段';
        logs.push(`[${new Date().toISOString()}] 模板型能力无需代码生成，已固化配置快照`);
      }

      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET generated_code = $2,
             generated_config_json = $3::jsonb,
             diff_summary = $4,
             logs_json = $5::jsonb,
             status = 'succeeded',
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        generatedCode,
        JSON.stringify(generatedConfig),
        diffSummary,
        JSON.stringify(logs),
      );

      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'draft',
             current_build_id = $2::uuid,
             latest_successful_build_id = $2::uuid,
             updated_at = now()
         WHERE id = $1::uuid`,
        id,
        buildId,
      );

      await accessors.insertAuditEvent(id, 'build_succeeded', userId, true, `构建成功 (${buildType})`);
      return {
        release: await accessors.getReleaseOrThrow(id),
        build: await accessors.getBuildOrThrow(buildId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET status = 'failed',
             logs_json = $3::jsonb,
             error_summary = $2,
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        message,
        JSON.stringify([`[${new Date().toISOString()}] ${message}`]),
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'build_failed', updated_at = now()
         WHERE id = $1::uuid`,
        id,
      );
      await accessors.insertAuditEvent(id, 'build_failed', userId, false, `构建失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async buildStream(
    id: string,
    dto: CreateCapabilityBuildDTO,
    userId: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void,
    accessors: CapabilityReleaseBuildValidationAccessors,
  ): Promise<void> {
    const release = await accessors.getReleaseOrThrow(id);
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const buildId = randomUUID();
    const buildType = dto.buildType || this.getDefaultBuildType(release.sourceType);
    const modelId = dto.modelId || 'default';
    const inputSnapshot = snapshot.sourcePayload;
    const logs: string[] = [];
    const pushLog = (message: string) => {
      logs.push(message);
      onEvent('log', { message });
    };

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        logs_json, status, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb,
        '[]'::jsonb, 'running', now(), $7::uuid, now()
      )`,
      buildId,
      id,
      snapshot.id,
      buildType,
      modelId,
      JSON.stringify(inputSnapshot),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'building', current_build_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      id,
      buildId,
    );

    onEvent('status', {
      phase: 'started',
      releaseId: id,
      buildId,
      buildType,
      sourceType: release.sourceType,
    });
    await accessors.insertAuditEvent(id, 'build_started', userId, true, `开始构建 (${buildType})`);

    try {
      let generatedCode: string | null = null;
      let generatedConfig: Record<string, unknown> | null = null;
      let diffSummary: string | null = null;

      pushLog(`[${new Date().toISOString()}] 开始构建，类型: ${buildType}`);
      pushLog(`[${new Date().toISOString()}] 模型: ${modelId}`);

      if (release.sourceType === 'temporal_workflow') {
        onEvent('status', { phase: 'preparing_dsl', buildId });
        pushLog(`[${new Date().toISOString()}] 识别为 Temporal 工作流，开始解析 DSL`);
        const workflowDsl = this.expectRecord(inputSnapshot.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(inputSnapshot.activityDsl, '缺少 activityDsl');
        onEvent('status', { phase: 'generating_code', buildId });
        pushLog(`[${new Date().toISOString()}] 调用 AI 生成工作流代码`);
        const result = await this.temporalWorkflowService.generateWorkflowCode(
          workflowDsl as any,
          activityDsl as any,
          dto.errorContext,
        );
        if (!result.success || !result.code) {
          throw new Error(result.error || 'Temporal 工作流代码生成失败');
        }
        generatedCode = result.code;
        diffSummary = '已生成 Temporal Workflow Python 代码';
        pushLog(`[${new Date().toISOString()}] 代码生成完成，长度: ${generatedCode?.length || 0} 字符`);
      } else {
        onEvent('status', { phase: 'solidifying_config', buildId });
        generatedConfig = inputSnapshot;
        diffSummary = '模板型能力已固化当前配置快照，可进入验证和草案生成阶段';
        pushLog(`[${new Date().toISOString()}] 模板型能力无需代码生成，已固化配置快照`);
      }

      onEvent('status', { phase: 'persisting', buildId });
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET generated_code = $2,
             generated_config_json = $3::jsonb,
             diff_summary = $4,
             logs_json = $5::jsonb,
             status = 'succeeded',
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        generatedCode,
        JSON.stringify(generatedConfig),
        diffSummary,
        JSON.stringify(logs),
      );

      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'draft',
             current_build_id = $2::uuid,
             latest_successful_build_id = $2::uuid,
             updated_at = now()
         WHERE id = $1::uuid`,
        id,
        buildId,
      );

      await accessors.insertAuditEvent(id, 'build_succeeded', userId, true, `构建成功 (${buildType})`);
      onEvent('complete', {
        release: await accessors.getReleaseOrThrow(id) as unknown as Record<string, unknown>,
        build: await accessors.getBuildOrThrow(buildId) as unknown as Record<string, unknown>,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      logs.push(`[${new Date().toISOString()}] ${message}`);
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_builds
         SET status = 'failed',
             logs_json = $3::jsonb,
             error_summary = $2,
             finished_at = now()
         WHERE id = $1::uuid`,
        buildId,
        message,
        JSON.stringify(logs),
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'build_failed', updated_at = now()
         WHERE id = $1::uuid`,
        id,
      );
      await accessors.insertAuditEvent(id, 'build_failed', userId, false, `构建失败: ${message}`);
      onEvent('error', {
        message,
        release: await accessors.getReleaseOrThrow(id) as unknown as Record<string, unknown>,
        build: await accessors.getBuildOrThrow(buildId) as unknown as Record<string, unknown>,
      });
    }
  }

  async validateStatic(
    id: string,
    dto: ValidateCapabilityDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseBuildValidationAccessors,
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    const release = await accessors.getReleaseOrThrow(id);
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const build = await this.resolveBuildForValidation(release, snapshot, dto.buildId, userId, accessors);
    const preserveReleaseStatus = this.shouldPreserveReleaseStatusDuringValidation(release);
    const validationId = await this.createValidationRecord(
      id,
      build.id,
      'static',
      dto.input,
      userId,
      !preserveReleaseStatus,
    );

    await accessors.insertAuditEvent(id, 'validation_started', userId, true, '开始静态校验');

    try {
      let resultSnapshot: Record<string, unknown>;
      let logs: string[];
      let success: boolean;
      let score: number;
      let errorSummary: string | null = null;

      if (release.sourceType === 'temporal_workflow') {
        const workflowDsl = this.expectRecord(snapshot.sourcePayload.workflowDsl, '缺少 workflowDsl');
        const activityDsl = this.expectRecord(snapshot.sourcePayload.activityDsl, '缺少 activityDsl');
        const result = await this.temporalWorkflowService.validate(
          workflowDsl as any,
          activityDsl as any,
        );
        success = result.isValid;
        score = result.score;
        resultSnapshot = result as unknown as Record<string, unknown>;
        logs = [
          ...result.errors.map((item: string) => `[Error] ${item}`),
          ...result.warnings.map((item: string) => `[Warning] ${item}`),
        ];
        errorSummary = result.errors[0] || null;
      } else {
        const result = this.validateExecutionFlowPayload(snapshot.sourcePayload);
        success = result.isValid;
        score = result.score;
        resultSnapshot = result as unknown as Record<string, unknown>;
        logs = [
          ...result.errors.map((item) => `[Error] ${item}`),
          ...result.warnings.map((item) => `[Warning] ${item}`),
        ];
        errorSummary = result.errors[0] || null;
      }

      await this.finishValidation(
        validationId,
        id,
        success ? 'draft_ready' : 'validation_failed',
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
        preserveReleaseStatus,
      );

      await accessors.insertAuditEvent(
        id,
        success ? 'validation_succeeded' : 'validation_failed',
        userId,
        success,
        success ? '静态校验通过' : `静态校验失败: ${errorSummary || '未知错误'}`,
      );

      return {
        release: await accessors.getReleaseOrThrow(id),
        validation: await accessors.getValidationOrThrow(validationId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishValidation(
        validationId,
        id,
        'validation_failed',
        false,
        0,
        [`[Error] ${message}`],
        null,
        message,
      );
      await accessors.insertAuditEvent(id, 'validation_failed', userId, false, `静态校验失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async validateSandbox(
    id: string,
    dto: ValidateCapabilityDTO,
    userId: string | undefined,
    authToken: string | undefined,
    accessors: CapabilityReleaseBuildValidationAccessors,
  ): Promise<{ release: CapabilityReleaseDTO; validation: CapabilityValidationDTO }> {
    const release = await accessors.getReleaseOrThrow(id);
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const build = await this.resolveBuildForValidation(release, snapshot, dto.buildId, userId, accessors);
    const preserveReleaseStatus = this.shouldPreserveReleaseStatusDuringValidation(release);
    const validationId = await this.createValidationRecord(
      id,
      build.id,
      'sandbox',
      dto.input,
      userId,
      !preserveReleaseStatus,
    );

    await accessors.insertAuditEvent(id, 'validation_started', userId, true, '开始 Sandbox 校验');

    try {
      let success = false;
      let score = 0;
      let logs: string[] = [];
      let resultSnapshot: Record<string, unknown> | null = null;
      let errorSummary: string | null = null;
      const testCasesFromRequest = Array.isArray(dto.testCases)
        ? dto.testCases.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
        : [];
      const naturalLanguageCases = testCasesFromRequest.length > 0
        ? testCasesFromRequest
        : (dto.testUserInput?.trim() ? [dto.testUserInput.trim()] : []);
      const templateId = this.resolveExecutionTemplateIdForRuntime(release, snapshot);

      if (release.sourceType === 'temporal_workflow') {
        if (naturalLanguageCases.length > 0 && (!dto.input || Object.keys(dto.input).length === 0)) {
          if (!release.publishedSkillId) {
            throw new Error('请先发布 Skill，再使用自然语言进行真实验证');
          }
          const caseResults: Array<{
            caseIndex: number;
            testUserInput: string;
            success: boolean;
            score: number;
            error?: string;
            logs: string[];
            result?: Record<string, unknown> | null;
          }> = [];

          for (let i = 0; i < naturalLanguageCases.length; i += 1) {
            const currentCase = naturalLanguageCases[i] as string;
            const runtimeResult = await this.capabilityReleaseRuntimeService
              .executePublishedSkillByPromptForValidation(
                release.publishedSkillId,
                currentCase,
                authToken,
              );
            caseResults.push({
              caseIndex: i + 1,
              testUserInput: currentCase,
              success: runtimeResult.success,
              score: runtimeResult.success ? 100 : 50,
              ...(runtimeResult.error ? { error: runtimeResult.error } : {}),
              logs: runtimeResult.logs,
              result: runtimeResult.result ?? null,
            });
          }

          const passedCases = caseResults.filter((item) => item.success).length;
          success = passedCases === caseResults.length;
          score = caseResults.length > 0 ? Math.round((passedCases / caseResults.length) * 100) : 0;
          logs = caseResults.flatMap((item) => [
            `[Case ${item.caseIndex}] ${item.testUserInput}`,
            ...item.logs.map((line) => `[Case ${item.caseIndex}] ${line}`),
          ]);
          resultSnapshot = {
            mode: 'nl_task_runtime_batch',
            totalCases: caseResults.length,
            passedCases,
            caseResults,
          };
          const firstError = caseResults.find((item) => !item.success)?.error;
          errorSummary = firstError || null;
        } else {
          if (!build.generatedCode) {
            throw new Error('当前构建没有可执行代码，请先完成代码生成');
          }
          const fn = dto.fn || accessors.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
          const result = await this.temporalWorkflowService.validateWorkflowReal(
            build.generatedCode,
            fn,
            dto.input,
          );
          success = result.success;
          score = result.score;
          logs = result.logs;
          resultSnapshot = {
            result: result.result ?? null,
            error: result.error ?? null,
            fn,
          };
          errorSummary = result.error || null;
        }
      } else if (release.sourceType === 'browser_recording') {
        const result = this.capabilityReleaseBrowserRecordingService.validateSnapshot(snapshot, {
          input: dto.input,
          testCases: naturalLanguageCases,
        });
        success = result.success;
        score = result.score;
        logs = result.logs;
        resultSnapshot = result.resultSnapshot;
        errorSummary = result.errorSummary;
      } else if (templateId) {
        const validation = await this.executionFlowTemplateService.validateTemplate(
          templateId,
          undefined,
          dto.input,
          true,
          dto.testUserInput,
        );
        success = validation.isValid;
        score = validation.score || 0;
        logs = validation.details?.executionTest?.log || [];
        resultSnapshot = validation as unknown as Record<string, unknown>;
        errorSummary = validation.warnings?.[0] || null;
      } else {
        throw new Error('模板/浏览器能力缺少可用模板标识，无法执行 Sandbox 校验');
      }

      await this.finishValidation(
        validationId,
        id,
        success ? 'draft_ready' : 'validation_failed',
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
        preserveReleaseStatus,
      );

      await accessors.insertAuditEvent(
        id,
        success ? 'validation_succeeded' : 'validation_failed',
        userId,
        success,
        success ? 'Sandbox 校验通过' : `Sandbox 校验失败: ${errorSummary || '未知错误'}`,
      );

      return {
        release: await accessors.getReleaseOrThrow(id),
        validation: await accessors.getValidationOrThrow(validationId),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishValidation(
        validationId,
        id,
        'validation_failed',
        false,
        0,
        [`[Error] ${message}`],
        null,
        message,
      );
      await accessors.insertAuditEvent(id, 'validation_failed', userId, false, `Sandbox 校验失败: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async validateSandboxStream(
    id: string,
    dto: ValidateCapabilityDTO,
    userId: string | undefined,
    onEvent: (event: string, payload: Record<string, unknown>) => void,
    accessors: CapabilityReleaseBuildValidationAccessors,
  ): Promise<void> {
    const release = await accessors.getReleaseOrThrow(id);
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const build = await this.resolveBuildForValidation(release, snapshot, dto.buildId, userId, accessors);
    const validationId = await this.createValidationRecord(id, build.id, 'sandbox', dto.input, userId);

    onEvent('status', {
      phase: 'started',
      releaseId: id,
      validationId,
      buildId: build.id,
      sourceType: release.sourceType,
    });

    await accessors.insertAuditEvent(id, 'validation_started', userId, true, '开始 Sandbox 校验');

    try {
      let success = false;
      let score = 0;
      let logs: string[] = [];
      let resultSnapshot: Record<string, unknown> | null = null;
      let errorSummary: string | null = null;
      const streamedLogs: string[] = [];
      const testCasesFromRequest = Array.isArray(dto.testCases)
        ? dto.testCases.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
        : [];
      const naturalLanguageCases = testCasesFromRequest.length > 0
        ? testCasesFromRequest
        : (dto.testUserInput?.trim() ? [dto.testUserInput.trim()] : []);
      const templateId = this.resolveExecutionTemplateIdForRuntime(release, snapshot);

      if (release.sourceType === 'temporal_workflow') {
        if (!build.generatedCode) {
          throw new Error('当前构建没有可执行代码，请先完成代码生成');
        }
        const fn = dto.fn || accessors.resolveWorkflowFnOrThrow(snapshot.sourcePayload);
        onEvent('status', {
          phase: 'executing',
          runtime: 'temporal_workflow',
          fn,
        });
        const result = await this.temporalWorkflowService.validateWorkflowRealStreaming(
          build.generatedCode,
          fn,
          dto.input as Record<string, any> | undefined,
          undefined,
          undefined,
          (log: string) => {
            streamedLogs.push(log);
            onEvent('log', { message: log });
          },
        );
        success = result.success;
        score = result.score;
        logs = streamedLogs.length > 0 ? streamedLogs : result.logs || [];
        resultSnapshot = {
          result: result.result ?? null,
          error: result.error ?? null,
          traceback: result.traceback ?? null,
          fn,
        };
        errorSummary = result.error || null;
      } else if (release.sourceType === 'browser_recording') {
        onEvent('status', {
          phase: 'executing',
          runtime: 'browser_recording',
          note: '当前浏览器录制能力通过静态快照校验回放日志',
        });
        const result = this.capabilityReleaseBrowserRecordingService.validateSnapshot(snapshot, {
          input: dto.input,
          testCases: naturalLanguageCases,
        });
        success = result.success;
        score = result.score;
        logs = result.logs;
        for (const log of logs) {
          onEvent('log', { message: log });
        }
        resultSnapshot = result.resultSnapshot;
        errorSummary = result.errorSummary;
      } else if (templateId) {
        onEvent('status', {
          phase: 'executing',
          runtime: 'flow_runtime',
          note: '当前模板型能力通过同步校验结果回放日志',
        });
        const validation = await this.executionFlowTemplateService.validateTemplate(
          templateId,
          undefined,
          dto.input,
          true,
          dto.testUserInput,
        );
        success = validation.isValid;
        score = validation.score || 0;
        logs = validation.details?.executionTest?.log || [];
        for (const log of logs) {
          onEvent('log', { message: log });
        }
        resultSnapshot = validation as unknown as Record<string, unknown>;
        errorSummary = validation.warnings?.[0] || null;
      } else {
        throw new Error('模板/浏览器能力缺少可用模板标识，无法执行 Sandbox 校验');
      }

      await this.finishValidation(
        validationId,
        id,
        success ? 'draft_ready' : 'validation_failed',
        success,
        score,
        logs,
        resultSnapshot,
        errorSummary,
      );

      await accessors.insertAuditEvent(
        id,
        success ? 'validation_succeeded' : 'validation_failed',
        userId,
        success,
        success ? 'Sandbox 校验通过' : `Sandbox 校验失败: ${errorSummary || '未知错误'}`,
      );

      const finalRelease = await accessors.getReleaseOrThrow(id);
      const finalValidation = await accessors.getValidationOrThrow(validationId);
      onEvent('complete', {
        release: finalRelease as unknown as Record<string, unknown>,
        validation: finalValidation as unknown as Record<string, unknown>,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.finishValidation(
        validationId,
        id,
        'validation_failed',
        false,
        0,
        [`[Error] ${message}`],
        null,
        message,
      );
      await accessors.insertAuditEvent(id, 'validation_failed', userId, false, `Sandbox 校验失败: ${message}`);
      const failedRelease = await accessors.getReleaseOrThrow(id);
      const failedValidation = await accessors.getValidationOrThrow(validationId);
      onEvent('error', {
        message,
        release: failedRelease as unknown as Record<string, unknown>,
        validation: failedValidation as unknown as Record<string, unknown>,
      });
    }
  }

  async generateSkillDraft(
    id: string,
    dto: GenerateSkillDraftDTO,
    userId: string | undefined,
    accessors: CapabilityReleaseBuildValidationAccessors,
  ): Promise<{ release: CapabilityReleaseDTO; skillDraft: SkillDraftDTO }> {
    const release = await accessors.getReleaseOrThrow(id);
    const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
    const validation = dto.validationId
      ? await accessors.getValidationOrThrow(dto.validationId)
      : await accessors.getLatestSuccessfulValidationOrThrow(id);

    const draftPayload = this.capabilityReleaseSkillDraftService
      .buildSkillDraftPayload(release, snapshot, validation);
    const draftId = randomUUID();

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO skill_drafts (
        id, release_id, generated_from_build_id, generated_from_validation_id, source_type,
        name, description, trigger_keywords, params_schema, execution_flow_template_ids,
        tools, api_endpoints, draft_payload_json, status, created_by, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
        $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
        $11::jsonb, $12::jsonb, $13::jsonb, 'draft', $14::uuid, now(), now()
      )`,
      draftId,
      id,
      validation.buildId,
      validation.id,
      release.sourceType,
      draftPayload.name,
      draftPayload.description,
      JSON.stringify(draftPayload.triggerKeywords),
      JSON.stringify(draftPayload.paramsSchema),
      JSON.stringify(draftPayload.executionFlowTemplateIds),
      JSON.stringify(draftPayload.tools),
      JSON.stringify(draftPayload.apiEndpoints || null),
      JSON.stringify(draftPayload),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_skill_draft_id = $2::uuid,
           status = 'pending_approval',
           approval_status = 'pending',
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      draftId,
    );

    await accessors.insertAuditEvent(id, 'skill_draft_generated', userId, true, '生成 Skill 草案');
    return {
      release: await accessors.getReleaseOrThrow(id),
      skillDraft: await accessors.getSkillDraftOrThrow(draftId),
    };
  }

  private getDefaultBuildType(sourceType: string): CapabilityBuildType {
    return sourceType === 'temporal_workflow' ? 'codegen_workflow' : 'config_enhancement';
  }

  private async createValidationRecord(
    releaseId: string,
    buildId: string,
    validationType: 'static' | 'sandbox' | 'post_deploy_smoke',
    input: Record<string, unknown> | undefined,
    userId?: string,
    updateReleaseStatus = true,
  ): Promise<string> {
    const validationId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_validations (
        id, release_id, build_id, validation_type, input_snapshot_json,
        logs_json, score, success, started_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb,
        '[]'::jsonb, 0, false, now(), $6::uuid, now()
      )`,
      validationId,
      releaseId,
      buildId,
      validationType,
      JSON.stringify(input || null),
      userId || null,
    );
    if (updateReleaseStatus) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET status = 'validating', latest_validation_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        validationId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET latest_validation_id = $2::uuid, updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        validationId,
      );
    }
    return validationId;
  }

  private async finishValidation(
    validationId: string,
    releaseId: string,
    releaseStatus: string,
    success: boolean,
    score: number,
    logs: string[],
    resultSnapshot: Record<string, unknown> | null,
    errorSummary: string | null,
    preserveReleaseStatus = false,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_validations
       SET result_snapshot_json = $2::jsonb,
           logs_json = $3::jsonb,
           score = $4,
           success = $5,
           error_summary = $6,
           finished_at = now()
       WHERE id = $1::uuid`,
      validationId,
      JSON.stringify(resultSnapshot),
      JSON.stringify(logs),
      score,
      success,
      errorSummary,
    );

    if (preserveReleaseStatus) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE capability_releases
         SET latest_validation_id = $2::uuid,
             latest_successful_validation_id = CASE WHEN $3 THEN $2::uuid ELSE latest_successful_validation_id END,
             updated_at = now()
         WHERE id = $1::uuid`,
        releaseId,
        validationId,
        success,
      );
      return;
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = $2,
           latest_validation_id = $3::uuid,
           latest_successful_validation_id = CASE WHEN $4 THEN $3::uuid ELSE latest_successful_validation_id END,
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      releaseStatus,
      validationId,
      success,
    );
  }

  private shouldPreserveReleaseStatusDuringValidation(release: CapabilityReleaseDTO): boolean {
    return (
      Boolean(release.publishedSkillId) ||
      ['published', 'deploying', 'deployed', 'rolled_back'].includes(release.status) ||
      ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus)
    );
  }

  private async resolveBuildForValidation(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
    buildId: string | undefined,
    userId: string | undefined,
    accessors: CapabilityReleaseBuildValidationAccessors,
  ): Promise<CapabilityBuildDTO> {
    if (release.sourceType === 'temporal_workflow') {
      return accessors.resolveTemporalExecutableBuildOrThrow(release, snapshot, buildId, userId);
    }

    if (buildId) {
      return accessors.getBuildOrThrow(buildId);
    }
    if (release.currentBuildId) {
      return accessors.getBuildOrThrow(release.currentBuildId);
    }

    const syntheticBuildId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO capability_builds (
        id, release_id, source_snapshot_id, build_type, model_id, input_snapshot_json,
        generated_config_json, status, started_at, finished_at, created_by, created_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'config_enhancement', 'system', $4::jsonb,
        $5::jsonb, 'succeeded', now(), now(), $6::uuid, now()
      )`,
      syntheticBuildId,
      release.id,
      snapshot.id,
      JSON.stringify(snapshot.sourcePayload),
      JSON.stringify(snapshot.sourcePayload),
      userId || null,
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_build_id = $2::uuid, latest_successful_build_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      release.id,
      syntheticBuildId,
    );

    return accessors.getBuildOrThrow(syntheticBuildId);
  }

  private resolveExecutionTemplateIdForRuntime(
    release: CapabilityReleaseDTO,
    snapshot: CapabilitySourceSnapshotDTO,
  ): string | null {
    if (release.sourceType === 'temporal_workflow') {
      return null;
    }
    if (release.sourceId && release.sourceId.trim()) {
      return release.sourceId.trim();
    }
    const payload = snapshot.sourcePayload && typeof snapshot.sourcePayload === 'object'
      ? snapshot.sourcePayload as Record<string, unknown>
      : {};
    const sourceTemplate = payload.sourceTemplate && typeof payload.sourceTemplate === 'object'
      ? payload.sourceTemplate as Record<string, unknown>
      : {};
    const fromTemplate = sourceTemplate.templateId;
    if (typeof fromTemplate === 'string' && fromTemplate.trim()) {
      return fromTemplate.trim();
    }
    const fromPayloadId = payload.id;
    if (typeof fromPayloadId === 'string' && fromPayloadId.trim()) {
      return fromPayloadId.trim();
    }
    return null;
  }

  private validateExecutionFlowPayload(payload: Record<string, unknown>) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const steps = Array.isArray(payload.steps) ? payload.steps : [];
    const paramsSchema = this.parseJson(payload.paramsSchema) as Record<string, unknown>;

    if (!payload.name || typeof payload.name !== 'string') {
      errors.push('模板名称不能为空');
    }
    if (steps.length === 0) {
      errors.push('至少需要一个流程步骤');
    }
    steps.forEach((step, index) => {
      const record = this.parseJson(step) as Record<string, unknown>;
      if (!record.name) {
        errors.push(`步骤 ${index + 1} 缺少名称`);
      }
      if (!record.type) {
        errors.push(`步骤 ${index + 1} 缺少类型`);
      }
      if (record.type === 'api' && !(record.api as Record<string, unknown> | undefined)?.endpoint) {
        errors.push(`步骤 ${index + 1} 的 API endpoint 不能为空`);
      }
    });
    if (!paramsSchema || typeof paramsSchema !== 'object') {
      warnings.push('未配置 paramsSchema，后续参数提取能力会受限');
    }

    const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 5);
    return {
      isValid: errors.length === 0,
      score,
      errors,
      warnings,
    };
  }

  private expectRecord(value: unknown, errorMessage: string): Record<string, unknown> {
    const record = this.parseJson(value);
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new BadRequestException(errorMessage);
    }
    return record as Record<string, unknown>;
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
}
