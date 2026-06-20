import axios from 'axios';
import { BrowserPhaseRecoveryPlanner } from '../src/modules/execution/browser-phase-recovery.planner';

jest.mock('axios');

describe('BrowserPhaseRecoveryPlanner', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;
  const planner = new BrowserPhaseRecoveryPlanner();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns retry_same_phase for retryable failures within maxAutoRetries', async () => {
    await expect(
      planner.plan({
        executionId: 'execution-1',
        phaseKey: 'phase_login',
        attempt: 1,
        commands: [],
        policy: {
          maxAutoRetries: 1,
        },
        result: {
          success: false,
          status: 'failed',
          stepResults: [],
          retryable: true,
          errorMessage: 'timeout',
        },
      })
    ).resolves.toEqual({
      action: 'retry_same_phase',
      reason: 'timeout',
    });
  });

  it('returns takeover_required when runtime explicitly requests takeover', async () => {
    await expect(
      planner.plan({
        executionId: 'execution-1',
        phaseKey: 'phase_login',
        attempt: 1,
        commands: [],
        policy: {
          allowHumanTakeover: true,
        },
        result: {
          success: false,
          status: 'takeover_required',
          stepResults: [],
          requiresTakeover: true,
          takeoverReason: 'captcha detected',
        },
      })
    ).resolves.toEqual({
      action: 'takeover_required',
      reason: 'captcha detected',
    });
  });

  it('falls back to takeover_required when human takeover is allowed and recovery cannot continue automatically', async () => {
    await expect(
      planner.plan({
        executionId: 'execution-1',
        phaseKey: 'phase_login',
        attempt: 2,
        commands: [],
        policy: {
          maxAutoRetries: 1,
          allowHumanTakeover: true,
        },
        result: {
          success: false,
          status: 'failed',
          stepResults: [],
          retryable: false,
          errorMessage: 'selector not found',
        },
      })
    ).resolves.toEqual({
      action: 'takeover_required',
      reason: 'selector not found',
    });
  });

  it('returns retry_with_patch from AI planner when retryable failures exhaust auto retries and AI recovery is allowed', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        action: 'retry_with_patch',
        reason: 'Replace fragile selector',
        patch: {
          type: 'replace_selector',
          failed_step_id: 'step-1',
          selector: '[data-testid="username"]',
        },
      },
    } as never);

    await expect(
      planner.plan({
        executionId: 'execution-1',
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        attempt: 2,
        commands: [
          {
            stepId: 'step-1',
            capabilityType: 'browser_step',
            action: 'fill',
            input: { selector: 'input[name=username]', value: 'demo' },
          },
        ],
        policy: {
          maxAutoRetries: 1,
          allowAiRecovery: true,
        },
        result: {
          success: false,
          status: 'failed',
          stepResults: [],
          retryable: true,
          errorMessage: 'selector timeout',
          failedStepId: 'step-1',
        },
      })
    ).resolves.toEqual({
      action: 'retry_with_patch',
      reason: 'Replace fragile selector',
      patch: {
        type: 'replace_selector',
        failedStepId: 'step-1',
        selector: '[data-testid="username"]',
        note: undefined,
      },
    });
  });

  it('returns abort for non-retryable failures', async () => {
    await expect(
      planner.plan({
        executionId: 'execution-1',
        phaseKey: 'phase_login',
        attempt: 1,
        commands: [],
        result: {
          success: false,
          status: 'failed',
          stepResults: [],
          retryable: false,
          errorMessage: 'validation failed',
        },
      })
    ).resolves.toEqual({
      action: 'abort',
      reason: 'validation failed',
    });
  });
});
