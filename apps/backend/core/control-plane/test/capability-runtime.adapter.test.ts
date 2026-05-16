import axios from 'axios';
import { CapabilityRuntimeAdapter } from '../src/modules/execution/capability-runtime.adapter';

jest.mock('axios');

describe('CapabilityRuntimeAdapter', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
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
});
