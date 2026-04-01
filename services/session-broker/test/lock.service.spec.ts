import { Test, TestingModule } from '@nestjs/testing';
import { LockService } from '../src/modules/lock/lock.service';
import { RedisService } from '../src/modules/lock/redis.service';

describe('LockService', () => {
  let service: LockService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      eval: jest.fn(),
      ttl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LockService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<LockService>(LockService);
    redisService = module.get(RedisService);
  });

  describe('acquireProfileLock', () => {
    it('should acquire lock successfully when not held', async () => {
      redisService.set.mockResolvedValue('OK');

      const result = await service.acquireProfileLock('user-123', 'session-123');

      expect(result.success).toBe(true);
      expect(result.session_id).toBe('session-123');
      expect(redisService.set).toHaveBeenCalledWith(
        'lock:profile:user-123',
        'session-123',
        7200,
      );
    });

    it('should fail to acquire lock when already held', async () => {
      redisService.set.mockResolvedValue(null);
      redisService.get.mockResolvedValue('other-session');

      const result = await service.acquireProfileLock('user-123', 'session-123');

      expect(result.success).toBe(false);
    });
  });

  describe('releaseProfileLock', () => {
    it('should release lock when owned by session', async () => {
      redisService.eval.mockResolvedValue(1);

      const result = await service.releaseProfileLock('user-123', 'session-123');

      expect(result).toBe(true);
    });

    it('should not release lock when not owned', async () => {
      redisService.eval.mockResolvedValue(0);

      const result = await service.releaseProfileLock('user-123', 'session-123');

      expect(result).toBe(false);
    });
  });

  describe('checkProfileLock', () => {
    it('should return holder session id', async () => {
      redisService.get.mockResolvedValue('session-123');

      const result = await service.checkProfileLock('user-123');

      expect(result).toBe('session-123');
    });

    it('should return null when no lock held', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.checkProfileLock('user-123');

      expect(result).toBeNull();
    });
  });
});