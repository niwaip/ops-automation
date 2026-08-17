import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionService } from '../execution/execution.service';
import { CreateScheduleDto, UpdateScheduleDto, ScheduleDto } from './scheduler.dto';
import * as parser from 'cron-parser';
import { SavedSkillResolverService } from '../saved-skill/saved-skill-resolver.service';
import { configureSavedSkillExecution } from '../saved-skill/saved-skill-runtime-params';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
    @Optional() private readonly savedSkillResolver?: SavedSkillResolverService
  ) {}

  onModuleInit() {
    this.logger.log('Scheduler Service initialized. Starting task check loop...');
    // Run task check every 30 seconds
    this.timer = setInterval(() => this.tick(), 30000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.log('Scheduler Service stopped.');
    }
  }

  /**
   * Main scheduler tick.
   * Finds due tasks, locks them, triggers executions, and updates schedules.
   */
  async tick() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      // Find active schedules that are due
      // Use raw query for "FOR UPDATE SKIP LOCKED" to support horizontal scaling safety (HA)
      const now = new Date();
      const dueSchedules = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM skill_schedules 
         WHERE is_active = true AND next_run_at <= $1 
         FOR UPDATE SKIP LOCKED 
         LIMIT 10`,
        now
      );

      if (dueSchedules.length > 0) {
        this.logger.log(`Found ${dueSchedules.length} due schedules to process.`);
      }

      for (const rawSchedule of dueSchedules) {
        // Map raw database columns (snake_case) to typescript properties if necessary
        const schedule = {
          id: rawSchedule.id,
          name: rawSchedule.name,
          skillId: rawSchedule.skill_id,
          skillVersion: rawSchedule.skill_version,
          inputJson: rawSchedule.input_json,
          cronExpression: rawSchedule.cron_expression,
          timezone: rawSchedule.timezone,
          createdBy: rawSchedule.created_by,
        };

        try {
          await this.processSchedule(schedule);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to process schedule ${schedule.id} (${schedule.name}): ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error in scheduler tick: ${msg}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSchedule(schedule: {
    id: string;
    name: string;
    skillId: string;
    skillVersion?: string;
    inputJson: any;
    cronExpression: string;
    timezone: string;
    createdBy: string;
  }) {
    this.logger.log(`Triggering schedule: ${schedule.name} (${schedule.id}) for skill ${schedule.skillId}`);

    // 1. Calculate next execution time
    const now = new Date();
    let nextRunAt: Date;
    try {
      const interval = parser.parseExpression(schedule.cronExpression, {
        currentDate: now,
        tz: schedule.timezone,
      });
      nextRunAt = interval.next().toDate();
    } catch (err) {
      throw new Error(`Invalid cron expression "${schedule.cronExpression}": ${err}`);
    }

    // 2. Perform DB update and Execution create in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Update schedule runtime info
      await tx.skillSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          nextRunAt: nextRunAt,
        },
      });

      // Create skill execution under creator's user ID
      await this.executionService.create(schedule.createdBy, {
        skillId: schedule.skillId,
        skillVersion: schedule.skillVersion,
        input: schedule.inputJson || {},
        triggerType: 'schedule',
        scheduleId: schedule.id,
      } as any); // cast to any temporarily until CreateExecutionDto is updated
    });

    this.logger.log(`Successfully triggered schedule: ${schedule.id}. Next run set to: ${nextRunAt.toISOString()}`);
  }

  // --- CRUD API Methods ---

  async create(userId: string, dto: CreateScheduleDto): Promise<ScheduleDto> {
    // Validate cron expression
    let nextRunAt: Date;
    try {
      const interval = parser.parseExpression(dto.cronExpression, {
        currentDate: new Date(),
        tz: dto.timezone || 'UTC',
      });
      nextRunAt = interval.next().toDate();
    } catch (err) {
      throw new Error(`Invalid cron expression "${dto.cronExpression}": ${err}`);
    }

    if (this.savedSkillResolver) {
      const savedSkill = await this.savedSkillResolver.resolveForExecution(
        userId,
        dto.skillId,
        dto.skillVersion
      );
      if (savedSkill) {
        this.assertKnownSavedSkillOverrides(savedSkill, dto.input);
      }
    }
    const schedule = await this.prisma.skillSchedule.create({
      data: {
        name: dto.name,
        description: dto.description,
        skillId: dto.skillId,
        skillVersion: dto.skillVersion,
        inputJson: dto.input as any,
        cronExpression: dto.cronExpression,
        timezone: dto.timezone || 'UTC',
        nextRunAt: nextRunAt,
        createdBy: userId,
      },
    });

    return this.mapToDto(schedule);
  }

  async list(userId: string): Promise<ScheduleDto[]> {
    const schedules = await this.prisma.skillSchedule.findMany({
      where: { createdBy: userId },
      orderBy: { createdAt: 'desc' },
    });
    return schedules.map(s => this.mapToDto(s));
  }

  async getById(id: string, userId: string): Promise<ScheduleDto | null> {
    const schedule = await this.prisma.skillSchedule.findFirst({
      where: { id, createdBy: userId },
    });
    if (!schedule) return null;
    return this.mapToDto(schedule);
  }

  async update(id: string, userId: string, dto: UpdateScheduleDto): Promise<ScheduleDto> {
    const current = await this.prisma.skillSchedule.findFirst({
      where: { id, createdBy: userId },
    });
    if (!current) {
      throw new Error(`Schedule with ID ${id} not found.`);
    }
    if (this.savedSkillResolver) {
      const savedSkill = await this.savedSkillResolver.resolveForExecution(
        userId,
        current.skillId,
        current.skillVersion || undefined
      );
      if (savedSkill && dto.input !== undefined) {
        this.assertKnownSavedSkillOverrides(savedSkill, dto.input);
      }
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.input !== undefined) updateData.inputJson = dto.input as any;
    if (dto.cronExpression !== undefined) updateData.cronExpression = dto.cronExpression;
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    // Recalculate nextRunAt if cron, timezone or status changes
    if (dto.cronExpression || dto.timezone || dto.isActive === true) {
      const cron = dto.cronExpression || current.cronExpression;
      const tz = dto.timezone || current.timezone;
      try {
        const interval = parser.parseExpression(cron, {
          currentDate: new Date(),
          tz: tz,
        });
        updateData.nextRunAt = interval.next().toDate();
      } catch (err) {
        throw new Error(`Invalid cron expression "${cron}": ${err}`);
      }
    }

    const updated = await this.prisma.skillSchedule.update({
      where: { id },
      data: updateData,
    });

    return this.mapToDto(updated);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const current = await this.prisma.skillSchedule.findFirst({
      where: { id, createdBy: userId },
      select: { id: true },
    });
    if (!current) {
      throw new Error(`Schedule with ID ${id} not found.`);
    }
    await this.prisma.skillSchedule.delete({
      where: { id },
    });
    return true;
  }

  async triggerManually(id: string, userId: string): Promise<boolean> {
    const schedule = await this.prisma.skillSchedule.findFirst({
      where: { id, createdBy: userId },
    });
    if (!schedule) {
      throw new Error(`Schedule with ID ${id} not found.`);
    }

    // Trigger execution immediately without modifying the schedule's nextRunAt
    await this.executionService.create(userId, {
      skillId: schedule.skillId,
      skillVersion: schedule.skillVersion || undefined,
      input: (schedule.inputJson as any) || {},
      triggerType: 'schedule',
      scheduleId: schedule.id,
    } as any);

    return true;
  }

  private assertKnownSavedSkillOverrides(
    savedSkill: {
      planSnapshot: Record<string, unknown>;
      fixedInput: Record<string, unknown>;
    },
    input: Record<string, unknown>
  ): void {
    const configured = configureSavedSkillExecution(
      savedSkill.planSnapshot as unknown as DeterministicPlanDraftV1,
      savedSkill.fixedInput,
      input
    );
    if (configured.unknownOverrideKeys.length > 0) {
      throw new BadRequestException(
        `Saved workflow contains unknown runtime parameters: ${configured.unknownOverrideKeys.join(', ')}`
      );
    }
  }

  private mapToDto(s: any): ScheduleDto {
    return {
      id: s.id,
      name: s.name,
      description: s.description || undefined,
      skillId: s.skillId,
      skillVersion: s.skillVersion || undefined,
      input: s.inputJson as Record<string, unknown>,
      cronExpression: s.cronExpression,
      timezone: s.timezone,
      isActive: s.isActive,
      lastRunAt: s.lastRunAt || undefined,
      nextRunAt: s.nextRunAt,
      createdBy: s.createdBy,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
