import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PrepareOutboundEffectInput {
  tenantId?: string;
  capabilityKey: string;
  operation?: string;
  idempotencyKey: string;
  canonicalPayload: Record<string, unknown>;
  payloadHash: string;
}

export interface ApproveOutboundEffectInput {
  tenantId?: string;
  capabilityKey: string;
  idempotencyKey: string;
  approvedPayloadHash: string;
  approver?: string;
}

export interface AcquireCommitInput {
  tenantId?: string;
  capabilityKey: string;
  idempotencyKey: string;
  payloadHash: string;
}

export interface MarkCommittedInput {
  id: string;
  provider?: string;
  providerRequestId?: string;
  providerMessageId?: string;
}

export interface MarkOutcomeInput {
  id: string;
  errorClassification: string;
  resolutionReason?: string;
  resolvedBy?: string;
}

export interface ResolveUnknownInput {
  id: string;
  targetState: 'COMMITTED' | 'FAILED' | 'CANCELLED';
  resolutionReason: string;
  resolvedBy: string;
}

export interface AuthorizeRetryInput {
  id: string;
  authorizedBy: string;
  reason?: string;
}

@Injectable()
export class OutboundEffectLedgerService {
  private readonly logger = new Logger(OutboundEffectLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Phase 1: Prepare outbound side effect.
   * Ensures deterministic hash matching and records the immutable canonical payload.
   */
  async prepare(input: PrepareOutboundEffectInput) {
    const tenantId = input.tenantId || 'default';
    const operation = input.operation || 'send';

    const existing = await this.prisma.outboundEffectLedger.findUnique({
      where: {
        tenantId_capabilityKey_idempotencyKey: {
          tenantId,
          capabilityKey: input.capabilityKey,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (existing) {
      if (existing.payloadHash !== input.payloadHash) {
        this.logger.error(
          `IDEMPOTENCY_PAYLOAD_CONFLICT: Idempotency key '${input.idempotencyKey}' was previously prepared with hash '${existing.payloadHash}', but caller provided '${input.payloadHash}'`
        );
        throw new Error(
          `IDEMPOTENCY_PAYLOAD_CONFLICT: Existing payload hash '${existing.payloadHash}' does not match '${input.payloadHash}'`
        );
      }
      return existing;
    }

    return this.prisma.outboundEffectLedger.create({
      data: {
        tenantId,
        capabilityKey: input.capabilityKey,
        operation,
        idempotencyKey: input.idempotencyKey,
        payloadHash: input.payloadHash,
        canonicalPayloadJson: input.canonicalPayload as any,
        state: 'PREPARED',
        attemptCount: 0,
      },
    });
  }

  /**
   * Approves a prepared outbound effect.
   * Strictly transitions PREPARED -> APPROVED only when approvedPayloadHash matches.
   */
  async approve(input: ApproveOutboundEffectInput) {
    const tenantId = input.tenantId || 'default';
    const approver = input.approver || 'system';

    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `UPDATE outbound_effect_ledgers
          SET state = 'APPROVED',
              resolved_by = $5,
              updated_at = NOW()
        WHERE tenant_id = $1
          AND capability_key = $2
          AND idempotency_key = $3
          AND payload_hash = $4
          AND state = 'PREPARED'
        RETURNING *`,
      tenantId,
      input.capabilityKey,
      input.idempotencyKey,
      input.approvedPayloadHash,
      approver
    );

    if (rows && rows.length > 0) {
      return rows[0];
    }

    const record = await this.prisma.outboundEffectLedger.findUnique({
      where: {
        tenantId_capabilityKey_idempotencyKey: {
          tenantId,
          capabilityKey: input.capabilityKey,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (!record) {
      throw new Error(
        `OUTBOUND_EFFECT_NOT_PREPARED: No prepared outbound effect record found for idempotency key '${input.idempotencyKey}'`
      );
    }

    if (record.payloadHash !== input.approvedPayloadHash) {
      throw new Error(
        `IDEMPOTENCY_PAYLOAD_CONFLICT: Cannot approve payload hash '${input.approvedPayloadHash}', record requires '${record.payloadHash}'`
      );
    }

    if (record.state === 'APPROVED') {
      return record;
    }

    throw new Error(
      `APPROVAL_TRANSITION_FAILED: Cannot approve record in state '${record.state}'`
    );
  }

  /**
   * Phase 2: Atomic CAS acquisition of commit permission.
   * Strictly transitions APPROVED -> COMMITTING.
   * Rejects PREPARED (must be approved first), UNKNOWN (human reconciliation only), and FAILED (retry authorization needed).
   */
  async acquireCommit(input: AcquireCommitInput) {
    const tenantId = input.tenantId || 'default';

    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `UPDATE outbound_effect_ledgers
          SET state = 'COMMITTING',
              attempt_count = attempt_count + 1,
              updated_at = NOW()
        WHERE tenant_id = $1
          AND capability_key = $2
          AND idempotency_key = $3
          AND payload_hash = $4
          AND state = 'APPROVED'
        RETURNING *`,
      tenantId,
      input.capabilityKey,
      input.idempotencyKey,
      input.payloadHash
    );

    if (rows && rows.length > 0) {
      return rows[0];
    }

    // Inspect why acquisition failed to provide fail-closed, actionable error
    const record = await this.prisma.outboundEffectLedger.findUnique({
      where: {
        tenantId_capabilityKey_idempotencyKey: {
          tenantId,
          capabilityKey: input.capabilityKey,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (!record) {
      throw new Error(
        `OUTBOUND_EFFECT_NOT_PREPARED: No prepared outbound effect record found for idempotency key '${input.idempotencyKey}'`
      );
    }

    if (record.payloadHash !== input.payloadHash) {
      throw new Error(
        `IDEMPOTENCY_PAYLOAD_CONFLICT: Cannot commit with payloadHash '${input.payloadHash}', record requires '${record.payloadHash}'`
      );
    }

    if (record.state === 'PREPARED') {
      throw new Error(
        `OUTBOUND_EFFECT_NOT_APPROVED: Record must be in APPROVED state before commit. Current state: '${record.state}'`
      );
    }

    if (record.state === 'COMMITTING') {
      throw new Error(
        `OUTBOUND_EFFECT_LOCKED: Idempotency key '${input.idempotencyKey}' is already in COMMITTING state by another worker`
      );
    }

    if (record.state === 'COMMITTED') {
      throw new Error(
        `OUTBOUND_EFFECT_ALREADY_COMMITTED: Idempotency key '${input.idempotencyKey}' was already committed`
      );
    }

    if (record.state === 'UNKNOWN') {
      throw new Error(
        `OUTBOUND_EFFECT_IN_UNKNOWN_STATE: Cannot automatically re-commit uncertain effect; human reconciliation required`
      );
    }

    if (record.state === 'FAILED') {
      throw new Error(
        `OUTBOUND_EFFECT_FAILED: Record is in FAILED state; explicit retry authorization required`
      );
    }

    throw new Error(
      `COMMIT_ACQUISITION_FAILED: Cannot acquire commit for record in state '${record.state}'`
    );
  }

  /**
   * Terminal state: COMMITTED.
   * Enforces atomic CAS WHERE state = 'COMMITTING' to prevent overwriting human resolution.
   */
  async markCommitted(input: MarkCommittedInput) {
    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `UPDATE outbound_effect_ledgers
          SET state = 'COMMITTED',
              provider = COALESCE($2, provider),
              provider_request_id = COALESCE($3, provider_request_id),
              provider_message_id = COALESCE($4, provider_message_id),
              resolved_at = NOW(),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND state = 'COMMITTING'
        RETURNING *`,
      input.id,
      input.provider || null,
      input.providerRequestId || null,
      input.providerMessageId || null
    );

    if (rows && rows.length > 0) {
      return rows[0];
    }

    const existing = await this.prisma.outboundEffectLedger.findUnique({
      where: { id: input.id },
    });
    if (existing?.state === 'COMMITTED') {
      return existing;
    }
    throw new Error(
      `STATE_CONFLICT: Cannot mark record ${input.id} as COMMITTED because current state is '${existing?.state}' (expected 'COMMITTING')`
    );
  }

  /**
   * Terminal state: UNKNOWN.
   * Enforces atomic CAS WHERE state = 'COMMITTING'.
   */
  async markUnknown(input: MarkOutcomeInput) {
    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `UPDATE outbound_effect_ledgers
          SET state = 'UNKNOWN',
              error_classification = $2,
              resolution_reason = COALESCE($3, resolution_reason),
              resolved_by = COALESCE($4, resolved_by),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND state = 'COMMITTING'
        RETURNING *`,
      input.id,
      input.errorClassification,
      input.resolutionReason || null,
      input.resolvedBy || null
    );

    if (rows && rows.length > 0) {
      return rows[0];
    }

    const existing = await this.prisma.outboundEffectLedger.findUnique({
      where: { id: input.id },
    });
    if (existing?.state === 'UNKNOWN') {
      return existing;
    }
    throw new Error(
      `STATE_CONFLICT: Cannot mark record ${input.id} as UNKNOWN because current state is '${existing?.state}' (expected 'COMMITTING')`
    );
  }

  /**
   * Terminal state: FAILED.
   * Enforces atomic CAS WHERE state = 'COMMITTING'.
   */
  async markFailed(input: MarkOutcomeInput) {
    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `UPDATE outbound_effect_ledgers
          SET state = 'FAILED',
              error_classification = $2,
              resolution_reason = COALESCE($3, resolution_reason),
              resolved_by = COALESCE($4, resolved_by),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND state = 'COMMITTING'
        RETURNING *`,
      input.id,
      input.errorClassification,
      input.resolutionReason || null,
      input.resolvedBy || null
    );

    if (rows && rows.length > 0) {
      return rows[0];
    }

    const existing = await this.prisma.outboundEffectLedger.findUnique({
      where: { id: input.id },
    });
    if (existing?.state === 'FAILED') {
      return existing;
    }
    throw new Error(
      `STATE_CONFLICT: Cannot mark record ${input.id} as FAILED because current state is '${existing?.state}' (expected 'COMMITTING')`
    );
  }

  /**
   * Human reconciliation: resolve UNKNOWN into COMMITTED, FAILED, or CANCELLED.
   */
  async resolveUnknown(input: ResolveUnknownInput) {
    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `UPDATE outbound_effect_ledgers
          SET state = $2,
              resolution_reason = $3,
              resolved_by = $4,
              resolved_at = NOW(),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND state = 'UNKNOWN'
        RETURNING *`,
      input.id,
      input.targetState,
      input.resolutionReason,
      input.resolvedBy
    );

    if (rows && rows.length > 0) {
      return rows[0];
    }

    const existing = await this.prisma.outboundEffectLedger.findUnique({
      where: { id: input.id },
    });
    throw new Error(
      `STATE_CONFLICT: Cannot resolve record ${input.id} because current state is '${existing?.state}' (expected 'UNKNOWN')`
    );
  }

  /**
   * Explicit retry authorization: transitions FAILED -> APPROVED.
   */
  async authorizeRetry(input: AuthorizeRetryInput) {
    const rows = await this.prisma.$queryRawUnsafe<Array<any>>(
      `UPDATE outbound_effect_ledgers
          SET state = 'APPROVED',
              resolution_reason = COALESCE($2, resolution_reason),
              resolved_by = $3,
              updated_at = NOW()
        WHERE id = $1::uuid
          AND state = 'FAILED'
        RETURNING *`,
      input.id,
      input.reason || null,
      input.authorizedBy
    );

    if (rows && rows.length > 0) {
      return rows[0];
    }

    const existing = await this.prisma.outboundEffectLedger.findUnique({
      where: { id: input.id },
    });
    throw new Error(
      `STATE_CONFLICT: Cannot authorize retry for record ${input.id} because current state is '${existing?.state}' (expected 'FAILED')`
    );
  }
}
