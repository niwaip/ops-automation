import { Test, TestingModule } from '@nestjs/testing';
import { RetryService } from '../src/modules/retry';
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetryService],
    }).compile();

    service = module.get<RetryService>(RetryService);
  });

  describe('getRetryCount', () => {
    it('should return 0 for new step', () => {
      const count = service.getRetryCount('session-1', 'step-1');
      expect(count).toBe(0);
    });

    it('should return incremented count after increment', () => {
      service.incrementRetryCount('session-1', 'step-1');
      const count = service.getRetryCount('session-1', 'step-1');
      expect(count).toBe(1);
    });
  });

  describe('incrementRetryCount', () => {
    it('should increment retry count', () => {
      const newCount = service.incrementRetryCount('session-1', 'step-1');
      expect(newCount).toBe(1);

      const nextCount = service.incrementRetryCount('session-1', 'step-1');
      expect(nextCount).toBe(2);
    });
  });

  describe('clearRetryCount', () => {
    it('should clear retry count for a step', () => {
      service.incrementRetryCount('session-1', 'step-1');
      service.clearRetryCount('session-1', 'step-1');

      const count = service.getRetryCount('session-1', 'step-1');
      expect(count).toBe(0);
    });
  });

  describe('clearSessionRetries', () => {
    it('should clear all retries for a session', () => {
      service.incrementRetryCount('session-1', 'step-1');
      service.incrementRetryCount('session-1', 'step-2');
      service.incrementRetryCount('session-2', 'step-1');

      service.clearSessionRetries('session-1');

      expect(service.getRetryCount('session-1', 'step-1')).toBe(0);
      expect(service.getRetryCount('session-1', 'step-2')).toBe(0);
      expect(service.getRetryCount('session-2', 'step-1')).toBe(1);
    });
  });

  describe('isMaxRetriesExceeded', () => {
    it('should return false when retries not exceeded', () => {
      service.incrementRetryCount('session-1', 'step-1');
      expect(service.isMaxRetriesExceeded('session-1', 'step-1', 3)).toBe(false);
    });

    it('should return true when max retries exceeded', () => {
      for (let i = 0; i < 3; i++) {
        service.incrementRetryCount('session-1', 'step-1');
      }
      expect(service.isMaxRetriesExceeded('session-1', 'step-1', 3)).toBe(true);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff delay', () => {
      const delay1 = service.calculateRetryDelay(0, 1000);
      expect(delay1).toBe(1000);

      const delay2 = service.calculateRetryDelay(1, 1000);
      expect(delay2).toBe(2000);

      const delay3 = service.calculateRetryDelay(2, 1000);
      expect(delay3).toBe(4000);
    });

    it('should cap delay at max_delay_ms', () => {
      const delay = service.calculateRetryDelay(10, 1000);
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });

  describe('shouldRetry', () => {
    it('should return true for retryable errors', () => {
      expect(service.shouldRetry('timeout')).toBe(true);
      expect(service.shouldRetry('network_error')).toBe(true);
      expect(service.shouldRetry('element_not_found')).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(service.shouldRetry('captcha')).toBe(false);
      expect(service.shouldRetry('authentication_failed')).toBe(false);
    });
  });

  describe('determineRetryStrategy', () => {
    it('TC03: should return takeover when max retries exceeded', () => {
      // Exhaust retries
      for (let i = 0; i < 3; i++) {
        service.incrementRetryCount('session-1', 'step-1');
      }

      const decision = service.determineRetryStrategy({
        session_id: 'session-1',
        step_id: 'step-1',
        error_type: 'timeout',
        error_message: 'Timeout waiting for element',
      });

      expect(decision.decision).toBe('takeover');
    });

    it('should return retry for retryable errors', () => {
      const decision = service.determineRetryStrategy({
        session_id: 'session-2',
        step_id: 'step-1',
        error_type: 'timeout',
        error_message: 'Timeout waiting for element',
      });

      expect(decision.decision).toBe('retry');
    });

    it('should return takeover for non-retryable errors', () => {
      const decision = service.determineRetryStrategy({
        session_id: 'session-2',
        step_id: 'step-1',
        error_type: 'captcha_detected',
        error_message: 'Captcha detected on page',
      });

      expect(decision.decision).toBe('takeover');
    });
  });

  describe('recordRetryAttempt', () => {
    it('should record retry attempt in history', () => {
      service.incrementRetryCount('session-1', 'step-1');
      service.recordRetryAttempt('session-1', 'step-1', 'Element not found');

      const history = service.getRetryHistory('session-1');
      expect(history.length).toBe(1);
      expect(history[0].step_id).toBe('step-1');
    });
  });

  describe('getRetryStatistics', () => {
    it('should return retry statistics', () => {
      service.incrementRetryCount('session-1', 'step-1');
      service.recordRetryAttempt('session-1', 'step-1', 'Error');

      const stats = service.getRetryStatistics();
      expect(stats.totalRetries).toBe(1);
    });
  });
});