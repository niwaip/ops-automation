import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface EnqueueExecutionOutboxInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  availableAt?: Date;
  traceContext?: {
    traceId?: string;
    traceparent?: string;
    tracestate?: string;
  };
}

export interface ClaimedExecutionOutboxItem {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempts: number;
  leaseExpiresAt: Date;
}

interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

@Injectable()
export class ExecutionOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    input: EnqueueExecutionOutboxInput,
    client: RawQueryClient = this.prisma
  ): Promise<string> {
    const id = randomUUID();
    const effectivePayload = {
      ...input.payload,
      ...(input.traceContext ? { traceContext: input.traceContext } : {}),
    };
    await client.$queryRawUnsafe(
      `INSERT INTO execution_outbox
        (id, aggregate_type, aggregate_id, event_type, payload_json, available_at)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5::jsonb, $6)`,
      id,
      input.aggregateType,
      input.aggregateId,
      input.eventType,
      JSON.stringify(effectivePayload),
      input.availableAt || new Date()
    );
    return id;
  }

  async claimBatch(
    owner: string,
    options?: { limit?: number; leaseMs?: number; eventTypes?: string[]; maxAttempts?: number }
  ): Promise<ClaimedExecutionOutboxItem[]> {
    const limit = Math.min(Math.max(options?.limit || 20, 1), 100);
    const leaseExpiresAt = new Date(Date.now() + Math.max(options?.leaseMs || 30_000, 1_000));
    const eventTypes = options?.eventTypes?.length ? options.eventTypes : null;
    const maxAttempts = typeof options?.maxAttempts === 'number' ? options.maxAttempts : null;
    return this.prisma.$queryRawUnsafe<ClaimedExecutionOutboxItem[]>(
      `WITH candidates AS (
         SELECT id
           FROM execution_outbox
          WHERE published_at IS NULL
            AND available_at <= NOW()
            AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
            AND ($4::text[] IS NULL OR event_type = ANY($4::text[]))
            AND ($5::int IS NULL OR attempts < $5)
          ORDER BY available_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $3
       )
       UPDATE execution_outbox AS outbox
          SET claimed_by = $1,
              lease_expires_at = $2,
              attempts = attempts + 1
         FROM candidates
        WHERE outbox.id = candidates.id
       RETURNING outbox.id,
                 outbox.aggregate_type AS "aggregateType",
                 outbox.aggregate_id AS "aggregateId",
                 outbox.event_type AS "eventType",
                 outbox.payload_json AS payload,
                 outbox.attempts,
                 outbox.lease_expires_at AS "leaseExpiresAt"`,
      owner,
      leaseExpiresAt,
      limit,
      eventTypes,
      maxAttempts
    );
  }

  async markPublished(id: string, owner: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE execution_outbox
          SET published_at = NOW(), claimed_by = NULL, lease_expires_at = NULL
        WHERE id = $1::uuid
          AND claimed_by = $2
          AND published_at IS NULL
       RETURNING id`,
      id,
      owner
    );
    return rows.length === 1;
  }

  async markDeadLetter(id: string, owner: string, reason: string): Promise<boolean> {
    const deadLetterMeta = JSON.stringify({
      reason,
      deadLetteredAt: new Date().toISOString(),
    });
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE execution_outbox
          SET published_at = NOW(),
              claimed_by = NULL,
              lease_expires_at = NULL,
              payload_json = jsonb_set(
                CASE WHEN jsonb_typeof(payload_json) = 'object' THEN payload_json ELSE '{}'::jsonb END,
                '{deadLetter}',
                $3::jsonb,
                true
              )
        WHERE id = $1::uuid
          AND claimed_by = $2
          AND published_at IS NULL
       RETURNING id`,
      id,
      owner,
      deadLetterMeta
    );
    return rows.length === 1;
  }

  async quarantinePoisonMessages(maxAttempts: number): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE execution_outbox
          SET published_at = NOW(),
              claimed_by = NULL,
              lease_expires_at = NULL,
              payload_json = jsonb_set(
                CASE WHEN jsonb_typeof(payload_json) = 'object' THEN payload_json ELSE '{}'::jsonb END,
                '{deadLetter}',
                jsonb_build_object('reason', 'Exceeded max retry attempts without resolution', 'deadLetteredAt', NOW()::text),
                true
              )
        WHERE published_at IS NULL
          AND attempts >= $1
          AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
       RETURNING id`,
      maxAttempts
    );
    return rows.length;
  }

  async releaseForRetry(id: string, owner: string, retryDelayMs: number): Promise<boolean> {
    const availableAt = new Date(Date.now() + Math.max(retryDelayMs, 1_000));
    const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE execution_outbox
          SET available_at = $3, claimed_by = NULL, lease_expires_at = NULL
        WHERE id = $1::uuid
          AND claimed_by = $2
          AND published_at IS NULL
       RETURNING id`,
      id,
      owner,
      availableAt
    );
    return rows.length === 1;
  }
}
