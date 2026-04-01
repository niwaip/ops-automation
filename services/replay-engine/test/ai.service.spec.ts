import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../src/modules/ai-interaction';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn() as any;

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  describe('decideFailure', () => {
    it('should return decision from AI Orchestrator', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          decision: 'retry',
          reason: 'Transient error, retrying',
        }),
      });

      const decision = await service.decideFailure({
        session_id: 'session-1',
        step_id: 'step-1',
        error_type: 'timeout',
        error_message: 'Element not found',
      });

      expect(decision.decision).toBe('retry');
      expect(decision.reason).toBe('Transient error, retrying');
    });

    it('TC03: should return takeover decision from AI', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          decision: 'takeover',
          reason: 'Human intervention required',
        }),
      });

      const decision = await service.decideFailure({
        session_id: 'session-1',
        step_id: 'step-1',
        error_type: 'captcha_detected',
        error_message: 'Captcha found on page',
      });

      expect(decision.decision).toBe('takeover');
    });

    it('should fallback to takeover on AI timeout', async () => {
      // Mock a rejected promise (simulates network error which triggers fallback)
      (global.fetch as jest.Mock).mockImplementation(() =>
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      // Service has 5 second timeout
      const decision = await service.decideFailure({
        session_id: 'session-1',
        step_id: 'step-1',
        error_type: 'unknown',
        error_message: 'Unknown error',
      });

      expect(decision.decision).toBe('takeover');
    });

    it('should fallback on AI Orchestrator error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const decision = await service.decideFailure({
        session_id: 'session-1',
        step_id: 'step-1',
        error_type: 'timeout',
        error_message: 'Timeout',
      });

      expect(decision.decision).toBe('takeover');
    });

    it('should fallback with skip for non-critical errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const decision = await service.decideFailure({
        session_id: 'session-1',
        step_id: 'step-1',
        error_type: 'optional_step',
        error_message: 'Optional step failed, non_critical',
      });

      expect(decision.decision).toBe('skip');
    });
  });

  describe('recognizeParams', () => {
    it('should return recognized params', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          params: { username: 'test' },
          confidence: 0.95,
        }),
      });

      const result = await service.recognizeParams('template-1', 'Login as test');

      expect(result.params.username).toBe('test');
      expect(result.confidence).toBe(0.95);
    });

    it('should return empty params on failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.recognizeParams('template-1', 'Login');

      expect(result.params).toEqual({});
      expect(result.confidence).toBe(0);
    });
  });

  describe('checkAvailability', () => {
    it('should return true when AI Orchestrator is available', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      const available = await service.checkAvailability();
      expect(available).toBe(true);
    });

    it('should return false when AI Orchestrator is unavailable', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const available = await service.checkAvailability();
      expect(available).toBe(false);
    });
  });

  describe('setOrchestratorUrl', () => {
    it('should update orchestrator URL', () => {
      service.setOrchestratorUrl('http://new-orchestrator:3003');
      // URL is updated internally
    });
  });

  describe('setDecisionTimeout', () => {
    it('should update decision timeout', () => {
      service.setDecisionTimeout(10000);
      // Timeout is updated internally
    });
  });
});