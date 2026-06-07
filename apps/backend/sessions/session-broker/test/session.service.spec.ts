import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SessionService } from '../src/modules/session/session.service';
import { RedisService } from '../src/modules/lock/redis.service';
import { LockService } from '../src/modules/lock/lock.service';
import { AllocationService } from '../src/modules/allocation/allocation.service';
import { FreezeService } from '../src/modules/freeze/freeze.service';
import { TemplateClient } from '../src/modules/template/template.client';
import { CdpExecutor } from '../src/modules/execution/cdp.executor';

describe('SessionService', () => {
  let service: SessionService;
  let lockService: jest.Mocked<LockService>;
  let allocationService: jest.Mocked<AllocationService>;
  let freezeService: jest.Mocked<FreezeService>;
  let redisService: jest.Mocked<RedisService>;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440001';
  const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';
  const mockWorkerRef = 'worker-1';
  const mockEndpoints = {
    novnc: 'http://10.0.0.1:8080/vnc.html',
    cdp: 'ws://10.0.0.1:9222',
    vnc: 'vnc://10.0.0.1:5900',
  };

  beforeEach(async () => {
    process.env.SESSION_LOCK_ENABLED = 'true';

    // Create mocks
    const mockLockService = {
      acquireProfileLock: jest.fn(),
      releaseProfileLock: jest.fn(),
      checkProfileLock: jest.fn(),
    };

    const mockAllocationService = {
      allocateWorker: jest.fn(),
      releaseWorker: jest.fn(),
      getWorkerInfo: jest.fn(),
    };

    const mockFreezeService = {
      freezeSession: jest.fn(),
      unfreezeSession: jest.fn(),
    };

    const mockRedisService = {
      hmset: jest.fn(),
      hgetall: jest.fn(),
      hget: jest.fn(),
      hset: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockTemplateClient = {
      getTemplate: jest.fn(),
    };

    const mockCdpExecutor = {
      executeSteps: jest.fn(),
      captureFinalState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: LockService, useValue: mockLockService },
        { provide: AllocationService, useValue: mockAllocationService },
        { provide: FreezeService, useValue: mockFreezeService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: TemplateClient, useValue: mockTemplateClient },
        { provide: CdpExecutor, useValue: mockCdpExecutor },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    lockService = module.get(LockService);
    allocationService = module.get(AllocationService);
    freezeService = module.get(FreezeService);
    redisService = module.get(RedisService);
  });

  describe('createSession', () => {
    // TC01: User has no active session -> POST /sessions -> Created successfully
    it('TC01: should create session when user has no active session', async () => {
      lockService.acquireProfileLock.mockResolvedValue({
        success: true,
        session_id: expect.any(String),
        lock_key: `lock:profile:${mockUserId}`,
      });

      allocationService.allocateWorker.mockResolvedValue({
        worker_id: mockWorkerRef,
        status: 'busy',
        session_id: expect.any(String),
        endpoints: mockEndpoints,
      });

      redisService.hmset.mockResolvedValue('OK');
      redisService.expire.mockResolvedValue(1);
      redisService.set.mockResolvedValue('OK');

      const result = await service.createSession({
        user_id: mockUserId,
      });

      expect(result.session.id).toBeDefined();
      expect(result.session.state).toBe('IDLE');
      expect(result.session.user_id).toBe(mockUserId);
      expect(result.endpoints).toEqual(mockEndpoints);
      expect(lockService.acquireProfileLock).toHaveBeenCalledWith(mockUserId, expect.any(String));
      expect(allocationService.allocateWorker).toHaveBeenCalledWith(expect.any(String), mockUserId);
    });

    // TC02: User already has session -> POST /sessions -> Return 409
    it('TC02: should return 409 when user already has active session', async () => {
      lockService.acquireProfileLock.mockResolvedValue({
        success: false,
        session_id: mockSessionId,
        lock_key: `lock:profile:${mockUserId}`,
      });

      await expect(
        service.createSession({ user_id: mockUserId }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when no workers available', async () => {
      lockService.acquireProfileLock.mockResolvedValue({
        success: true,
        session_id: expect.any(String),
        lock_key: `lock:profile:${mockUserId}`,
      });

      allocationService.allocateWorker.mockResolvedValue(null);
      lockService.releaseProfileLock.mockResolvedValue(true);

      await expect(
        service.createSession({ user_id: mockUserId }),
      ).rejects.toThrow(BadRequestException);

      expect(lockService.releaseProfileLock).toHaveBeenCalledWith(mockUserId, expect.any(String));
    });
  });

  describe('takeoverSession', () => {
    // TC03: Session RUNNING -> POST /sessions/:id/takeover -> State becomes HUMAN_CONTROL
    it('TC03: should transition session from RUNNING to HUMAN_CONTROL on takeover', async () => {
      redisService.hgetall.mockResolvedValue({
        id: mockSessionId,
        user_id: mockUserId,
        state: 'RUNNING',
        control_mode: 'AGENT_RUNNING',
        frozen: '0',
        worker_ref: mockWorkerRef,
        novnc_url: mockEndpoints.novnc,
        cdp_url: mockEndpoints.cdp,
        created_at: '1712345678',
        last_activity: '1712345999',
      });

      freezeService.freezeSession.mockResolvedValue({
        success: true,
        previousState: 'RUNNING',
        newState: 'HUMAN_CONTROL',
        frozen: true,
      });

      redisService.hget.mockResolvedValue('HUMAN_CONTROL');

      const result = await service.takeoverSession(mockSessionId, {
        reason: 'User intervention required',
      });

      expect(freezeService.freezeSession).toHaveBeenCalledWith(mockSessionId);
    });

    it('should throw NotFoundException when session not found', async () => {
      redisService.hgetall.mockResolvedValue({});

      await expect(
        service.takeoverSession(mockSessionId, { reason: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when session not in RUNNING state', async () => {
      redisService.hgetall.mockResolvedValue({
        id: mockSessionId,
        state: 'IDLE',
        frozen: '0',
        created_at: '1712345678',
        last_activity: '1712345999',
      });

      await expect(
        service.takeoverSession(mockSessionId, { reason: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('continueSession', () => {
    // TC04: Session HUMAN_CONTROL -> POST /sessions/:id/continue -> State becomes RUNNING
    it('TC04: should transition session from HUMAN_CONTROL to RUNNING on continue', async () => {
      redisService.hgetall.mockResolvedValue({
        id: mockSessionId,
        user_id: mockUserId,
        state: 'HUMAN_CONTROL',
        control_mode: 'HUMAN_CONTROL',
        frozen: '1',
        worker_ref: mockWorkerRef,
        novnc_url: mockEndpoints.novnc,
        cdp_url: mockEndpoints.cdp,
        created_at: '1712345678',
        last_activity: '1712345999',
      });

      freezeService.unfreezeSession.mockResolvedValue({
        success: true,
        previousState: 'HUMAN_CONTROL',
        newState: 'RUNNING',
        frozen: false,
      });

      const result = await service.continueSession(mockSessionId, {
        step_id: 'fill_username',
      });

      expect(freezeService.unfreezeSession).toHaveBeenCalledWith(mockSessionId, 'fill_username');
    });

    it('should throw BadRequestException when session not in HUMAN_CONTROL state', async () => {
      redisService.hgetall.mockResolvedValue({
        id: mockSessionId,
        state: 'RUNNING',
        frozen: '0',
        created_at: '1712345678',
        last_activity: '1712345999',
      });

      await expect(
        service.continueSession(mockSessionId, { step_id: 'test' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteSession', () => {
    // TC05: Session close -> DELETE /sessions/:id -> Write lock released
    it('TC05: should release write lock when session is deleted', async () => {
      redisService.hgetall.mockResolvedValue({
        id: mockSessionId,
        user_id: mockUserId,
        state: 'RUNNING',
        frozen: '0',
        worker_ref: mockWorkerRef,
        created_at: '1712345678',
        last_activity: '1712345999',
      });

      lockService.releaseProfileLock.mockResolvedValue(true);
      allocationService.releaseWorker.mockResolvedValue(true);
      redisService.hset.mockResolvedValue(1);
      redisService.del.mockResolvedValue(1);

      const result = await service.deleteSession(mockSessionId);

      expect(result.success).toBe(true);
      expect(lockService.releaseProfileLock).toHaveBeenCalledWith(mockUserId, mockSessionId);
      expect(allocationService.releaseWorker).toHaveBeenCalledWith(mockWorkerRef);
    });

    it('should throw NotFoundException when session not found', async () => {
      redisService.hgetall.mockResolvedValue({});

      await expect(service.deleteSession(mockSessionId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSession', () => {
    it('should return session when found', async () => {
      redisService.hgetall.mockResolvedValue({
        id: mockSessionId,
        user_id: mockUserId,
        state: 'RUNNING',
        control_mode: 'AGENT_RUNNING',
        frozen: '0',
        worker_ref: mockWorkerRef,
        novnc_url: mockEndpoints.novnc,
        cdp_url: mockEndpoints.cdp,
        created_at: '1712345678',
        last_activity: '1712345999',
      });

      const result = await service.getSession(mockSessionId);

      expect(result.id).toBe(mockSessionId);
      expect(result.state).toBe('RUNNING');
    });

    it('should throw NotFoundException when session not found', async () => {
      redisService.hgetall.mockResolvedValue({});

      await expect(service.getSession(mockSessionId)).rejects.toThrow(NotFoundException);
    });
  });
});