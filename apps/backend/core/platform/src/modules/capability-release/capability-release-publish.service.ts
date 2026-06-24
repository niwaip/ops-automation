import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SkillService } from '../../skill-registry/registry';
import { BrowserRecordingExecutionPlanValidatorService } from './browser-recording-execution-plan-validator.service';
import { CAPABILITY_RELEASE_ERROR_CODE } from './capability-release.constants';
import { CapabilityReleaseBrowserRecordingService } from './capability-release-browser-recording.service';
import { CapabilityReleaseTemporalSchemaService } from './capability-release-temporal-schema.service';
import {
  ApproveCapabilityReleaseDTO,
  BridgeRecorderExportDTO,
  BridgeRecorderExportResultDTO,
  CapabilityReleaseDTO,
  CapabilityReleaseDetailDTO,
  CapabilitySourceSnapshotDTO,
  CreateCapabilityReleaseDTO,
  PublishSkillDraftDTO,
  RecorderBridgePublishPayloadDTO,
  SkillDraftDTO,
  UpdateCapabilitySourceDTO,
  UpdateSkillDraftDTO,
} from './interfaces';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillService: SkillService,
    private readonly capabilityReleaseBrowserRecordingService: CapabilityReleaseBrowserRecordingService,
    private readonly browserRecordingExecutionPlanValidatorService: BrowserRecordingExecutionPlanValidatorService,
    private readonly capabilityReleaseTemporalSchemaService: CapabilityReleaseTemporalSchemaService
  ) {}

  async bridgeRecorderExport(
    dto: BridgeRecorderExportDTO,
    userId: string | undefined,
    accessors: CapabilityReleasePublishAccessors
  ): Promise<BridgeRecorderExportResultDTO> {
    const publishPayload = dto.exportArtifacts?.skillDraft?.publishPayload;
    if (!publishPayload || typeof publishPayload !== 'object' || Array.isArray(publishPayload)) {
      throw new BadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.MISSING_PUBLISH_PAYLOAD,
        message: '缺少 exportArtifacts.skillDraft.publishPayload',
      });
    }

    const hydratedPublishPayload = this.hydrateRecorderPublishPayload(
      dto.exportArtifacts as Record<string, unknown>,
      publishPayload as Record<string, unknown>
    );
    const normalizedPayload = this.normalizeRecorderPublishPayload(hydratedPublishPayload);
    // #region debug-point A:bridge-recorder-export-input
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
    // #endregion
    const bridgeValidation =
      this.browserRecordingExecutionPlanValidatorService.validateForBridge(normalizedPayload);
    if (!bridgeValidation.valid) {
      throw new BadRequestException({
        code: 'invalid_source_payload',
        message: 'Recorder export 的 executionPlan 校验失败',
        planValidation: bridgeValidation,
      });
    }
    const sourcePayload = this.buildRecorderSourcePayload(dto, normalizedPayload);
    const sourceName =
      dto.sourceName ||
      normalizedPayload.name ||
      dto.userGoal ||
      dto.exportArtifacts?.skillDraft?.name ||
      'Recorder Bridge Capability';

    let releaseId = dto.releaseId;
    if (releaseId) {
      const existing = await accessors.getReleaseOrThrow(releaseId);
      if (existing.sourceType !== 'browser_recording') {
        throw new BadRequestException({
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
    const draftPayload = {
      ...normalizedPayload,
      sourceType: 'browser_recording',
      bridgeMode: 'browser_recording_native',
      recorderBridge: {
        userGoal: dto.userGoal || null,
        guidance:
          typeof dto.exportArtifacts?.guidance === 'string' ? dto.exportArtifacts.guidance : null,
        commandCount: Array.isArray(dto.exportArtifacts?.commands)
          ? dto.exportArtifacts.commands.length
          : 0,
      },
    } as Record<string, unknown>;
    // #region debug-point B:bridge-recorder-export-draft
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
    // #endregion

    const draftId = randomUUID();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO skill_drafts (
        id, release_id, generated_from_build_id, generated_from_validation_id, source_type,
        name, description, trigger_keywords, params_schema, execution_flow_template_ids,
        tools, api_endpoints, draft_payload_json, status, created_by, created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, NULL, NULL, $3,
        $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
        $9::jsonb, $10::jsonb, $11::jsonb, 'draft', $12::uuid, now(), now()
      )`,
      draftId,
      releaseId,
      release.sourceType,
      normalizedPayload.name,
      normalizedPayload.description,
      JSON.stringify(normalizedPayload.triggerKeywords),
      JSON.stringify(normalizedPayload.paramsSchema),
      JSON.stringify(normalizedPayload.executionFlowTemplateIds),
      JSON.stringify(normalizedPayload.tools),
      JSON.stringify(normalizedPayload.apiEndpoints || null),
      JSON.stringify(draftPayload),
      userId || null
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_skill_draft_id = $2::uuid,
           status = 'pending_approval',
           approval_status = 'pending',
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      draftId
    );

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
      throw new NotFoundException('当前 Release 没有 Skill 草案');
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

    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_drafts
       SET name = $2,
           description = $3,
           trigger_keywords = $4::jsonb,
           params_schema = $5::jsonb,
           execution_flow_template_ids = $6::jsonb,
           tools = $7::jsonb,
           api_endpoints = $8::jsonb,
           draft_payload_json = $9::jsonb,
           status = 'reviewed',
           updated_at = now()
       WHERE id = $1::uuid`,
      draft.id,
      payload.name,
      payload.description,
      JSON.stringify(payload.triggerKeywords || []),
      JSON.stringify(payload.paramsSchema || {}),
      JSON.stringify(payload.executionFlowTemplateIds || []),
      JSON.stringify(payload.tools || []),
      JSON.stringify(payload.apiEndpoints || null),
      JSON.stringify(payload)
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'pending_approval',
           approval_status = 'pending',
           updated_at = now()
       WHERE id = $1::uuid`,
      id
    );

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
      throw new BadRequestException('当前 Release 不处于可审批状态');
    }

    const approved = dto.decision === 'approved';
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = $2,
           approval_status = $3,
           updated_at = now()
       WHERE id = $1::uuid`,
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
    dto: PublishSkillDraftDTO,
    userId: string | undefined,
    accessors: CapabilityReleasePublishAccessors
  ): Promise<{ release: CapabilityReleaseDTO; publishedSkillId: string }> {
    const release = await accessors.getReleaseOrThrow(id);
    if (release.approvalStatus === 'pending' || release.status === 'pending_approval') {
      throw new BadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.RELEASE_APPROVAL_PENDING,
        message: '当前 Release 尚未审批通过',
      });
    }
    if (release.approvalStatus === 'rejected') {
      throw new BadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.RELEASE_APPROVAL_REJECTED,
        message: '当前 Release 审批未通过，请调整草案后重新提交',
      });
    }

    const draftId = dto.draftId || release.currentSkillDraftId;
    if (!draftId) {
      throw new NotFoundException({
        code: CAPABILITY_RELEASE_ERROR_CODE.SKILL_DRAFT_NOT_FOUND,
        message: '没有可发布的 Skill 草案',
      });
    }

    const previousPublishedSkillId = release.publishedSkillId;
    const draft = await accessors.getSkillDraftOrThrow(draftId);
    if (release.sourceType === 'browser_recording') {
      const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
      const publishValidation =
        this.browserRecordingExecutionPlanValidatorService.validateForPublish(
          snapshot.sourcePayload
        );
      if (!publishValidation.valid) {
        await accessors.insertAuditEvent(
          id,
          'skill_publish_blocked_by_execution_plan_validation',
          userId,
          false,
          '发布前 executionPlan 校验失败',
          { planValidation: publishValidation }
        );
        throw new BadRequestException({
          code: 'invalid_source_payload',
          message: '发布前 executionPlan 校验失败',
          planValidation: publishValidation,
        });
      }
    }
    const normalizedDraftTools =
      release.sourceType === 'browser_recording'
        ? this.capabilityReleaseBrowserRecordingService.normalizeToolNames(draft.tools)
        : draft.tools;
    const normalizedDraftPayload: Record<string, unknown> =
      release.sourceType === 'browser_recording'
        ? {
            ...(draft.draftPayload as Record<string, unknown>),
            tools: Array.isArray((draft.draftPayload as Record<string, unknown>).tools)
              ? this.capabilityReleaseBrowserRecordingService.normalizeToolNames(
                  (draft.draftPayload as Record<string, unknown>).tools
                )
              : normalizedDraftTools,
            executionFlow: this.capabilityReleaseBrowserRecordingService.normalizeExecutionFlow(
              (draft.draftPayload as Record<string, unknown>).executionFlow
            ),
          }
        : { ...(draft.draftPayload as Record<string, unknown>) };
    const toolValidation = await this.skillService.validateSkillToolsPayload({
      tools: normalizedDraftTools,
      executionFlow:
        release.sourceType === 'browser_recording'
          ? (normalizedDraftPayload.executionFlow as Record<string, unknown>[])
          : [],
      executionFlowTemplateIds: draft.executionFlowTemplateIds,
    });

    if (!toolValidation.isValid) {
      await accessors.insertAuditEvent(
        id,
        'skill_publish_blocked_by_tool_validation',
        userId,
        false,
        '发布前工具校验失败',
        { toolValidation }
      );
      throw new BadRequestException({
        code: CAPABILITY_RELEASE_ERROR_CODE.SKILL_PUBLISH_TOOL_VALIDATION_FAILED,
        message: '发布前工具校验失败',
        toolValidation,
      });
    }

    if (release.sourceType === 'temporal_workflow') {
      const snapshot = await accessors.getCurrentSnapshotOrThrow(release);
      const mappingReadiness =
        this.capabilityReleaseTemporalSchemaService.assessTemporalDocumentMappingReadiness(
          snapshot.sourcePayload
        );
      if (mappingReadiness.applicable && mappingReadiness.mappedInputCount === 0) {
        await accessors.insertAuditEvent(
          id,
          'skill_publish_blocked_by_document_mapping',
          userId,
          false,
          '发布前阻断：模板工作流缺少显式 renderPath/templateBinding',
          { mappingReadiness }
        );
        throw new BadRequestException({
          code: CAPABILITY_RELEASE_ERROR_CODE.TEMPORAL_DOCUMENT_MAPPING_NOT_READY,
          message: '当前模板工作流缺少显式 renderPath/templateBinding，暂不允许发布',
          mappingReadiness,
        });
      }
    }

    const payload = normalizedDraftPayload;
    if (typeof payload.description === 'string' && payload.description.length > 500) {
      payload.description = `${payload.description.slice(0, 497)}...`;
    }

    const baseName =
      (typeof payload.name === 'string' && payload.name.trim()) ||
      release.sourceName ||
      `Skill-${release.id.slice(0, 8)}`;
    const finalName = await this.ensureUniqueSkillName(String(baseName), release.id);
    payload.name = finalName;

    const created = await this.skillService.createSkill(payload as any);
    const publishedSkillId = created.id;

    if (previousPublishedSkillId && previousPublishedSkillId !== publishedSkillId) {
      await this.prisma.skillConfig.updateMany({
        where: { id: previousPublishedSkillId },
        data: { isActive: false },
      });
      await accessors.insertAuditEvent(
        id,
        'published_skill_deactivated',
        userId,
        true,
        `重新发布后停用旧 Skill: ${previousPublishedSkillId}`,
        {
          previousPublishedSkillId,
          newPublishedSkillId: publishedSkillId,
        }
      );
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_drafts
       SET status = 'published', updated_at = now()
       WHERE id = $1::uuid`,
      draft.id
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET published_skill_id = $2::uuid,
           status = 'published',
           approval_status = $3,
           updated_at = now()
       WHERE id = $1::uuid`,
      id,
      publishedSkillId,
      release.approvalStatus === 'not_required' ? 'not_required' : 'approved'
    );

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

  private async ensureUniqueSkillName(baseName: string, releaseId: string): Promise<string> {
    let finalName = baseName;
    const nameExists = async (name: string) => {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM skill_configs WHERE name = $1 LIMIT 1`,
        name
      );
      return Boolean(rows[0]?.id);
    };

    if (!(await nameExists(finalName))) {
      return finalName;
    }

    const baseCandidate = `${baseName}-${releaseId.slice(0, 8)}`;
    finalName = baseCandidate;
    let suffix = 1;
    while (await nameExists(finalName)) {
      finalName = `${baseCandidate}-${suffix}`;
      suffix += 1;
      if (suffix > 1000) {
        return `${baseCandidate}-${Date.now()}`;
      }
    }
    return finalName;
  }

  private normalizeRecorderPublishPayload(input: RecorderBridgePublishPayloadDTO): {
    name: string;
    description: string;
    triggerKeywords: string[];
    paramsSchema: Record<string, unknown>;
    executionFlowTemplateIds: string[];
    executionFlow: Array<Record<string, unknown>>;
    tools: string[];
    apiEndpoints: Record<string, unknown> | null;
    loopPlanPreview?: Array<Record<string, unknown>>;
  } {
    const name =
      typeof input.name === 'string' && input.name.trim()
        ? input.name.trim()
        : `recorder-bridge-${Date.now()}`;
    const description =
      typeof input.description === 'string' && input.description.trim()
        ? input.description.trim()
        : `浏览器录制桥接草案：${name}`;
    const triggerKeywords = Array.isArray(input.triggerKeywords)
      ? input.triggerKeywords.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : [];
    const paramsSchema =
      input.paramsSchema &&
      typeof input.paramsSchema === 'object' &&
      !Array.isArray(input.paramsSchema)
        ? input.paramsSchema
        : { properties: {}, required: [] };
    const executionFlowTemplateIds = Array.isArray(input.executionFlowTemplateIds)
      ? input.executionFlowTemplateIds.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : [];
    const executionFlow = this.capabilityReleaseBrowserRecordingService.normalizeExecutionFlow(
      input.executionFlow
    );
    const tools = this.capabilityReleaseBrowserRecordingService.mergeToolsWithExecutionFlow(
      input.tools,
      executionFlow
    );
    const apiEndpoints =
      input.apiEndpoints &&
      typeof input.apiEndpoints === 'object' &&
      !Array.isArray(input.apiEndpoints)
        ? input.apiEndpoints
        : null;
    const loopPlanPreview = Array.isArray(input.loopPlanPreview)
      ? input.loopPlanPreview.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : undefined;

    return {
      name,
      description,
      triggerKeywords: triggerKeywords.length > 0 ? triggerKeywords : [name],
      paramsSchema,
      executionFlowTemplateIds,
      executionFlow,
      tools,
      apiEndpoints,
      ...(loopPlanPreview?.length ? { loopPlanPreview } : {}),
    };
  }

  private buildRecorderSourcePayload(
    dto: BridgeRecorderExportDTO,
    normalizedPayload: {
      description: string;
      paramsSchema: Record<string, unknown>;
      executionFlow: Array<Record<string, unknown>>;
      tools: string[];
      apiEndpoints: Record<string, unknown> | null;
    }
  ): Record<string, unknown> {
    return {
      goal: dto.userGoal || normalizedPayload.description,
      description: normalizedPayload.description,
      paramsSchema: normalizedPayload.paramsSchema,
      executionFlow: normalizedPayload.executionFlow,
      tools: normalizedPayload.tools,
      runtimeMetadata: normalizedPayload.apiEndpoints?.runtimeMetadata || {},
      recordingCommands: Array.isArray(dto.exportArtifacts?.commands)
        ? dto.exportArtifacts.commands
        : [],
      guidance:
        typeof dto.exportArtifacts?.guidance === 'string' ? dto.exportArtifacts.guidance : '',
      sourceType: 'browser_recording',
    };
  }

  private hydrateRecorderPublishPayload(
    exportArtifacts: Record<string, unknown>,
    publishPayload: Record<string, unknown>
  ): Record<string, unknown> {
    const nextPayload = { ...publishPayload };
    const nextApiEndpoints = this.asDebugRecord(nextPayload.apiEndpoints) || {};
    const nextRuntimeMetadata = this.asDebugRecord(nextApiEndpoints.runtimeMetadata) || {};
    const nextExecutionPlan = this.asDebugRecord(nextRuntimeMetadata.executionPlan) || {};
    const nextExecutionPlanTemplateSteps = Array.isArray(nextExecutionPlan.templateSteps)
      ? nextExecutionPlan.templateSteps
      : [];
    const nextRuntimeTemplateSteps = Array.isArray(nextRuntimeMetadata.templateSteps)
      ? nextRuntimeMetadata.templateSteps
      : [];
    const nextRuntimeLoopPlanPreview = Array.isArray(nextRuntimeMetadata.loopPlanPreview)
      ? nextRuntimeMetadata.loopPlanPreview
      : [];
    const skillDraft = this.asDebugRecord(exportArtifacts.skillDraft) || {};
    const skillDraftExecutionPlan = this.asDebugRecord(skillDraft.executionPlan);
    const exportLoopDraft = this.asDebugRecord(exportArtifacts.loopDraft);
    const exportLoopPlanPreview = Array.isArray(exportArtifacts.loopPlanPreview)
      ? exportArtifacts.loopPlanPreview.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];
    const exportTemplateSteps = Array.isArray(exportArtifacts.templateSteps)
      ? exportArtifacts.templateSteps.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item)
        )
      : [];

    const mergedExecutionPlan = {
      ...(skillDraftExecutionPlan || {}),
      ...nextExecutionPlan,
      ...(nextExecutionPlan.loopDraft
        ? {}
        : exportLoopDraft
          ? { loopDraft: exportLoopDraft }
          : {}),
      ...(nextExecutionPlanTemplateSteps.length > 0
        ? {}
        : exportTemplateSteps.length > 0
          ? { templateSteps: exportTemplateSteps }
          : {}),
    };

    const mergedRuntimeMetadata = {
      ...nextRuntimeMetadata,
      ...(Object.keys(mergedExecutionPlan).length > 0 ? { executionPlan: mergedExecutionPlan } : {}),
      ...(nextRuntimeTemplateSteps.length > 0
        ? {}
        : exportTemplateSteps.length > 0
          ? { templateSteps: exportTemplateSteps }
          : {}),
      ...(nextRuntimeMetadata.loopDraft ? {} : exportLoopDraft ? { loopDraft: exportLoopDraft } : {}),
      ...(nextRuntimeLoopPlanPreview.length > 0
        ? {}
        : exportLoopPlanPreview.length > 0
          ? { loopPlanPreview: exportLoopPlanPreview }
          : {}),
    };

    nextPayload.apiEndpoints = {
      ...nextApiEndpoints,
      runtimeMetadata: mergedRuntimeMetadata,
    };
    if (!nextPayload.loopPlanPreview && exportLoopPlanPreview.length > 0) {
      nextPayload.loopPlanPreview = exportLoopPlanPreview;
    }

    return nextPayload;
  }

  // #region debug-point shared:runtime-loop-mismatch
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
  // #endregion
}
