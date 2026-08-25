import { CONTROL_PLANE_EXECUTION_STATUS } from '../../client/control-plane.contracts';
import { StreamEventType } from '../react-engine/interfaces';
import { ChatTaskResumeService } from './chat-task-resume.service';

describe('ChatTaskResumeService', () => {
  const collect = async (events: AsyncIterable<unknown>) => {
    const result: unknown[] = [];
    for await (const event of events) result.push(event);
    return result;
  };

  const createService = () => {
    const controlPlaneClient = {
      getExecution: jest.fn(),
      submitExecutionInput: jest.fn(),
    };
    const waitingInputService = {
      buildControlPlaneRequestOptions: jest.fn((authToken?: string, user?: unknown) => ({
        authToken,
        user,
      })),
      loadWaitingInputDetails: jest.fn(),
      buildWaitingInputPayload: jest.fn(),
      extractExecutionSemantic: jest.fn(),
      buildWaitingInputSubmissionFeedback: jest.fn(),
    };
    const executionStreamService = {
      buildLatestExecutionStateEvent: jest.fn(),
      observeExecution: jest.fn(),
    };
    return {
      service: new ChatTaskResumeService(
        controlPlaneClient as any,
        waitingInputService as any,
        executionStreamService as any
      ),
      controlPlaneClient,
      waitingInputService,
      executionStreamService,
    };
  };

  const request = {
    executionId: 'execution-1',
    message: '',
    authToken: 'Bearer token',
    user: { userId: 'user-1', userRoles: ['employee'] },
  };

  it('does not claim requests without an execution id', async () => {
    const { service, controlPlaneClient } = createService();
    await expect(service.prepare({ ...request, executionId: undefined })).resolves.toEqual({
      handled: false,
    });
    expect(controlPlaneClient.getExecution).not.toHaveBeenCalled();
  });

  it('observes an active execution without invoking the planner', async () => {
    const { service, controlPlaneClient, executionStreamService } = createService();
    controlPlaneClient.getExecution.mockResolvedValue({
      status: CONTROL_PLANE_EXECUTION_STATUS.RUNNING,
    });
    executionStreamService.observeExecution.mockImplementation(async function* () {
      yield { type: StreamEventType.OBSERVATION, content: 'step completed' };
    });

    const prepared = await service.prepare(request);
    expect(prepared.handled).toBe(true);
    if (!prepared.handled) throw new Error('expected handled result');
    await expect(collect(prepared.events)).resolves.toEqual([
      expect.objectContaining({ type: StreamEventType.THOUGHT }),
      { type: StreamEventType.OBSERVATION, content: 'step completed' },
    ]);
  });

  it('submits waiting input and resumes the same execution', async () => {
    const { service, controlPlaneClient, waitingInputService, executionStreamService } =
      createService();
    controlPlaneClient.getExecution.mockResolvedValue({
      status: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
      skillId: 'skill-1',
      normalizedInput: { objective: 'send report' },
    });
    waitingInputService.loadWaitingInputDetails.mockResolvedValue({
      waitingStepId: 'step-1',
      missingInputs: [{ name: 'recipient' }],
      allRequiredInputs: [{ name: 'recipient' }],
    });
    waitingInputService.buildWaitingInputPayload.mockResolvedValue({
      input: { recipient: 'ops@example.com' },
      usage: { totalTokens: 10 },
    });
    executionStreamService.buildLatestExecutionStateEvent.mockResolvedValue({
      type: StreamEventType.OBSERVATION,
      content: 'resumed',
    });
    executionStreamService.observeExecution.mockImplementation(async function* () {
      yield { type: StreamEventType.RESULT, content: 'done' };
    });

    const prepared = await service.prepare({ ...request, message: 'ops@example.com' });
    if (!prepared.handled) throw new Error('expected handled result');
    await expect(collect(prepared.events)).resolves.toEqual([
      { type: StreamEventType.THOUGHT, content: '正在提交您补充的信息...' },
      { type: StreamEventType.THOUGHT, content: '信息已提交，任务继续执行。' },
      { type: StreamEventType.RESULT, content: 'done' },
    ]);
    expect(controlPlaneClient.submitExecutionInput).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({ stepId: 'step-1' }),
      expect.any(Object)
    );
  });

  it('fails closed when waiting state has no waiting step', async () => {
    const { service, controlPlaneClient, waitingInputService } = createService();
    controlPlaneClient.getExecution.mockResolvedValue({
      status: CONTROL_PLANE_EXECUTION_STATUS.WAITING_INPUT,
    });
    waitingInputService.loadWaitingInputDetails.mockResolvedValue({
      waitingStepId: undefined,
      missingInputs: [],
      allRequiredInputs: [],
    });

    const prepared = await service.prepare({ ...request, message: 'value' });
    if (!prepared.handled) throw new Error('expected handled result');
    await expect(collect(prepared.events)).resolves.toEqual([
      expect.objectContaining({ type: StreamEventType.THOUGHT }),
      expect.objectContaining({ type: StreamEventType.ERROR }),
    ]);
  });

  it('allows a missing execution to start a new plan but stops on auth failure', async () => {
    const { service, controlPlaneClient } = createService();
    controlPlaneClient.getExecution.mockRejectedValueOnce({
      response: { status: 404 },
      message: 'not found',
    });
    await expect(service.prepare(request)).resolves.toEqual({ handled: false });

    controlPlaneClient.getExecution.mockRejectedValueOnce({
      response: { status: 401 },
      message: 'unauthorized',
    });
    const prepared = await service.prepare(request);
    if (!prepared.handled) throw new Error('expected handled result');
    await expect(collect(prepared.events)).resolves.toEqual([
      expect.objectContaining({ type: StreamEventType.ERROR }),
    ]);
  });
});
