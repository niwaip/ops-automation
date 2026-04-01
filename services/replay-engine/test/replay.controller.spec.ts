import { Test, TestingModule } from '@nestjs/testing';
import { ReplayController } from '../src/replay.controller';
import { ExecutorService } from '../src/modules/executor';
import { CdpService } from '../src/modules/cdp';
import { LogService } from '../src/modules/log';
import { AiService } from '../src/modules/ai-interaction';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('ReplayController', () => {
  let controller: ReplayController;
  let executorService: jest.Mocked<ExecutorService>;
  let cdpService: jest.Mocked<CdpService>;
  let logService: jest.Mocked<LogService>;
  let aiService: jest.Mocked<AiService>;

  beforeEach(async () => {
    // Create mocks
    const mockExecutorService = {
      startExecution: jest.fn().mockResolvedValue('execution-123'),
      stopExecution: jest.fn().mockResolvedValue(true),
      getExecutionStatus: jest.fn().mockReturnValue({
        execution_id: 'execution-123',
        session_id: 'session-123',
        template_id: 'template-123',
        status: 'running',
        current_step_index: 1,
        total_steps: 10,
        started_at: new Date(),
      }),
    };

    const mockCdpService = {
      getConnectionState: jest.fn().mockReturnValue({
        connected: true,
        cdp_url: 'ws://localhost:9222',
      }),
    };

    const mockLogService = {
      getStepLogs: jest.fn().mockResolvedValue([
        {
          id: 'log-1',
          session_id: 'session-123',
          step_id: 'step-1',
          step_index: 0,
          action: 'click',
          started_at: new Date(),
          completed_at: new Date(),
          duration_ms: 500,
          result: 'success',
          retry_count: 0,
          takeover_triggered: false,
        },
      ]),
      getExecutionSummary: jest.fn().mockResolvedValue({
        total_steps: 1,
        successful_steps: 1,
        failed_steps: 0,
        retry_steps: 0,
        takeover_triggered: false,
        total_duration_ms: 500,
      }),
    };

    const mockAiService = {
      checkAvailability: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReplayController],
      providers: [
        { provide: ExecutorService, useValue: mockExecutorService },
        { provide: CdpService, useValue: mockCdpService },
        { provide: LogService, useValue: mockLogService },
        { provide: AiService, useValue: mockAiService },
      ],
    }).compile();

    controller = module.get<ReplayController>(ReplayController);
    executorService = module.get(ExecutorService);
    cdpService = module.get(CdpService);
    logService = module.get(LogService);
    aiService = module.get(AiService);
  });

  describe('startReplay', () => {
    it('should start replay and return execution ID', async () => {
      const result = await controller.startReplay({
        session_id: 'session-123',
        template_id: 'template-123',
        params: { username: 'test' },
      });

      expect(result.execution_id).toBe('execution-123');
      expect(executorService.startExecution).toHaveBeenCalled();
    });
  });

  describe('stopReplay', () => {
    it('should stop replay and return success', async () => {
      const result = await controller.stopReplay({
        session_id: 'session-123',
      });

      expect(result.success).toBe(true);
      expect(executorService.stopExecution).toHaveBeenCalledWith('session-123');
    });
  });

  describe('getExecutionStatus', () => {
    it('should return execution status', async () => {
      const result = await controller.getExecutionStatus('execution-123');

      expect(result.execution_id).toBe('execution-123');
      expect(result.status).toBe('running');
    });
  });

  describe('getStepLogs', () => {
    it('should return step logs for session', async () => {
      const result = await controller.getStepLogs('session-123');

      expect(result.length).toBe(1);
      expect(result[0].session_id).toBe('session-123');
    });
  });

  describe('getCdpStatus', () => {
    it('should return CDP connection status', async () => {
      const result = await controller.getCdpStatus();

      expect(result.connected).toBe(true);
      expect(result.cdp_url).toBe('ws://localhost:9222');
    });
  });

  describe('getAiStatus', () => {
    it('should return AI availability', async () => {
      const result = await controller.getAiStatus();

      expect(result.available).toBe(true);
    });
  });

  describe('getExecutionSummary', () => {
    it('should return execution summary', async () => {
      const result = await controller.getExecutionSummary('session-123');

      expect(result.total_steps).toBe(1);
      expect(result.successful_steps).toBe(1);
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('replay-engine');
      expect(result.cdp_connected).toBe(true);
      expect(result.ai_available).toBe(true);
    });
  });
});