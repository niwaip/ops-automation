import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CapabilityReleaseRecorderBridgeCompilerService } from '../compiler/capability-release-recorder-bridge-compiler.service';
import { BrowserRecordingExecutionPlanValidatorService } from '../validator/browser-recording-execution-plan-validator.service';
import { CAPABILITY_RELEASE_ERROR_CODE } from '../capability-release.constants';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';
import { CapabilityReleaseSkillPublisherService } from './capability-release-skill-publisher.service';
import { CapabilityReleasePublishWriterService } from './capability-release-publish-writer.service';
import { CapabilityReleasePublishValidatorService } from '../validator/capability-release-publish-validator.service';
import { CapabilityAttestationService } from '../attestation/capability-attestation.service';
import { CapabilityFixtureService } from '../fixture/capability-fixture.service';
import {
  ApproveCapabilityReleaseDTO,
  BridgeRecorderExportDTO,
  BridgeRecorderExportResultDTO,
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CapabilitySourceSnapshotDTO,
  CreateCapabilityReleaseDTO,
  PublishSkillDraftDTO,
  SkillDraftDTO,
  UpdateCapabilitySourceDTO,
  UpdateSkillDraftDTO,
} from '../interfaces';

type ExceptionLike = Error & {
  name: string;
  status: number;
  response: string | Record<string, unknown>;
};

function createBadRequestException(response: string | Record<string, unknown>): ExceptionLike {
  const message =
    typeof response === 'string' ? response : String((response as Record<string, unknown>).message ?? 'Bad Request');
  const error = new Error(message) as ExceptionLike;
  error.name = 'BadRequestException';
  error.status = 400;
  error.response = response;
  return error;
}

function createNotFoundException(response: string | Record<string, unknown>): ExceptionLike {
  const message =
    typeof response === 'string' ? response : String((response as Record<string, unknown>).message ?? 'Not Found');
  const error = new Error(message) as ExceptionLike;
  error.name = 'NotFoundException';
  error.status = 404;
  error.response = response;
  return error;
}

export interface CapabilityReleasePublishAccessors {
  getReleaseOrThrow(id: string): Promise<CapabilityReleaseDTO>;
  getSkillDraftOrThrow(id: string): Promise<SkillDraftDTO>;
  getCurrentSnapshotOrThrow(release: CapabilityReleaseDTO): Promise<CapabilitySourceSnapshotDTO>;
  getCapabilityDetail(id: string): Promise<CapabilityReleaseDetailDTO>;
  createCapability(
    dto: CreateCapabilityReleaseDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO>;
  updateSource(
    id: string,
    dto: UpdateCapabilitySourceDTO,
    userId?: string
  ): Promise<CapabilityReleaseDetailDTO>;
  insertAuditEvent(
    releaseId: string,
    eventType: string,
    actorId: string | undefined,
    success: boolean,
    summary: string,
    details?: Record<string, unknown>
  ): Promise<void>;
}

@Injectable()
export class CapabilityReleasePublishService {
  private readonly logger = new Logger(CapabilityReleasePublishService.name);

  constructor(
    private readonly capabilityReleaseRecorderBridgeCompilerService: CapabilityReleaseRecorderBridgeCompilerService,
    private readonly browserRecordingExecutionPlanValidatorService: BrowserRecordingExecutionPlanValidatorService,
    private readonly capabilityReleasePublishValidatorService: CapabilityReleasePublishValidatorService,
    private readonly capabilityReleasePublishWriterService: CapabilityReleasePublishWriterService,
    private readonly capabilityReleaseSkillPublisherService: CapabilityReleaseSkillPublisherService,
    @Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort,
    private readonly capabilityAttestationService: CapabilityAttestationService,
    private readonly capabilityFixtureService: CapabilityFixtureService
  ) {}

  async bridgeRecorderExport(
    dto: BridgeRecorderExportDTO,
    userId: string | undefined,
    accessors: CapabilityReleasePublishAccessors
  ): Promise<BridgeRecorderExportResultDTO> {
    const publishPayload = dto.exportArtifacts?.skillDraft?.publishPayload;
    if (!publishPayload || typeof publishPayload !== 'object' || Array.isArray(publishPayload)) {
      throw createBadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.MISSING_PUBLISH_PAYLOAD,
        message: '缺少 exportArtifacts.skillDraft.publishPayload',
      });
    }

