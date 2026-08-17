import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { computePlanHash, type DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import { PrismaService } from '../prisma/prisma.service';
import {
  SavedSkillDto,
  SavedSkillReviewDto,
  SaveExecutionAsSkillDto,
  WorkflowSaveEligibilityDto,
} from './saved-skill.dto';
import { sanitizeSavedSkillInput } from './saved-skill-input-sanitizer';
import {
  projectSavedSkillFixedInput,
  projectSavedSkillStepInputs,
} from './saved-skill-fixed-input';
import { buildSavedSkillRuntimeParamsSchema } from './saved-skill-runtime-params';
import { SavedSkillReviewClient } from './saved-skill-review.client';

interface SavedSkillRow {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  visibility: string;
  status: string;
  version: number;
  sourceExecutionId: string;
  planSnapshotJson: Record<string, unknown>;
  fixedInputJson: Record<string, unknown>;
  planHash: string;
  inputHash: string;
  aiReviewJson: SavedSkillReviewDto;
  createdAt: Date;
  updatedAt: Date;
}

interface ExecutionSnapshot {
  execution: {
    id: string;
    status: string;
    executionMode: string | null;
    normalizedInputJson: unknown;
    inputJson: unknown;
    resultJson: unknown;
  };
  plan: {
    schemaVersion: string;
    status: string;
    objective: string;
    planJson: unknown;
    planHash: string | null;
  } | null;
  steps: Array<{ planNodeId: string | null; status: string }>;
}

@Injectable()
export class SavedSkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewClient: SavedSkillReviewClient
  ) {}

  async getEligibility(userId: string, executionId: string): Promise<WorkflowSaveEligibilityDto> {
    const snapshot = await this.loadExecutionSnapshot(userId, executionId);
    if (!snapshot) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const base = {
      executionId,
      executionMode: snapshot.execution.executionMode || undefined,
      stepCount: this.getPlanNodes(snapshot.plan?.planJson).length,
      suggestedName: snapshot.plan?.objective?.trim() || '我的工作流',
    };
    const existing = await this.findExistingBySourceExecution(userId, executionId);
    if (existing) {
      return {
        ...base,
        eligible: true,
        fixedInput: existing.fixedInput,
        savedSkillId: existing.id,
        savedSkillVersion: existing.version,
      };
    }
    if (snapshot.execution.status !== 'succeeded') {
      return this.ineligible(base, 'EXECUTION_NOT_SUCCEEDED', '只有成功完成的任务可以保存。');
    }
    if (snapshot.execution.executionMode !== 'deterministic_plan') {
      return this.ineligible(base, 'NOT_DETERMINISTIC_PLAN', '当前任务不是固定多步骤计划。');
    }
    if (!snapshot.plan || snapshot.plan.status !== 'frozen') {
      return this.ineligible(base, 'FROZEN_PLAN_NOT_FOUND', '当前执行缺少冻结计划。');
    }

    const plan = this.asPlan(snapshot.plan.planJson);
    if (!plan || plan.nodes.length < 2) {
      return this.ineligible(base, 'MULTI_STEP_PLAN_REQUIRED', '至少包含两个步骤才能保存为工作流。');
    }
    if (Array.isArray(plan.requiredUserInputs) && plan.requiredUserInputs.length > 0) {
      return this.ineligible(base, 'REQUIRES_USER_INPUT', '计划仍包含需要用户补充的输入。');
    }
    const nodeStatuses = new Map(
      snapshot.steps
        .filter((step): step is { planNodeId: string; status: string } => Boolean(step.planNodeId))
        .map((step) => [step.planNodeId, step.status])
    );
    const unfinishedNode = plan.nodes.find(
      (node) => !['succeeded', 'skipped'].includes(nodeStatuses.get(node.nodeId) || '')
    );
    if (unfinishedNode) {
      return this.ineligible(
        base,
        'PLAN_NODE_NOT_SUCCEEDED',
        `步骤 ${unfinishedNode.title || unfinishedNode.nodeId} 未成功完成。`
      );
    }
    if (!snapshot.plan.planHash || computePlanHash(plan) !== snapshot.plan.planHash) {
      return this.ineligible(base, 'PLAN_HASH_MISMATCH', '冻结计划摘要不一致。');
    }

    const fixedInput = projectSavedSkillFixedInput(
      plan,
      snapshot.execution.normalizedInputJson || snapshot.execution.inputJson || {}
    );
    const blockingInputIssue = fixedInput.issues.find((issue) => issue.severity === 'error');
    if (blockingInputIssue) {
      return this.ineligible(base, blockingInputIssue.code, blockingInputIssue.message);
    }

    return {
      ...base,
      eligible: true,
      fixedInput: fixedInput.value,
      frozenStepInputs: projectSavedSkillStepInputs(
        plan,
        snapshot.execution.normalizedInputJson || snapshot.execution.inputJson || {}
      ),
    };
  }

  async saveFromExecution(
    userId: string,
    executionId: string,
    dto: SaveExecutionAsSkillDto
  ): Promise<SavedSkillDto> {
    const existing = await this.findExistingBySourceExecution(userId, executionId);
    if (existing) {
      return existing;
    }

    const eligibility = await this.getEligibility(userId, executionId);
    if (!eligibility.eligible) {
      throw new BadRequestException({
        code: eligibility.reasonCode || 'WORKFLOW_NOT_SAVEABLE',
        message: eligibility.message || '当前执行不能保存为工作流',
      });
    }
    const snapshot = await this.loadExecutionSnapshot(userId, executionId);
    if (!snapshot?.plan) {
      throw new NotFoundException(`Plan for execution ${executionId} not found`);
    }
    const plan = this.asPlan(snapshot.plan.planJson);
    if (!plan || !snapshot.plan.planHash) {
      throw new BadRequestException('Frozen deterministic plan is invalid');
    }
    const sanitizedInput = projectSavedSkillFixedInput(
      plan,
      snapshot.execution.normalizedInputJson || snapshot.execution.inputJson || {}
    );
    const sanitizedSampleResult = sanitizeSavedSkillInput(
      this.asRecord(snapshot.execution.resultJson) || {}
    );
    const deterministicIssues = sanitizedInput.issues;
    const review = await this.reviewClient.review({
      sourceExecutionId: executionId,
      planSnapshot: plan as unknown as Record<string, unknown>,
      fixedInput: sanitizedInput.value,
      businessResult: sanitizedSampleResult.value,
    });
    const mergedReview: SavedSkillReviewDto = {
      ...review,
      planChanged: false,
      issues: [...deterministicIssues, ...review.issues],
      decision: deterministicIssues.some((issue) => issue.severity === 'error')
        ? 'block'
        : review.decision,
    };
    if (mergedReview.decision === 'block') {
      throw new BadRequestException({
        code: 'WORKFLOW_REVIEW_BLOCKED',
        message: mergedReview.summary,
        review: mergedReview,
      });
    }

    const skillId = randomUUID();
    const versionId = randomUUID();
    const version = 1;
    const reviewStatus = mergedReview.decision === 'warning' ? 'warning_accepted' : 'passed';
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO user_saved_skills
           (id, owner_user_id, name, description, visibility, status, latest_version)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'private', 'active', $5)`,
        skillId,
        userId,
        dto.name.trim(),
        dto.description?.trim() || null,
        version
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO user_saved_skill_versions
           (id, skill_id, owner_user_id, version, source_execution_id, schema_version,
            plan_snapshot_json, plan_hash, fixed_input_json, input_hash,
            output_schema_json, sample_result_json, ai_review_json, review_status)
         VALUES
           ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6,
            $7::jsonb, $8, $9::jsonb, $10,
            $11::jsonb, $12::jsonb, $13::jsonb, $14)`,
        versionId,
        skillId,
        userId,
        version,
        executionId,
        snapshot.plan?.schemaVersion || plan.schemaVersion,
        JSON.stringify(plan),
        snapshot.plan.planHash,
        JSON.stringify(sanitizedInput.value),
        sanitizedInput.inputHash,
        JSON.stringify(this.buildOutputSchema(plan)),
        JSON.stringify(sanitizedSampleResult.value),
        JSON.stringify(mergedReview),
        reviewStatus
      );
      await tx.$executeRawUnsafe(
        `UPDATE user_saved_skills
            SET active_version_id = $1::uuid, updated_at = NOW()
          WHERE id = $2::uuid`,
        versionId,
        skillId
      );
    });

    return this.getById(userId, skillId);
  }

  async list(userId: string): Promise<{ skills: SavedSkillDto[] }> {
    const rows = await this.queryRows(
      `WHERE s.owner_user_id = $1::uuid ORDER BY s.updated_at DESC`,
      [userId]
    );
    return { skills: rows.map((row) => this.mapRow(row)) };
  }

  async getById(userId: string, skillId: string): Promise<SavedSkillDto> {
    const rows = await this.queryRows(
      `WHERE s.id = $1::uuid AND s.owner_user_id = $2::uuid LIMIT 1`,
      [skillId, userId]
    );
    if (!rows[0]) {
      throw new NotFoundException(`Saved workflow ${skillId} not found`);
    }
    return this.mapRow(rows[0]);
  }

  private async findExistingBySourceExecution(
    userId: string,
    executionId: string
  ): Promise<SavedSkillDto | null> {
    const rows = await this.queryRows(
      `WHERE s.owner_user_id = $1::uuid AND v.source_execution_id = $2::uuid LIMIT 1`,
      [userId, executionId]
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  private async queryRows(whereClause: string, params: unknown[]): Promise<SavedSkillRow[]> {
    return this.prisma.$queryRawUnsafe<SavedSkillRow[]>(
      `SELECT s.id,
              s.owner_user_id AS "ownerUserId",
              s.name,
              s.description,
              s.visibility,
              s.status,
              v.version,
              v.source_execution_id AS "sourceExecutionId",
              v.plan_snapshot_json AS "planSnapshotJson",
              v.fixed_input_json AS "fixedInputJson",
              v.plan_hash AS "planHash",
              v.input_hash AS "inputHash",
              v.ai_review_json AS "aiReviewJson",
              s.created_at AS "createdAt",
              s.updated_at AS "updatedAt"
         FROM user_saved_skills s
         JOIN user_saved_skill_versions v ON v.id = s.active_version_id
         ${whereClause}`,
      ...params
    );
  }

  private async loadExecutionSnapshot(
    userId: string,
    executionId: string
  ): Promise<ExecutionSnapshot | null> {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, createdBy: userId },
      select: {
        id: true,
        status: true,
        executionMode: true,
        normalizedInputJson: true,
        inputJson: true,
        resultJson: true,
      },
    });
    if (!execution) return null;
    const [plan, steps] = await Promise.all([
      this.prisma.executionPlan.findUnique({
        where: { executionId },
        select: {
          schemaVersion: true,
          status: true,
          objective: true,
          planJson: true,
          planHash: true,
        },
      }),
      this.prisma.executionStep.findMany({
        where: { executionId },
        select: { planNodeId: true, status: true },
      }),
    ]);
    return { execution, plan, steps } as ExecutionSnapshot;
  }

  private mapRow(row: SavedSkillRow): SavedSkillDto {
    const plan = this.asPlan(row.planSnapshotJson);
    const fixedInput = this.asRecord(row.fixedInputJson) || {};
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      visibility: 'private',
      status: this.normalizeStatus(row.status),
      version: String(row.version),
      sourceExecutionId: row.sourceExecutionId,
      stepCount: this.getPlanNodes(plan).length,
      fixedInput,
      paramsSchema: plan
        ? buildSavedSkillRuntimeParamsSchema(plan, fixedInput)
        : this.buildParamsSchema(fixedInput),
      planHash: row.planHash,
      inputHash: row.inputHash,
      review: row.aiReviewJson,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  private buildParamsSchema(input: Record<string, unknown>): Record<string, unknown> {
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(input).map(([key, value]) => [
          key,
          { type: this.inferJsonType(value), default: value, readOnly: true },
        ])
      ),
      required: Object.keys(input),
      additionalProperties: false,
    };
  }

  private buildOutputSchema(plan: DeterministicPlanDraftV1): Record<string, unknown> {
    return {
      type: 'object',
      properties: Object.fromEntries(
        (plan.finalOutputs || []).map((output) => [
          output.targetField,
          { type: output.expectedType === 'number' ? 'number' : output.expectedType === 'boolean' ? 'boolean' : 'string' },
        ])
      ),
      required: (plan.finalOutputs || []).map((output) => output.targetField),
    };
  }

  private inferJsonType(value: unknown): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  private normalizeStatus(value: string): SavedSkillDto['status'] {
    return ['active', 'blocked', 'disabled', 'pending_review'].includes(value)
      ? (value as SavedSkillDto['status'])
      : 'disabled';
  }

  private asPlan(value: unknown): DeterministicPlanDraftV1 | null {
    const record = this.asRecord(value);
    return record && Array.isArray(record.nodes)
      ? (record as unknown as DeterministicPlanDraftV1)
      : null;
  }

  private getPlanNodes(value: unknown): Array<Record<string, unknown>> {
    const record = this.asRecord(value);
    return record && Array.isArray(record.nodes)
      ? record.nodes.filter((node): node is Record<string, unknown> => Boolean(this.asRecord(node)))
      : [];
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private ineligible(
    base: Omit<WorkflowSaveEligibilityDto, 'eligible'>,
    reasonCode: string,
    message: string
  ): WorkflowSaveEligibilityDto {
    return { ...base, eligible: false, reasonCode, message };
  }
}
