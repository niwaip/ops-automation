import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionOutboxService } from '../execution/outbox/execution-outbox.service';

export interface CreateScheduleFireInput {
  scheduleId: string;
  scheduledAt: Date;
  nextRunAt: Date;
  createdBy: string;
  skillId: string;
  skillVersion?: string;
  input: Record<string, unknown>;
}

@Injectable()
export class ScheduleFireService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: ExecutionOutboxService
  ) {}

  async create(input: CreateScheduleFireInput): Promise<{ created: boolean; fireId?: string }> {
    return this.prisma.$transaction(async (tx) => {
      const fireId = randomUUID();
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO schedule_fires (id, schedule_id, scheduled_at, status)
         VALUES ($1::uuid, $2::uuid, $3, 'pending')
         ON CONFLICT (schedule_id, scheduled_at) DO NOTHING
         RETURNING id`,
        fireId,
        input.scheduleId,
        input.scheduledAt
      );
      if (rows.length === 0) return { created: false };

      await tx.skillSchedule.update({
        where: { id: input.scheduleId },
        data: {
          lastRunAt: input.scheduledAt,
          nextRunAt: input.nextRunAt,
        },
      });
      await this.outbox.enqueue(
        {
          aggregateType: 'schedule_fire',
          aggregateId: fireId,
          eventType: 'schedule.fire.created',
          payload: {
            fireId,
            scheduleId: input.scheduleId,
            scheduledAt: input.scheduledAt.toISOString(),
            createdBy: input.createdBy,
            skillId: input.skillId,
            ...(input.skillVersion ? { skillVersion: input.skillVersion } : {}),
            input: input.input,
          },
        },
        tx
      );
      return { created: true, fireId };
    });
  }
}
