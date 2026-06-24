import { Test, TestingModule } from '@nestjs/testing';
import { DeciderService } from '../src/modules/decider/decider.service';
import { DecideFailureDTO, DecideFailureResponseDTO } from '../src/interfaces';

describe('DeciderService', () => {
  let service: DeciderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeciderService],
    }).compile();

    service = module.get<DeciderService>(DeciderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('decideFailure', () => {
    it('should decide takeover for captcha error', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'test-step',
        error_type: 'captcha_detected',
        error_message: 'CAPTCHA verification required',
      };

      const result = await service.decideFailure(dto);

      expect(result.decision).toBe('takeover');
      expect(result.reason).toContain('human intervention');
    });

    it('should decide retry for timeout error', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'test-step',
        error_type: 'timeout',
        error_message: 'Element not found within timeout',
      };

      const result = await service.decideFailure(dto);

      expect(result.decision).toBe('retry');
      expect(result.reason).toContain('transient');
    });

    it('should decide skip for optional step failure', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'test-step',
        error_type: 'optional_step_failed',
        error_message: 'Optional element not found',
      };

      const result = await service.decideFailure(dto);

      expect(result.decision).toBe('skip');
      expect(result.reason).toContain('non-critical');
    });

    it('should decide takeover for MFA required', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'test-step',
        error_type: 'mfa_required',
        error_message: 'Multi-factor authentication required',
      };

      const result = await service.decideFailure(dto);

      expect(result.decision).toBe('takeover');
    });

    it('should fallback to takeover for unknown errors', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'test-step',
        error_type: 'unknown_error',
        error_message: 'Something unexpected happened',
      };

      const result = await service.decideFailure(dto);

      expect(result.decision).toBe('takeover');
      expect(result.reason).toContain('Unknown error');
    });

    it('should return decision within 5 seconds', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'test-step',
        error_type: 'timeout',
        error_message: 'Timeout occurred',
      };

      const start = Date.now();
      const result = await service.decideFailure(dto);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
      expect(result).toBeDefined();
    });

    it('should max out retries and change strategy', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'same-step',
        error_type: 'timeout',
        error_message: 'Timeout occurred again',
      };

      // First retries
      for (let i = 0; i < 3; i++) {
        const result = await service.decideFailure(dto);
        expect(result.decision).toBe('retry');
      }

      // After max retries
      const result = await service.decideFailure(dto);
      expect(result.decision).not.toBe('retry');
    });
  });

  describe('recordOutcome', () => {
    it('should record failure outcome', () => {
      const dto: DecideFailureDTO = {
        session_id: 'test-session',
        step_id: 'test-step',
        error_type: 'timeout',
        error_message: 'Timeout',
      };

      service.recordOutcome(dto, 'retry', 'success');

      const stats = service.getStatistics();
      expect(stats.totalFailures).toBe(1);
      expect(stats.successRate).toBe(1);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', () => {
      const stats = service.getStatistics();

      expect(stats.totalFailures).toBe(0);
      expect(stats.takeoverCount).toBe(0);
      expect(stats.retryCount).toBe(0);
      expect(stats.skipCount).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('clearSessionRetries', () => {
    it('should clear retries for session', async () => {
      const dto: DecideFailureDTO = {
        session_id: 'session-to-clear',
        step_id: 'step-1',
        error_type: 'timeout',
        error_message: 'Timeout',
      };

      await service.decideFailure(dto);
      service.clearSessionRetries('session-to-clear');

      // Retry count should be cleared
      await service.decideFailure(dto);
      // Should get retry again since counter was cleared
    });
  });
});