    const { normalizedPayload, sourcePayload, draftPayload, sourceName } =
      this.capabilityReleaseRecorderBridgeCompilerService.compileRecorderBridge(dto);
    this.reportRuntimeLoopMismatchDebug('A', 'bridgeRecorderExport received publish payload', {
      releaseId: dto.releaseId || null,
      exportArtifactId:
        this.asDebugRecord(dto.exportArtifacts as Record<string, unknown> | undefined)
          ?.exportArtifactId || null,
      publishPayloadRuntimeMetadata:
        this.asDebugRecord(this.asDebugRecord(publishPayload)?.apiEndpoints)?.runtimeMetadata || null,
      publishPayloadExecutionPlan:
        this.asDebugRecord(
          this.asDebugRecord(
            this.asDebugRecord(this.asDebugRecord(publishPayload)?.apiEndpoints)?.runtimeMetadata
          )?.executionPlan
        ) || null,
      publishPayloadHasLoopDraft: Boolean(
        this.asDebugRecord(
          this.asDebugRecord(
            this.asDebugRecord(
              this.asDebugRecord(this.asDebugRecord(publishPayload)?.apiEndpoints)?.runtimeMetadata
            )?.executionPlan
          )?.loopDraft
        )
      ),
      normalizedRuntimeMetadata:
        this.asDebugRecord(this.asDebugRecord(normalizedPayload.apiEndpoints)?.runtimeMetadata) || null,
      normalizedExecutionPlan:
        this.asDebugRecord(
          this.asDebugRecord(
            this.asDebugRecord(normalizedPayload.apiEndpoints)?.runtimeMetadata
          )?.executionPlan
        ) || null,
      normalizedHasLoopDraft: Boolean(
        this.asDebugRecord(
          this.asDebugRecord(
            this.asDebugRecord(normalizedPayload.apiEndpoints)?.runtimeMetadata
          )?.executionPlan
        ) &&
          this.asDebugRecord(
            this.asDebugRecord(
              this.asDebugRecord(normalizedPayload.apiEndpoints)?.runtimeMetadata
            )?.executionPlan
          )?.loopDraft
      ),
    });
    const bridgeValidation =
      this.browserRecordingExecutionPlanValidatorService.validateForBridge(normalizedPayload);
    if (!bridgeValidation.valid) {
      throw createBadRequestException({
        code: 'invalid_source_payload',
        message: 'Recorder export 的 executionPlan 校验失败',
        planValidation: bridgeValidation,
      });
    }

    let releaseId = dto.releaseId;
    if (releaseId) {
      const existing = await accessors.getReleaseOrThrow(releaseId);
      if (existing.sourceType !== 'browser_recording') {
        throw createBadRequestException({
          code: CAPABILITY_RELEASE_ERROR_CODE.INVALID_RELEASE_TYPE,
          message: 'bridge 仅支持 browser_recording 类型 release',
          expected: 'browser_recording',
          actual: existing.sourceType,
        });
      }
      await accessors.updateSource(releaseId, { sourceName, sourcePayload }, userId);
    } else {
      const created = await accessors.createCapability(
        {
          sourceType: 'browser_recording',
          sourceName,
          sourcePayload,
        },
        userId
      );
      releaseId = created.release.id;
    }

    const release = await accessors.getReleaseOrThrow(releaseId);
    this.reportRuntimeLoopMismatchDebug(
      'B',
      'bridgeRecorderExport prepared sourcePayload and draftPayload',
      {
        releaseId,
        sourcePayloadRuntimeMetadata: this.asDebugRecord(sourcePayload.runtimeMetadata) || null,
        draftPayloadRuntimeMetadata:
          this.asDebugRecord(this.asDebugRecord(draftPayload.apiEndpoints)?.runtimeMetadata) || null,
        draftPayloadExecutionPlan:
          this.asDebugRecord(
            this.asDebugRecord(
              this.asDebugRecord(draftPayload.apiEndpoints)?.runtimeMetadata
            )?.executionPlan
          ) || null,
        draftPayloadHasLoopDraft: Boolean(
          this.asDebugRecord(
            this.asDebugRecord(
              this.asDebugRecord(draftPayload.apiEndpoints)?.runtimeMetadata
            )?.executionPlan
          ) &&
            this.asDebugRecord(
              this.asDebugRecord(
                this.asDebugRecord(draftPayload.apiEndpoints)?.runtimeMetadata
              )?.executionPlan
            )?.loopDraft
        ),
      }
    );

    const draftId = randomUUID();
    await this.capabilityReleasePublishWriterService.createBridgeSkillDraftAndMarkPendingApproval({
      draftId,
      releaseId,
      sourceType: release.sourceType,
      name: normalizedPayload.name,
      description: normalizedPayload.description,
      triggerKeywords: normalizedPayload.triggerKeywords,
      paramsSchema: normalizedPayload.paramsSchema,
      executionFlowTemplateIds: normalizedPayload.executionFlowTemplateIds,
      tools: normalizedPayload.tools,
      apiEndpoints: normalizedPayload.apiEndpoints,
      draftPayload,
      userId,
    });

