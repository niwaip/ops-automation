import { Test, TestingModule } from '@nestjs/testing';
import { AllocationService } from '../src/modules/allocation/allocation.service';
import { RedisService } from '../src/modules/lock/redis.service';

describe('AllocationService', () => {
  let service: AllocationService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      spop: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      sadd: jest.fn(),
      get: jest.fn(),
      smembers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllocationService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<AllocationService>(AllocationService);
    redisService = module.get(RedisService);
  });

  describe('allocateWorker', () => {
    it('should allocate worker successfully', async () => {
      redisService.spop.mockResolvedValue('worker-1');
      redisService.set.mockResolvedValue('OK');

      const result = await service.allocateWorker('session-123');

      expect(result).not.toBeNull();
      expect(result?.worker_id).toBe('worker-1');
      expect(result?.status).toBe('busy');
      expect(result?.session_id).toBe('session-123');
      expect(result?.endpoints).toBeDefined();
    });

    it('should return null when no workers available', async () => {
      redisService.spop.mockResolvedValue(null);

      const result = await service.allocateWorker('session-123');

      expect(result).toBeNull();
    });
  });

  describe('releaseWorker', () => {
    it('should release worker and return to pool', async () => {
      redisService.del.mockResolvedValue(1);
      redisService.sadd.mockResolvedValue(1);

      const result = await service.releaseWorker('worker-1');

      expect(result).toBe(true);
      expect(redisService.del).toHaveBeenCalledWith('worker:pool:busy:worker-1');
      expect(redisService.sadd).toHaveBeenCalledWith('worker:pool:available', ['worker-1']);
    });
  });

  describe('getAvailableWorkerCount', () => {
    it('should return count of available workers', async () => {
      redisService.smembers.mockResolvedValue(['worker-1', 'worker-2', 'worker-3']);

      const result = await service.getAvailableWorkerCount();

      expect(result).toBe(3);
    });
  });

  describe('initializeWorkerPool', () => {
    it('should add workers to pool', async () => {
      redisService.sadd.mockResolvedValue(5);

      await service.initializeWorkerPool(['worker-1', 'worker-2', 'worker-3', 'worker-4', 'worker-5']);

      expect(redisService.sadd).toHaveBeenCalledWith('worker:pool:available', [
        'worker-1', 'worker-2', 'worker-3', 'worker-4', 'worker-5',
      ]);
    });
  });
});