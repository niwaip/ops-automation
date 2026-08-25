import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ensureExecutionPermission } from '../execution/shared/execution-permission.util';
import type { RecordModelInvocationDto } from './experience-learning.dto';

@Injectable()
export class ModelInvocationLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async record(ownerUserId: string, input: RecordModelInvocationDto) {
    return this.prisma.$transaction(async (tx) => {
      const snapshotId = randomUUID();
      const ledgerId = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO prompt_snapshots
          (id, owner_user_id, execution_id, purpose, prompt_template_version,
           prompt_template_digest, system_prompt_digest, catalog_snapshot_digest,
           model_policy_digest, generation_params_json, input_refs_json)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
        snapshotId,
        ownerUserId,
        input.executionId || null,
        input.purpose,
        input.promptTemplateVersion,
        input.promptTemplateDigest,
        input.systemPromptDigest,
        input.catalogSnapshotDigest || null,
        input.modelPolicyDigest || null,
        JSON.stringify(input.generationParameters || {}),
        JSON.stringify(input.inputRefs || [])
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO llm_usage_ledger
          (id, owner_user_id, execution_id, planning_decision_id, step_id,
           prompt_snapshot_id, trace_id, purpose, provider, model_id, input_tokens,
           output_tokens, cached_tokens, estimated_cost, currency)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
                 $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        ledgerId,
        ownerUserId,
        input.executionId || null,
        input.planningDecisionId || null,
        input.stepId || null,
        snapshotId,
        input.traceId || null,
        input.purpose,
        input.provider,
        input.modelId,
        input.inputTokens,
        input.outputTokens,
        input.cachedTokens,
        input.estimatedCost ?? null,
        input.currency || null
      );
      return { id: ledgerId, promptSnapshotId: snapshotId };
    });
  }

  async listForExecution(executionId: string, requester?: { id?: string; role?: string }) {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { createdBy: true },
    });
    if (!execution) throw new NotFoundException(`Execution ${executionId} not found`);
    ensureExecutionPermission(execution.createdBy, requester);
    return this.prisma.$queryRawUnsafe(
      `SELECT l.id, l.execution_id AS "executionId", l.step_id AS "stepId",
              l.purpose, l.provider, l.model_id AS "modelId",
              l.input_tokens AS "inputTokens", l.output_tokens AS "outputTokens",
              l.cached_tokens AS "cachedTokens", l.estimated_cost AS "estimatedCost",
              l.currency, l.created_at AS "createdAt",
              s.prompt_template_version AS "promptTemplateVersion",
              s.prompt_template_digest AS "promptTemplateDigest",
              s.system_prompt_digest AS "systemPromptDigest"
         FROM llm_usage_ledger l
         JOIN prompt_snapshots s ON s.id = l.prompt_snapshot_id
        WHERE l.execution_id = $1::uuid
        ORDER BY l.created_at ASC`,
      executionId
    );
  }

  async attachTrace(ownerUserId: string, traceId: string, executionId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, createdBy: ownerUserId },
      select: { id: true },
    });
    if (!execution) throw new NotFoundException(`Execution ${executionId} not found`);
    return this.prisma.$transaction(async (tx) => {
      const ledgerCount = await tx.$executeRawUnsafe(
        `UPDATE llm_usage_ledger
            SET execution_id = $1::uuid
          WHERE owner_user_id = $2::uuid AND trace_id = $3 AND execution_id IS NULL`,
        executionId,
        ownerUserId,
        traceId
      );
      await tx.$executeRawUnsafe(
        `UPDATE prompt_snapshots s
            SET execution_id = $1::uuid
           FROM llm_usage_ledger l
          WHERE l.prompt_snapshot_id = s.id AND l.owner_user_id = $2::uuid
            AND l.trace_id = $3 AND s.execution_id IS NULL`,
        executionId,
        ownerUserId,
        traceId
      );
      return { attached: ledgerCount };
    });
  }
}
