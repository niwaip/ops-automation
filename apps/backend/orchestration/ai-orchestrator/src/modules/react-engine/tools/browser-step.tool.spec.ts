import axios from 'axios';
import { TRACE_ID_HEADER } from '../../../common/trace.util';
import { ControlPlaneClient } from '../../../client/control-plane.client';
import { ExecutionContext } from '../interfaces';
import { BrowserStepTool } from './browser-step.tool';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BrowserStepTool', () => {
  const baseContext: ExecutionContext = {
    sessionId: 'session-1',
    userId: 'user-1',
    userRoles: ['employee'],
    authToken: 'Bearer token-1',
    traceId: 'trace-1',
    executionId: 'execution-1',
    history: [],
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('triggers control-plane takeover with user and trace context when browser runtime requests takeover', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: false,
        shouldTakeover: true,
        takeoverReason: 'Captcha detected',
        snapshotId: 'snapshot-1',
      },
    } as never);

    const controlPlaneClient = {
      triggerTakeover: jest.fn().mockResolvedValue(undefined),
    } as unknown as ControlPlaneClient;

    const tool = new BrowserStepTool(controlPlaneClient);

    const result = await tool.execute(
      {
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
        action: 'click',
        target: '#submit',
      },
      baseContext
    );

    expect(controlPlaneClient.triggerTakeover).toHaveBeenCalledWith(
      'execution-1',
      'Captcha detected',
      {
        authToken: 'Bearer token-1',
        user: {
          userId: 'user-1',
          userRoles: ['employee'],
        },
        extraHeaders: {
          [TRACE_ID_HEADER]: 'trace-1',
        },
        timeout: 10000,
      }
    );
    expect(result.success).toBe(false);
    expect(result.data?.shouldTakeover).toBe(true);
    expect(result.data?.takeoverTriggered).toBe(true);
  });
});
