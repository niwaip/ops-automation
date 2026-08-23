import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssistantFeedbackDto,
  AssistantFeedbackResponseDto,
  NegativeFeedbackReasonCode,
  ASSISTANT_FEEDBACK_RATINGS,
  NEGATIVE_FEEDBACK_REASON_CODES,
  SetAssistantFeedbackDto,
} from './assistant-feedback.dto';

interface FeedbackRow {
  eventId: string;
  ownerUserId: string;
  sessionId: string;
  messageId: string;
  executionId: string | null;
  revision: number;
  eventType: 'set' | 'clear';
  rating: 'positive' | 'negative' | null;
  reasonCode: NegativeFeedbackReasonCode | null;
  sanitizedComment: string | null;
  occurredAt: Date;
}

@Injectable()
export class AssistantFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async set(
    ownerUserId: string,
    sessionId: string,
    messageId: string,
    input: SetAssistantFeedbackDto
  ): Promise<AssistantFeedbackResponseDto> {
    this.assertPath(ownerUserId, sessionId, messageId);
    if (!input || !ASSISTANT_FEEDBACK_RATINGS.includes(input.rating)) {
      throw new BadRequestException('Feedback rating must be positive or negative');
    }
    if (
      input.reasonCode &&
      !NEGATIVE_FEEDBACK_REASON_CODES.includes(input.reasonCode)
    ) {
      throw new BadRequestException('Unknown negative feedback reasonCode');
    }
    if (input.rating === 'positive' && input.reasonCode) {
      throw new BadRequestException('Positive feedback cannot include a reasonCode');
    }
    if (input.rating === 'negative' && !input.reasonCode) {
      throw new BadRequestException('Negative feedback requires a reasonCode');
    }

    const eventId = input.eventId?.trim() || randomUUID();
    const comment = this.sanitizeComment(input.comment);
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) AS lock_fn`,
        `${ownerUserId}:${sessionId}:${messageId}`
      );
      const existingEvent = await tx.$queryRawUnsafe<FeedbackRow[]>(
        `SELECT event_id AS "eventId", owner_user_id AS "ownerUserId", session_id AS "sessionId", message_id AS "messageId",
                execution_id AS "executionId", revision, event_type AS "eventType", rating,
                reason_code AS "reasonCode", sanitized_comment AS "sanitizedComment",
                occurred_at AS "occurredAt"
           FROM assistant_feedback_events
          WHERE event_id = $1
          LIMIT 1`,
        eventId
      );
      if (existingEvent[0]) {
        if (existingEvent[0].ownerUserId !== ownerUserId) {
          throw new BadRequestException('eventId already belongs to another user');
        }
        if (
          existingEvent[0].sessionId !== sessionId ||
          existingEvent[0].messageId !== messageId
        ) {
          throw new BadRequestException('eventId already belongs to another feedback target');
        }
        return existingEvent;
      }

      const current = await tx.$queryRawUnsafe<Array<{ revision: number }>>(
        `SELECT revision
           FROM assistant_feedback_current
          WHERE owner_user_id = $1::uuid AND session_id = $2 AND message_id = $3
          FOR UPDATE`,
        ownerUserId,
        sessionId,
        messageId
      );
      const revision = (current[0]?.revision || 0) + 1;
      await tx.$executeRawUnsafe(
        `INSERT INTO assistant_feedback_events
          (id, event_id, owner_user_id, session_id, message_id, execution_id, revision,
           event_type, rating, reason_code, sanitized_comment)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::uuid, $7, 'set', $8, $9, $10)`,
        randomUUID(),
        eventId,
        ownerUserId,
        sessionId,
        messageId,
        input.executionId || null,
        revision,
        input.rating,
        input.reasonCode || null,
        comment
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO assistant_feedback_current
          (owner_user_id, session_id, message_id, event_id, revision, event_type,
           rating, reason_code, sanitized_comment, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, 'set', $6, $7, $8, NOW())
         ON CONFLICT (owner_user_id, session_id, message_id)
         DO UPDATE SET event_id = EXCLUDED.event_id,
                       revision = EXCLUDED.revision,
                       event_type = EXCLUDED.event_type,
                       rating = EXCLUDED.rating,
                       reason_code = EXCLUDED.reason_code,
                       sanitized_comment = EXCLUDED.sanitized_comment,
                       updated_at = NOW()`,
        ownerUserId,
        sessionId,
        messageId,
        eventId,
        revision,
        input.rating,
        input.reasonCode || null,
        comment
      );
      if (
        input.rating === 'negative' &&
        input.reasonCode === 'unsafe_or_unexpected_side_effect' &&
        input.executionId
      ) {
        const heldHabits = await tx.$queryRawUnsafe<
          Array<{ id: string; sourceCandidateId: string }>
        >(
          `UPDATE user_habits h
              SET status = 'held', updated_at = NOW()
             FROM executions e
            WHERE e.id = $1::uuid
              AND e.created_by = $2::uuid
              AND h.owner_user_id = $2::uuid
              AND h.saved_skill_id = e.skill_id
              AND h.status = 'active'
          RETURNING h.id, h.source_candidate_id AS "sourceCandidateId"`,
          input.executionId,
          ownerUserId
        );
        for (const habit of heldHabits) {
          await tx.$executeRawUnsafe(
            `UPDATE user_habit_candidates
                SET status = 'held', updated_at = NOW()
              WHERE id = $1::uuid`,
            habit.sourceCandidateId
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO habit_governance_audits
              (id, actor_user_id, target_type, target_id, action, reason,
               before_json, after_json)
             VALUES ($1::uuid, $2::uuid, 'habit', $3::uuid, 'auto_hold',
                     'unsafe_or_unexpected_side_effect',
                     '{"status":"active"}'::jsonb, '{"status":"held"}'::jsonb)`,
            randomUUID(),
            ownerUserId,
            habit.id
          );
        }
      }
      return tx.$queryRawUnsafe<FeedbackRow[]>(
        `SELECT event_id AS "eventId", owner_user_id AS "ownerUserId", session_id AS "sessionId", message_id AS "messageId",
                execution_id AS "executionId", revision, event_type AS "eventType", rating,
                reason_code AS "reasonCode", sanitized_comment AS "sanitizedComment",
                occurred_at AS "occurredAt"
           FROM assistant_feedback_events
          WHERE event_id = $1
          LIMIT 1`,
        eventId
      );
    });

    return { feedback: rows[0] ? this.toDto(rows[0]) : null };
  }

  async get(
    ownerUserId: string,
    sessionId: string,
    messageId: string
  ): Promise<AssistantFeedbackResponseDto> {
    this.assertPath(ownerUserId, sessionId, messageId);
    const rows = await this.prisma.$queryRawUnsafe<FeedbackRow[]>(
      `SELECT event_id AS "eventId", owner_user_id AS "ownerUserId", session_id AS "sessionId", message_id AS "messageId",
              NULL::uuid AS "executionId", revision, event_type AS "eventType", rating,
              reason_code AS "reasonCode", sanitized_comment AS "sanitizedComment",
              updated_at AS "occurredAt"
         FROM assistant_feedback_current
        WHERE owner_user_id = $1::uuid AND session_id = $2 AND message_id = $3
        LIMIT 1`,
      ownerUserId,
      sessionId,
      messageId
    );
    return { feedback: rows[0] ? this.toDto(rows[0]) : null };
  }

  async clear(
    ownerUserId: string,
    sessionId: string,
    messageId: string,
    eventId?: string
  ): Promise<AssistantFeedbackResponseDto> {
    this.assertPath(ownerUserId, sessionId, messageId);
    const id = eventId?.trim() || randomUUID();
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        `SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) AS lock_fn`,
        `${ownerUserId}:${sessionId}:${messageId}`
      );
      const existingEvent = await tx.$queryRawUnsafe<FeedbackRow[]>(
        `SELECT event_id AS "eventId", owner_user_id AS "ownerUserId", session_id AS "sessionId", message_id AS "messageId",
                execution_id AS "executionId", revision, event_type AS "eventType", rating,
                reason_code AS "reasonCode", sanitized_comment AS "sanitizedComment",
                occurred_at AS "occurredAt"
           FROM assistant_feedback_events
          WHERE event_id = $1
          LIMIT 1`,
        id
      );
      if (existingEvent[0]) {
        if (existingEvent[0].ownerUserId !== ownerUserId) {
          throw new BadRequestException('eventId already belongs to another user');
        }
        if (
          existingEvent[0].sessionId !== sessionId ||
          existingEvent[0].messageId !== messageId
        ) {
          throw new BadRequestException('eventId already belongs to another feedback target');
        }
        return existingEvent;
      }

      const current = await tx.$queryRawUnsafe<Array<{ revision: number }>>(
        `SELECT revision
           FROM assistant_feedback_current
          WHERE owner_user_id = $1::uuid AND session_id = $2 AND message_id = $3
          FOR UPDATE`,
        ownerUserId,
        sessionId,
        messageId
      );
      const revision = (current[0]?.revision || 0) + 1;
      await tx.$executeRawUnsafe(
        `INSERT INTO assistant_feedback_events
          (id, event_id, owner_user_id, session_id, message_id, revision, event_type)
         VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, 'clear')`,
        randomUUID(),
        id,
        ownerUserId,
        sessionId,
        messageId,
        revision
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO assistant_feedback_current
          (owner_user_id, session_id, message_id, event_id, revision, event_type,
           rating, reason_code, sanitized_comment, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, 'clear', NULL, NULL, NULL, NOW())
         ON CONFLICT (owner_user_id, session_id, message_id)
         DO UPDATE SET event_id = EXCLUDED.event_id,
                       revision = EXCLUDED.revision,
                       event_type = 'clear',
                       rating = NULL,
                       reason_code = NULL,
                       sanitized_comment = NULL,
                       updated_at = NOW()`,
        ownerUserId,
        sessionId,
        messageId,
        id,
        revision
      );
      return tx.$queryRawUnsafe<FeedbackRow[]>(
        `SELECT event_id AS "eventId", owner_user_id AS "ownerUserId", session_id AS "sessionId", message_id AS "messageId",
                execution_id AS "executionId", revision, event_type AS "eventType", rating,
                reason_code AS "reasonCode", sanitized_comment AS "sanitizedComment",
                occurred_at AS "occurredAt"
           FROM assistant_feedback_events
          WHERE event_id = $1
          LIMIT 1`,
        id
      );
    });
    return { feedback: rows[0] ? this.toDto(rows[0]) : null };
  }

  async getAdminOverview(): Promise<{
    phase: 'observation';
    habitLearning: { candidatesEnabled: boolean; activationEnabled: boolean };
    feedback: {
      total: number;
      positive: number;
      negative: number;
      negativeReasons: Array<{ reasonCode: string; count: number }>;
    };
  }> {
    const [counts, reasons] = await Promise.all([
      this.prisma.$queryRawUnsafe<
        Array<{ total: bigint; positive: bigint; negative: bigint }>
      >(
        `SELECT COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE rating = 'positive')::bigint AS positive,
                COUNT(*) FILTER (WHERE rating = 'negative')::bigint AS negative
           FROM assistant_feedback_current
          WHERE event_type = 'set'`
      ),
      this.prisma.$queryRawUnsafe<Array<{ reasonCode: string; count: bigint }>>(
        `SELECT reason_code AS "reasonCode", COUNT(*)::bigint AS count
           FROM assistant_feedback_current
          WHERE event_type = 'set' AND rating = 'negative' AND reason_code IS NOT NULL
          GROUP BY reason_code
          ORDER BY count DESC`
      ),
    ]);
    const row = counts[0];
    return {
      phase: 'observation',
      habitLearning: {
        candidatesEnabled: process.env.HABIT_LEARNING_DAILY_JOB_ENABLED === 'true',
        activationEnabled: process.env.HABIT_LEARNING_ACTIVATION_ENABLED !== 'false',
      },
      feedback: {
        total: Number(row?.total || 0),
        positive: Number(row?.positive || 0),
        negative: Number(row?.negative || 0),
        negativeReasons: reasons.map((item) => ({
          reasonCode: item.reasonCode,
          count: Number(item.count),
        })),
      },
    };
  }

  private assertPath(ownerUserId: string, sessionId: string, messageId: string): void {
    if (
      typeof ownerUserId !== 'string' ||
      !ownerUserId.trim() ||
      typeof sessionId !== 'string' ||
      !sessionId.trim() ||
      typeof messageId !== 'string' ||
      !messageId.trim()
    ) {
      throw new NotFoundException('Feedback target not found');
    }
  }

  private sanitizeComment(value?: string): string | null {
    if (!value) return null;
    const sanitized = Array.from(value)
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code === 9 || code === 10 || code === 13 || code >= 32;
      })
      .join('')
      .trim();
    return sanitized ? sanitized.slice(0, 2000) : null;
  }

  private toDto(row: FeedbackRow): AssistantFeedbackDto {
    return {
      eventId: row.eventId,
      sessionId: row.sessionId,
      messageId: row.messageId,
      executionId: row.executionId || undefined,
      revision: row.revision,
      eventType: row.eventType,
      rating: row.rating || undefined,
      reasonCode: row.reasonCode || undefined,
      comment: row.sanitizedComment || undefined,
      occurredAt: row.occurredAt.toISOString(),
    };
  }
}
