import axios from 'axios';
import { CapabilityReleaseBrowserRuntimeService } from './capability-release-browser-runtime.service';

jest.mock('axios');

describe('CapabilityReleaseBrowserRuntimeService browser bootstrap', () => {
  it('starts published execution on about:blank and leaves navigation to the standardized step', async () => {
    const post = jest.mocked(axios.post).mockResolvedValue({ data: { success: true } } as any);
    const browserSessionBroker = {
      acquire: jest.fn().mockResolvedValue({
        runtimeSessionId: '11111111-1111-4111-8111-111111111111',
        ownedByRuntime: true,
      }),
      closeOwnedQuietly: jest.fn().mockResolvedValue(undefined),
    };
    const executorResult = {
      releaseId: 'release-1',
      capabilityId: 'skill-1',
      publishedSkillId: 'skill-1',
      runtime: 'browser_recording',
      success: false,
      output: null,
      result: null,
      logs: [],
      error: 'stop after bootstrap',
    } as any;
    const service = new CapabilityReleaseBrowserRuntimeService(
      {
        validateForRuntime: jest.fn().mockReturnValue({
          valid: true,
          errors: [],
          trace: {},
          degradedMode: false,
          executionPlanVersion: 'browser-recording-ir/v1',
        }),
      } as any,
      {
        buildRuntimePlan: jest.fn().mockReturnValue({
          backend: 'cli',
          runtimeStepsToExecute: [
            {
              id: 'step_1',
              name: 'open',
              action: 'goto',
              target: 'https://example.com',
            },
          ],
          targetRuntimeStep: null,
          loopPlan: null,
          initialUrl: 'https://example.com',
          sessionPreferences: { mode: 'agent' },
        }),
      } as any,
      { execute: jest.fn().mockResolvedValue(executorResult) } as any,
      {} as any,
      { reportApproveThresholdDebug: jest.fn() } as any,
      browserSessionBroker as any
    );

    await service.executePublishedSkill(
      { id: 'release-1' } as any,
      'skill-1',
      {},
      'user-1',
      { executionId: 'execution-1' } as any,
      {
        getCurrentSnapshotOrThrow: jest.fn().mockResolvedValue({
          sourcePayload: { apiEndpoints: {} },
        }),
      } as any
    );

    expect(browserSessionBroker.acquire).toHaveBeenCalledWith({
      runtimeSessionId: undefined,
      userId: 'user-1',
      executionId: 'execution-1',
    });
    expect(post).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/browser/init'),
      expect.not.objectContaining({ initialUrl: expect.anything() }),
      { timeout: 60000 }
    );
    expect(post.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        backend: 'cli',
        runtimeSessionId: '11111111-1111-4111-8111-111111111111',
        sessionPreferences: { mode: 'agent' },
      })
    );
    expect(browserSessionBroker.closeOwnedQuietly).toHaveBeenCalledWith(
      expect.objectContaining({ ownedByRuntime: true }),
      'published_browser_template_completed'
    );
  });

  it('skips browser/init and preserves session when runtimeSessionId is already provided by session-broker', async () => {
    const post = jest.mocked(axios.post).mockResolvedValue({ data: { success: true } } as any);
    const browserSessionBroker = {
      acquire: jest.fn().mockResolvedValue({
        runtimeSessionId: '22222222-2222-4222-8222-222222222222',
        ownedByRuntime: false,
      }),
      closeOwnedQuietly: jest.fn().mockResolvedValue(undefined),
    };
    const executorResult = {
      releaseId: 'release-1',
      capabilityId: 'skill-1',
      publishedSkillId: 'skill-1',
      runtime: 'browser_recording',
      success: true,
      output: { articles: 20 },
      result: { articles: 20 },
      logs: [],
      error: null,
    } as any;
    const service = new CapabilityReleaseBrowserRuntimeService(
      {
        validateForRuntime: jest.fn().mockReturnValue({
          valid: true,
          errors: [],
          trace: {},
          degradedMode: false,
          executionPlanVersion: 'browser-recording-ir/v1',
        }),
      } as any,
      {
        buildRuntimePlan: jest.fn().mockReturnValue({
          backend: 'cli',
          runtimeStepsToExecute: [
            {
              id: 'step_1',
              name: 'open',
              action: 'goto',
              target: 'https://example.com',
            },
          ],
          targetRuntimeStep: null,
          loopPlan: null,
          initialUrl: 'https://example.com',
          sessionPreferences: { mode: 'agent' },
        }),
      } as any,
      { execute: jest.fn().mockResolvedValue(executorResult) } as any,
      {
        insertSuccessAudit: jest.fn().mockResolvedValue(undefined),
        buildRuntimePayload: jest.fn().mockReturnValue({ articles: 20 }),
      } as any,
      { reportApproveThresholdDebug: jest.fn() } as any,
      browserSessionBroker as any
    );

    post.mockClear();

    await service.executePublishedSkill(
      { id: 'release-1' } as any,
      'skill-1',
      {},
      'user-1',
      {
        executionId: 'execution-1',
        runtimeSessionId: '22222222-2222-4222-8222-222222222222',
      } as any,
      {
        getCurrentSnapshotOrThrow: jest.fn().mockResolvedValue({
          sourcePayload: { apiEndpoints: {} },
        }),
      } as any
    );

    expect(browserSessionBroker.acquire).toHaveBeenCalledWith({
      runtimeSessionId: '22222222-2222-4222-8222-222222222222',
      userId: 'user-1',
      executionId: 'execution-1',
    });
    // /browser/init should NOT have been called
    expect(post).not.toHaveBeenCalledWith(
      expect.stringContaining('/browser/init'),
      expect.anything(),
      expect.anything()
    );
    // closeOwnedQuietly should be called with ownedByRuntime: false (which makes it a no-op)
    expect(browserSessionBroker.closeOwnedQuietly).toHaveBeenCalledWith(
      expect.objectContaining({ ownedByRuntime: false }),
      'published_browser_template_completed'
    );
  });
});
