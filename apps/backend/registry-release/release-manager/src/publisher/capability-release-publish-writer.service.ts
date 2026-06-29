import { Inject, Injectable } from '@nestjs/common';
import type { ReleaseManagerPrismaPort } from '../platform-runtime.ports';
import { RELEASE_MANAGER_PRISMA } from '../platform-runtime.tokens';

type BridgeSkillDraftWriteParams = {
  draftId: string;
  releaseId: string;
  sourceType: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: Record<string, unknown>;
  executionFlowTemplateIds: string[];
  tools: string[];
  apiEndpoints: Record<string, unknown> | null;
  draftPayload: Record<string, unknown>;
  userId?: string;
};

type UpdateSkillDraftWriteParams = {
  draftId: string;
  name: unknown;
  description: unknown;
  triggerKeywords: unknown;
  paramsSchema: unknown;
  executionFlowTemplateIds: unknown;
  tools: unknown;
  apiEndpoints: unknown;
  draftPayload: Record<string, unknown>;
};

@Injectable()
export class CapabilityReleasePublishWriterService {
  constructor(@Inject(RELEASE_MANAGER_PRISMA) private readonly prisma: ReleaseManagerPrismaPort) {}

  async createBridgeSkillDraftAndMarkPendingApproval(
    params: BridgeSkillDraftWriteParams
  ): Promise<void> {
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
      params.draftId,
      params.releaseId,
      params.sourceType,
      params.name,
      params.description,
      JSON.stringify(params.triggerKeywords),
      JSON.stringify(params.paramsSchema),
      JSON.stringify(params.executionFlowTemplateIds),
      JSON.stringify(params.tools),
      JSON.stringify(params.apiEndpoints || null),
      JSON.stringify(params.draftPayload),
      params.userId || null
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET current_skill_draft_id = $2::uuid,
           status = 'pending_approval',
           approval_status = 'pending',
           updated_at = now()
       WHERE id = $1::uuid`,
      params.releaseId,
      params.draftId
    );
  }

  async updateSkillDraftAndMarkPendingApproval(
    releaseId: string,
    params: UpdateSkillDraftWriteParams
  ): Promise<void> {
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
      params.draftId,
      params.name,
      params.description,
      JSON.stringify(params.triggerKeywords || []),
      JSON.stringify(params.paramsSchema || {}),
      JSON.stringify(params.executionFlowTemplateIds || []),
      JSON.stringify(params.tools || []),
      JSON.stringify(params.apiEndpoints || null),
      JSON.stringify(params.draftPayload)
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = 'pending_approval',
           approval_status = 'pending',
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId
    );
  }

  async updateReleaseApproval(
    releaseId: string,
    status: 'approved' | 'draft',
    approvalStatus: 'approved' | 'rejected'
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET status = $2,
           approval_status = $3,
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      status,
      approvalStatus
    );
  }

  async deactivatePublishedSkill(skillId: string): Promise<void> {
    await this.prisma.skillConfig.updateMany({
      where: { id: skillId },
      data: { isActive: false },
    });
  }

  async finalizePublishedSkill(
    releaseId: string,
    draftId: string,
    publishedSkillId: string,
    approvalStatus: 'not_required' | 'approved'
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE skill_drafts
       SET status = 'published', updated_at = now()
       WHERE id = $1::uuid`,
      draftId
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE capability_releases
       SET published_skill_id = $2::uuid,
           status = 'published',
           source_status = 'published',
           approval_status = $3,
           updated_at = now()
       WHERE id = $1::uuid`,
      releaseId,
      publishedSkillId,
      approvalStatus
    );
  }
}
