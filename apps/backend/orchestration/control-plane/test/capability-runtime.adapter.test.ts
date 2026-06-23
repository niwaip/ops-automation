import axios from 'axios';
import { CapabilityRuntimeAdapter } from '../src/modules/execution/capability-runtime.adapter';

jest.mock('axios');

describe('CapabilityRuntimeAdapter', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes execution metadata through to capability runtime execute requests', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        releaseId: 'release-metadata-1',
        capabilityId: 'skill-1',
        publishedSkillId: 'skill-1',
        runtime: 'browser_recording',
        logs: [],
        output: {
          stepResults: [],
        },
      },
    } as any);

    const adapter = new CapabilityRuntimeAdapter();
    await adapter.invokeStep({
      requestId: 'request-metadata-1',
      executionId: 'execution-metadata-1',
      stepId: 'step-metadata-1',
      runtimeType: 'custom',
      runtimeSessionId: 'runtime-metadata-1',
      publishedSkillId: 'skill-1',
      capabilityType: 'skill.runtime',
      action: 'execute',
      input: {
        startUrl: 'http://example.com',
      },
      metadata: {
        capabilityVersion: 'v8',
        phaseKey: 'phase_10_step_10',
        executionStepName: '10. click',
        executionStepIndex: 10,
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3001/capabilities/runtime/execute',
      {
        capabilityId: 'skill-1',
        capabilityVersion: 'v8',
        executionId: 'execution-metadata-1',
        stepId: 'step-metadata-1',
        runtimeSessionId: 'runtime-metadata-1',
        phaseKey: 'phase_10_step_10',
        input: {
          startUrl: 'http://example.com',
        },
        metadata: {
          capabilityVersion: 'v8',
          phaseKey: 'phase_10_step_10',
          executionStepName: '10. click',
          executionStepIndex: 10,
        },
      }
    );
  });

  it('extracts lightweight browser artifact refs from capability runtime output', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        releaseId: 'release-1',
        capabilityId: 'skill-1',
        publishedSkillId: 'skill-1',
        runtime: 'temporal_workflow',
        logs: [],
        output: {
          phaseResults: [
            {
              stepName: '1. 页面打开',
              result: {
                artifacts: [
                  {
                    command: 'screenshot',
                    status: 'success',
                    snapshot: {
                      id: 'snapshot-1',
                      path: '/tmp/snapshot-1.png',
                    },
                    artifact: {
                      path: '/tmp/snapshot-1.png',
                    },
                  },
                ],
              },
            },
            {
              stepName: '2. 页面处理',
              result: {
                artifacts: [
                  {
                    command: 'screenshot',
                    status: 'success',
                    snapshot: {
                      id: 'snapshot-2',
                      path: '/tmp/snapshot-2.png',
                    },
                    artifact: {
                      path: '/tmp/snapshot-2.png',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    } as any);

    const adapter = new CapabilityRuntimeAdapter();
    const result = await adapter.invokeStep({
      requestId: 'request-1',
      executionId: 'execution-1',
      stepId: 'step-1',
      runtimeType: 'custom',
      runtimeSessionId: 'runtime-1',
      publishedSkillId: 'skill-1',
      capabilityType: 'skill.runtime',
      action: 'execute',
      input: {
        startUrl: 'http://example.com',
      },
    });

    expect(result.success).toBe(true);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: 'snapshot',
        id: 'snapshot-1',
        metadata: expect.objectContaining({
          command: 'screenshot',
          snapshotPath: '/tmp/snapshot-1.png',
          artifactPath: '/tmp/snapshot-1.png',
        }),
      }),
      expect.objectContaining({
        type: 'snapshot',
        id: 'snapshot-2',
        metadata: expect.objectContaining({
          command: 'screenshot',
          snapshotPath: '/tmp/snapshot-2.png',
          artifactPath: '/tmp/snapshot-2.png',
        }),
      }),
    ]);
    expect(result.snapshot).toEqual({
      id: 'snapshot-2',
      type: 'browser',
      metadata: expect.objectContaining({
        command: 'screenshot',
        snapshotPath: '/tmp/snapshot-2.png',
        artifactPath: '/tmp/snapshot-2.png',
      }),
    });
  });

  it('maps capability runtime takeover signals into takeover_required status', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: false,
        status: 'takeover_required',
        releaseId: 'release-1',
        capabilityId: 'skill-1',
        publishedSkillId: 'skill-1',
        runtime: 'temporal_workflow',
        logs: [],
        retryable: true,
        requiresTakeover: true,
        takeoverReason: '登录后页面未进入预期状态',
        error: 'browser-worker 执行失败',
        output: {
          phaseResults: [],
        },
      },
    } as any);

    const adapter = new CapabilityRuntimeAdapter();
    const result = await adapter.invokeStep({
      requestId: 'request-2',
      executionId: 'execution-2',
      stepId: 'step-2',
      runtimeType: 'custom',
      runtimeSessionId: 'runtime-2',
      publishedSkillId: 'skill-1',
      capabilityType: 'skill.runtime',
      action: 'execute',
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('takeover_required');
    expect(result.retryable).toBe(true);
    expect(result.requiresTakeover).toBe(true);
    expect(result.takeoverReason).toBe('登录后页面未进入预期状态');
  });
});
