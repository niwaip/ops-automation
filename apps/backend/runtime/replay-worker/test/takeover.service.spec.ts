import { Test, TestingModule } from '@nestjs/testing';
import { TakeoverService } from '../src/modules/takeover';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn() as any;

describe('TakeoverService', () => {
  let service: TakeoverService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TakeoverService],
    }).compile();

    service = module.get<TakeoverService>(TakeoverService);
  });

  describe('triggerTakeover', () => {
    it('TC04: should trigger takeover successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'HUMAN_CONTROL',
        }),
      });

      const result = await service.triggerTakeover({
        session_id: 'session-1',
        step_id: 'step-1',
        reason: 'Captcha detected',
        error_class: 'CaptchaError',
        error_message: 'Captcha found on page',
      });

      expect(result.success).toBe(true);
      expect(result.session_state).toBe('HUMAN_CONTROL');
    });

    it('should handle takeover failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Session not found',
      });

      const result = await service.triggerTakeover({
        session_id: 'invalid-session',
        step_id: 'step-1',
        reason: 'Error',
      });

      expect(result.success).toBe(false);
    });

    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.triggerTakeover({
        session_id: 'session-1',
        step_id: 'step-1',
        reason: 'Error',
      });

      expect(result.success).toBe(false);
      expect(result.session_state).toBe('ERROR');
    });
  });

  describe('releaseTakeover', () => {
    it('should release takeover successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'RUNNING',
        }),
      });

      const result = await service.releaseTakeover('session-1', 'step-2');

      expect(result.success).toBe(true);
      expect(result.session_state).toBe('RUNNING');
    });

    it('should handle release failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid state',
      });

      const result = await service.releaseTakeover('session-1', 'step-1');

      expect(result.success).toBe(false);
    });
  });

  describe('getSessionState', () => {
    it('should return session state', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'RUNNING',
        }),
      });

      const state = await service.getSessionState('session-1');
      expect(state).toBe('RUNNING');
    });

    it('should return null on failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const state = await service.getSessionState('invalid');
      expect(state).toBeNull();
    });
  });

  describe('isInTakeoverState', () => {
    it('should return true when in HUMAN_CONTROL state', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'HUMAN_CONTROL',
        }),
      });

      const isTakeover = await service.isInTakeoverState('session-1');
      expect(isTakeover).toBe(true);
    });

    it('should return false when not in takeover state', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'RUNNING',
        }),
      });

      const isTakeover = await service.isInTakeoverState('session-1');
      expect(isTakeover).toBe(false);
    });
  });

  describe('batchTriggerTakeover', () => {
    it('should trigger takeover for multiple sessions', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ state: 'HUMAN_CONTROL' }),
      });

      const requests = [
        { session_id: 'session-1', step_id: 'step-1', reason: 'Reason 1' },
        { session_id: 'session-2', step_id: 'step-1', reason: 'Reason 2' },
      ];

      const results = await service.batchTriggerTakeover(requests);

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });

  describe('setSessionBrokerUrl', () => {
    it('should update session broker URL', () => {
      service.setSessionBrokerUrl('http://new-broker:3001');
      // URL is updated internally
    });
  });
});
