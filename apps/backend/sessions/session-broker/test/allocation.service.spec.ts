import { Test, TestingModule } from '@nestjs/testing';
import { AllocationService } from '../src/modules/allocation/allocation.service';
import { RedisService } from '../src/modules/lock/redis.service';

describe('AllocationService', () => {
  let service: AllocationService;
  let redisService: jest.Mocked<RedisService>;
  let originalFetch: typeof global.fetch;

  const mockEndpoints = {
    novnc: 'http://10.0.0.1:8080/vnc.html',
    cdp: 'ws://10.0.0.1:9222',
    vnc: 'vnc://10.0.0.1:5900',
  };

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(async () => {
    const mockRedisService = {
      set: jest.fn(),
    };

    global.fetch = jest.fn();

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
    it('should allocate worker successfully via HTTP API', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          worker_id: 'worker-1',
          endpoints: mockEndpoints,
        })),
      });

      const result = await service.allocateWorker('session-123', 'user-1');

      expect(result).not.toBeNull();
      expect(result?.worker_id).toBe('worker-1');
      expect(result?.status).toBe('busy');
      expect(result?.session_id).toBe('session-123');
      expect(result?.endpoints).toEqual(mockEndpoints);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/workers'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            user_id: 'user-1',
            runtime_session_id: 'session-123',
          }),
        }),
      );
    });

    it('should return null when HTTP request fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.allocateWorker('session-123');

      expect(result).toBeNull();
    });
  });

  describe('releaseWorker', () => {
    it('should release worker successfully via HTTP API', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      });

      const result = await service.releaseWorker('worker-1');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/workers/worker-1'),
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('should return false when release request fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      const result = await service.releaseWorker('worker-1');

      expect(result).toBe(false);
    });
  });

  describe('getAvailableWorkerCount', () => {
    it('should return static count of 999', async () => {
      const result = await service.getAvailableWorkerCount();
      expect(result).toBe(999);
    });
  });

  describe('initializeWorkerPool', () => {
    it('should ignore initialization call without errors', async () => {
      await expect(service.initializeWorkerPool(['worker-1'])).resolves.not.toThrow();
    });
  });

  describe('updateHeartbeat', () => {
    it('should save heartbeat to Redis with 30s TTL', async () => {
      redisService.set.mockResolvedValue('OK');
      await service.updateHeartbeat('worker-1');
      expect(redisService.set).toHaveBeenCalledWith(
        'worker:heartbeat:worker-1',
        expect.any(String),
        30,
      );
    });
  });
});
