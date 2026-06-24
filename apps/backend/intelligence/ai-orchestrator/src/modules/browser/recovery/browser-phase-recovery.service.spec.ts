import { BrowserPhaseRecoveryService } from './browser-phase-recovery.service';

describe('BrowserPhaseRecoveryService', () => {
  const modelService = {
    resolveModelId: jest.fn(),
    getClient: jest.fn(),
    getDefaultModel: jest.fn(),
    getPromptCachingConfig: jest.fn().mockReturnValue(undefined),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    modelService.getPromptCachingConfig.mockReturnValue(undefined);
  });

  it('returns a constrained retry_with_patch decision from model JSON output', async () => {
    const client = {
      chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          action: 'retry_with_patch',
          reason: 'Use a stable test id selector',
          patch: {
            type: 'replace_selector',
            failed_step_id: 'step-1',
            selector: '[data-testid="submit"]',
          },
        }),
      }),
    };
    modelService.resolveModelId.mockResolvedValue('model-1');
    modelService.getClient.mockReturnValue(client);

    const service = new BrowserPhaseRecoveryService(modelService as never);
    const result = await service.planRecovery({
      execution_id: 'execution-1',
      phase_key: 'phase_submit',
      attempt: 2,
      modelId: 'model-1',
      commands: [
        {
          step_id: 'step-1',
          action: 'click',
          input: { selector: 'button.submit' },
        },
      ],
      result: {
        failed_step_id: 'step-1',
        failed_action: 'click',
        error_message: 'selector timeout',
        retryable: true,
      },
    });

    expect(client.chatCompletion).toHaveBeenCalled();
    expect(result).toEqual({
      action: 'retry_with_patch',
      reason: 'Use a stable test id selector',
      patch: {
        type: 'replace_selector',
        failed_step_id: 'step-1',
        selector: '[data-testid="submit"]',
        note: undefined,
      },
    });
  });

  it('falls back to takeover_required for captcha-like failures without a model', async () => {
    modelService.getDefaultModel.mockReturnValue(null);
    const service = new BrowserPhaseRecoveryService(modelService as never);

    const result = await service.planRecovery({
      execution_id: 'execution-1',
      phase_key: 'phase_login',
      attempt: 1,
      commands: [
        {
          step_id: 'step-1',
          action: 'fill',
        },
      ],
      result: {
        failed_step_id: 'step-1',
        error_code: 'CAPTCHA',
        error_message: 'captcha detected',
        takeover_reason: 'captcha detected',
      },
    });

    expect(result).toEqual({
      action: 'takeover_required',
      reason: 'captcha detected',
      patch: null,
    });
  });
});
