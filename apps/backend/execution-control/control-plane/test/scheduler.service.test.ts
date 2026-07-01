import { SchedulerService } from '../src/modules/scheduler/scheduler.service';
import { CreateScheduleDto, UpdateScheduleDto } from '../src/modules/scheduler/scheduler.dto';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let prismaMock: any;
  let executionServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      skillSchedule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(async (cb) => cb(prismaMock)),
    };

    executionServiceMock = {
      create: jest.fn().mockResolvedValue({ id: 'execution-123' }),
    };

    service = new SchedulerService(prismaMock, executionServiceMock);
  });

  describe('create', () => {
    it('creates a new schedule and calculates nextRunAt', async () => {
      const dto: CreateScheduleDto = {
        name: 'Test Task',
        description: 'Runs daily',
        skillId: 'skill-uuid',
        input: { key: 'value' },
        cronExpression: '0 9 * * *', // daily at 9am
        timezone: 'UTC',
      };

      prismaMock.skillSchedule.create.mockImplementation(({ data }: any) => ({
        id: 'schedule-123',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.create('user-123', dto);

      expect(result.id).toBe('schedule-123');
      expect(result.name).toBe(dto.name);
      expect(result.skillId).toBe(dto.skillId);
      expect(result.cronExpression).toBe(dto.cronExpression);
      expect(result.nextRunAt).toBeInstanceOf(Date);
      expect(prismaMock.skillSchedule.create).toHaveBeenCalled();
    });

    it('throws error for invalid cron expression', async () => {
      const dto: CreateScheduleDto = {
        name: 'Bad Task',
        skillId: 'skill-uuid',
        input: {},
        cronExpression: 'invalid-cron',
        timezone: 'UTC',
      };

      await expect(service.create('user-123', dto)).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('update', () => {
    it('updates properties and recalculates nextRunAt', async () => {
      const current = {
        id: 'schedule-123',
        name: 'Old Task',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        isActive: true,
      };

      prismaMock.skillSchedule.findUnique.mockResolvedValue(current);
      prismaMock.skillSchedule.update.mockImplementation(({ data }: any) => ({
        ...current,
        ...data,
        updatedAt: new Date(),
      }));

      const dto: UpdateScheduleDto = {
        name: 'New Name',
        cronExpression: '*/5 * * * *', // every 5 minutes
      };

      const result = await service.update('schedule-123', dto);

      expect(result.name).toBe('New Name');
      expect(result.cronExpression).toBe('*/5 * * * *');
      expect(result.nextRunAt).toBeInstanceOf(Date);
      expect(prismaMock.skillSchedule.update).toHaveBeenCalled();
    });
  });

  describe('tick', () => {
    it('queries due tasks, calculates next run, updates schedule, and triggers execution', async () => {
      const dueSchedule = {
        id: 'schedule-123',
        name: 'Due Task',
        skill_id: 'skill-uuid',
        skill_version: 'v1',
        input_json: { hello: 'world' },
        cron_expression: '0 9 * * *',
        timezone: 'UTC',
        created_by: 'user-123',
      };

      // Mock database query returns 1 due schedule
      prismaMock.$queryRawUnsafe.mockResolvedValue([dueSchedule]);

      await service.tick();

      // Should run updates and execution creation inside a transaction
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
      expect(prismaMock.skillSchedule.update).toHaveBeenCalledWith({
        where: { id: 'schedule-123' },
        data: {
          lastRunAt: expect.any(Date),
          nextRunAt: expect.any(Date),
        },
      });
      expect(executionServiceMock.create).toHaveBeenCalledWith('user-123', {
        skillId: 'skill-uuid',
        skillVersion: 'v1',
        input: { hello: 'world' },
        triggerType: 'schedule',
        scheduleId: 'schedule-123',
      });
    });

    it('handles tick failure gracefully without throwing', async () => {
      prismaMock.$queryRawUnsafe.mockRejectedValue(new Error('DB Connection Timeout'));
      
      // Should not throw
      await expect(service.tick()).resolves.toBeUndefined();
    });
  });

  describe('triggerManually', () => {
    it('triggers execution immediately', async () => {
      const schedule = {
        id: 'schedule-123',
        skillId: 'skill-uuid',
        skillVersion: 'v1',
        inputJson: { foo: 'bar' },
        createdBy: 'user-123',
      };

      prismaMock.skillSchedule.findUnique.mockResolvedValue(schedule);

      const result = await service.triggerManually('schedule-123', 'user-456');

      expect(result).toBe(true);
      expect(executionServiceMock.create).toHaveBeenCalledWith('user-456', {
        skillId: 'skill-uuid',
        skillVersion: 'v1',
        input: { foo: 'bar' },
        triggerType: 'schedule',
        scheduleId: 'schedule-123',
      });
    });
  });
});
