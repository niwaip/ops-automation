import { Test, TestingModule } from '@nestjs/testing';
import { FreezeService } from '../src/modules/freeze/freeze.service';
import { RedisService } from '../src/modules/lock/redis.service';

describe('FreezeService', () => {
  let service: FreezeService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      eval: jest.fn(),
      hget: jest.fn(),
      hset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FreezeService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<FreezeService>(FreezeService);
    redisService = module.get(RedisService);
  });

  describe('freezeSession', () => {
    it('should freeze session successfully', async () => {
      redisService.hget.mockResolvedValueOnce('RUNNING');
      redisService.hget.mockResolvedValueOnce('0');
      redisService.eval.mockResolvedValue(1);

      const result = await service.freezeSession('session-123');

      expect(result.success).toBe(true);
      expect(result.newState).toBe('HUMAN_CONTROL');
      expect(result.frozen).toBe(true);
    });

    it('should not freeze already frozen session', async () => {
      redisService.hget.mockResolvedValueOnce('HUMAN_CONTROL');
      redisService.hget.mockResolvedValueOnce('1');
      redisService.eval.mockResolvedValue(0);

      const result = await service.freezeSession('session-123');

      expect(result.success).toBe(false);
      expect(result.frozen).toBe(true);
    });
  });

  describe('unfreezeSession', () => {
    it('should unfreeze session successfully', async () => {
      redisService.hget.mockResolvedValueOnce('HUMAN_CONTROL');
      redisService.hget.mockResolvedValueOnce('1');
      redisService.eval.mockResolvedValue(1);
      redisService.hset.mockResolvedValue(1);

      const result = await service.unfreezeSession('session-123', 'step-1');

      expect(result.success).toBe(true);
      expect(result.newState).toBe('RUNNING');
      expect(result.frozen).toBe(false);
    });

    it('should not unfreeze non-frozen session', async () => {
      redisService.hget.mockResolvedValueOnce('RUNNING');
      redisService.hget.mockResolvedValueOnce('0');
      redisService.eval.mockResolvedValue(0);

      const result = await service.unfreezeSession('session-123');

      expect(result.success).toBe(false);
      expect(result.frozen).toBe(false);
    });
  });

  describe('isFrozen', () => {
    it('should return true for frozen session', async () => {
      redisService.hget.mockResolvedValue('1');

      const result = await service.isFrozen('session-123');

      expect(result).toBe(true);
    });

    it('should return false for non-frozen session', async () => {
      redisService.hget.mockResolvedValue('0');

      const result = await service.isFrozen('session-123');

      expect(result).toBe(false);
    });
  });
});