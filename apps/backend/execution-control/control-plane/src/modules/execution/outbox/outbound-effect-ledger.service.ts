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
   * Phase 2: Atomic CAS acquisition of commit permission.
   * Transitions from PREPARED/APPROVED/UNKNOWN/FAILED into COMMITTING.
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
          AND state IN ('PREPARED', 'APPROVED', 'UNKNOWN', 'FAILED')
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

    throw new Error(
      `COMMIT_ACQUISITION_FAILED: Cannot acquire commit for record in state '${record.state}'`
    );
  }

  async markCommitted(input: MarkCommittedInput) {
    return this.prisma.outboundEffectLedger.update({
      where: { id: input.id },
      data: {
        state: 'COMMITTED',
        provider: input.provider || undefined,
        providerRequestId: input.providerRequestId || undefined,
        providerMessageId: input.providerMessageId || undefined,
        resolvedAt: new Date(),
      },
    });
  }

  async markUnknown(input: MarkOutcomeInput) {
    return this.prisma.outboundEffectLedger.update({
      where: { id: input.id },
      data: {
        state: 'UNKNOWN',
        errorClassification: input.errorClassification,
        resolutionReason: input.resolutionReason || undefined,
        resolvedBy: input.resolvedBy || undefined,
      },
    });
  }

  async markFailed(input: MarkOutcomeInput) {
    return this.prisma.outboundEffectLedger.update({
      where: { id: input.id },
      data: {
        state: 'FAILED',
        errorClassification: input.errorClassification,
        resolutionReason: input.resolutionReason || undefined,
        resolvedBy: input.resolvedBy || undefined,
      },
    });
  }
}
