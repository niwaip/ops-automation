import axios from 'axios';
import { WorkflowRuntimeAdapter } from '../src/modules/execution';

jest.mock('axios');

describe('WorkflowRuntimeAdapter', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps workflow runtime execute requests to capability runtime payload', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        releaseId: 'release-workflow-1',
        capabilityId: 'workflow-skill-1',
        publishedSkillId: 'workflow-skill-1',
        runtime: 'workflow',
        output: {
          completed: true,
          result: 'ok',
        },
        logs: [],
      },
    } as never);

    const adapter = new WorkflowRuntimeAdapter();
    const result = await adapter.invokeStep({
      requestId: 'request-1',
      executionId: 'execution-1',
      stepId: 'step-1',
      runtimeType: 'workflow',
      capabilityType: 'workflow.run',
      publishedSkillId: 'workflow-skill-1',
      action: 'execute_plan',
      input: {
        orderId: 'SO-1',
      },
      metadata: {
        capabilityVersion: 'v3',
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3001/capabilities/runtime/execute',
      expect.objectContaining({
        capabilityId: 'workflow-skill-1',
        capabilityVersion: 'v3',
        executionId: 'execution-1',
        stepId: 'step-1',
        runtimeType: 'workflow',
        input: {
          orderId: 'SO-1',
        },
      })
    );
    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      output: {
        completed: true,
        result: 'ok',
      },
    });
  });
});