    await accessors.insertAuditEvent(
      releaseId,
      'recorder_export_bridged',
      userId,
      true,
      'Recorder 导出结果已桥接为 Skill 草案',
      {
        bridgeMode: 'browser_recording_native',
        commandCount: Array.isArray(dto.exportArtifacts?.commands)
          ? dto.exportArtifacts.commands.length
          : 0,
      }
    );

    return {
      release: await accessors.getReleaseOrThrow(releaseId),
      skillDraft: await accessors.getSkillDraftOrThrow(draftId),
      bridgeMode: 'browser_recording_native',
    };
  }

  async updateSkillDraft(
    id: string,
    dto: UpdateSkillDraftDTO,
    userId: string | undefined,
    accessors: CapabilityReleasePublishAccessors
  ): Promise<SkillDraftDTO> {
    const release = await accessors.getReleaseOrThrow(id);
    if (!release.currentSkillDraftId) {
      throw createNotFoundException('当前 Release 没有 Skill 草案');
    }
    const draft = await accessors.getSkillDraftOrThrow(release.currentSkillDraftId);
    const payload = {
      ...draft.draftPayload,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.triggerKeywords !== undefined ? { triggerKeywords: dto.triggerKeywords } : {}),
      ...(dto.paramsSchema !== undefined ? { paramsSchema: dto.paramsSchema } : {}),
      ...(dto.executionFlow !== undefined ? { executionFlow: dto.executionFlow } : {}),
      ...(dto.executionFlowTemplateIds !== undefined
        ? { executionFlowTemplateIds: dto.executionFlowTemplateIds }
        : {}),
      ...(dto.tools !== undefined ? { tools: dto.tools } : {}),
      ...(dto.apiEndpoints !== undefined ? { apiEndpoints: dto.apiEndpoints } : {}),
    };

    await this.capabilityReleasePublishWriterService.updateSkillDraftAndMarkPendingApproval(id, {
      draftId: draft.id,
      name: payload.name,
      description: payload.description,
      triggerKeywords: payload.triggerKeywords,
      paramsSchema: payload.paramsSchema,
      executionFlowTemplateIds: payload.executionFlowTemplateIds,
      tools: payload.tools,
      apiEndpoints: payload.apiEndpoints,
      draftPayload: payload,
    });

    await accessors.insertAuditEvent(id, 'skill_draft_updated', userId, true, '更新 Skill 草案');
    return accessors.getSkillDraftOrThrow(draft.id);
  }

  async approveRelease(
    id: string,
    dto: ApproveCapabilityReleaseDTO,
    userId: string | undefined,
    accessors: CapabilityReleasePublishAccessors
  ): Promise<CapabilityReleaseDetailDTO> {
    const release = await accessors.getReleaseOrThrow(id);
    if (!['draft_ready', 'pending_approval', 'approved'].includes(release.status)) {
      throw createBadRequestException('当前 Release 不处于可审批状态');
    }

    const approved = dto.decision === 'approved';
    await this.capabilityReleasePublishWriterService.updateReleaseApproval(
      id,
      approved ? 'approved' : 'draft',
      approved ? 'approved' : 'rejected'
    );

    await accessors.insertAuditEvent(
      id,
      approved ? 'approval_approved' : 'approval_rejected',
      userId,
      approved,
      dto.comment || (approved ? '审批通过' : '审批拒绝'),
      { decision: dto.decision, comment: dto.comment || null }
    );

    return accessors.getCapabilityDetail(id);
  }

  async publishSkill(
    id: string,
    dto: PublishSkillDraftDTO | undefined,
    userId: string | undefined,
    accessors: CapabilityReleasePublishAccessors
  ): Promise<{ release: CapabilityReleaseDTO; publishedSkillId: string }> {
    const safeDto: PublishSkillDraftDTO = dto ?? {};
    const release = await accessors.getReleaseOrThrow(id);
    if (release.approvalStatus === 'pending' || release.status === 'pending_approval') {
      throw createBadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.RELEASE_APPROVAL_PENDING,
        message: '当前 Release 尚未审批通过',
      });
    }
    if (release.approvalStatus === 'rejected') {
      throw createBadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.RELEASE_APPROVAL_REJECTED,
        message: '当前 Release 审批未通过，请调整草案后重新提交',
      });
    }

    const draftId = safeDto.draftId || release.currentSkillDraftId;
    if (!draftId) {
      throw createNotFoundException({
        code: CAPABILITY_RELEASE_ERROR_CODE.SKILL_DRAFT_NOT_FOUND,
        message: '没有可发布的 Skill 草案',
      });
    }

    const draft = await accessors.getSkillDraftOrThrow(draftId);
    const snapshot = ['browser_recording', 'temporal_workflow'].includes(release.sourceType)
      ? await accessors.getCurrentSnapshotOrThrow(release)
      : undefined;
    const { normalizedDraftPayload, blocker, compatibility, lint } =
      await this.capabilityReleasePublishValidatorService.validatePublishDraft(
        release,
        draft,
        snapshot
      );

    if (blocker) {
      await accessors.insertAuditEvent(
        id,
        blocker.auditEventType,
        userId,
        false,
        blocker.auditSummary,
        blocker.details
      );
      throw createBadRequestException({
        code: blocker.code,
        message: blocker.message,
        ...blocker.details,
      });
    }

    // §10.3 hard gate: publish is blocked until the fixture set is complete
    // (≥1 input, ≥1 runtime output, ≥1 negative fixture). An incomplete
    // fixture set cannot be published as a contract-guaranteed capability.
    const fixtureResult = await this.capabilityFixtureService.validateFixturesExist(id);
    if (!fixtureResult.valid) {
      await accessors.insertAuditEvent(
        id,
        'fixture_validation_failed',
        userId,
        false,
        `发布被 Fixture 门禁拦截: ${fixtureResult.errors.join('; ')}`,
        { errors: fixtureResult.errors }
      );
      throw createBadRequestException({
        code: this.capabilityFixtureService.errorCode,
        message: `Capability 缺少必要 Fixture，无法发布: ${fixtureResult.errors.join('; ')}`,
        errors: fixtureResult.errors,
      });
    }

    // Persist the compatibility diff onto the release's build (§15.4 item 5)
    // so operators can audit why the publish was/wasn't blocked.
    if (compatibility) {
      const buildId = release.currentBuildId || release.latestSuccessfulBuildId;
      if (buildId) {
        await this.prisma
          .$executeRawUnsafe(
            `UPDATE capability_builds
             SET build_diff_json = $2::jsonb, updated_at = now()
             WHERE id = $1::uuid`,
            buildId,
            JSON.stringify(compatibility)
          )
          .catch(() => undefined);
      }
    }

    // Gate 5 (§10.6): record the release-validation attestation so activation
    // can require a proof of validation. The attestation is part of the
    // publish artifact — a version whose attestation cannot be built can never
    // pass the activation gate, so the publish itself is BLOCKED on failure.
    // The error is logged and recorded as an audit event (fix ⑨) before
    // throwing so operators can see exactly why the publish was blocked.
    const buildId = release.currentBuildId || release.latestSuccessfulBuildId;
    if (buildId) {
      try {
        await this.capabilityAttestationService.buildAttestation(
          release.id,
          buildId,
          lint
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Attestation build failed for release ${release.id}: ${message}`);
        await accessors.insertAuditEvent(
          id,
          'attestation_failed',
          userId,
          false,
          `发布 Attestation 生成失败，发布被阻断: ${message}`,
          { buildId, error: message }
        );
        throw createBadRequestException({
          code: CAPABILITY_RELEASE_ERROR_CODE.ATTESTATION_FAILED,
          message: `发布 Attestation 生成失败，发布被阻断: ${message}`,
          buildId,
        });
      }
    }

    const { publishedSkillId, previousPublishedSkillIdDeactivated } =
      await this.capabilityReleaseSkillPublisherService.publishNormalizedDraft({
        release,
        draft,
        normalizedDraftPayload,
      });

    if (previousPublishedSkillIdDeactivated) {
      await accessors.insertAuditEvent(
        id,
        'published_skill_deactivated',
        userId,
        true,
        `重新发布后停用旧 Skill: ${previousPublishedSkillIdDeactivated}`,
        {
          previousPublishedSkillId: previousPublishedSkillIdDeactivated,
          newPublishedSkillId: publishedSkillId,
        }
      );
    }

    await accessors.insertAuditEvent(
      id,
      'skill_published',
      userId,
      true,
      `发布 Skill 成功: ${publishedSkillId}`
    );
    return {
      release: await accessors.getReleaseOrThrow(id),
      publishedSkillId,
    };
  }

  private asDebugRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private reportRuntimeLoopMismatchDebug(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    msg: string,
    data: Record<string, unknown>,
    runId = 'pre-fix'
  ): void {
    const localFs = require('fs') as typeof import('fs');
    const envPaths = [
      '/app/.dbg/runtime-loop-mismatch.env',
      '/Users/chain/Documents/MyProject/ops-automation/.dbg/runtime-loop-mismatch.env',
    ];
    let serverUrl = 'http://host.docker.internal:7777/event';
    let sessionId = 'runtime-loop-mismatch';
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
      location: 'capability-release-publish.service',
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
}
