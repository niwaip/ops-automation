jest.mock('dockerode', () => jest.fn(() => ({})), { virtual: true });

import { RecorderService } from './recorder.service';

describe('RecorderService', () => {
  const createService = (overrides?: {
    eventEmitter?: Record<string, unknown>;
    workerService?: Record<string, unknown>;
  }) => new RecorderService(
    (overrides?.eventEmitter || { emit: jest.fn() }) as any,
    (overrides?.workerService || {
      getInternalCodegenUrl: jest.fn(),
      getWorkerByRuntimeSessionId: jest.fn(),
    }) as any,
  );

  it('startTakeoverRecording should reuse runtime worker internal codegen endpoint', async () => {
    const workerService = {
      getInternalCodegenUrl: jest.fn().mockReturnValue('http://172.20.0.10:3011'),
      getWorkerByRuntimeSessionId: jest.fn(),
    };
    const service = createService({ workerService });
    const startBrowserSpy = jest
      .spyOn(service, 'startBrowser')
      .mockResolvedValue({ cdpPort: 9222, noVncPort: 6080 });

    await expect(service.startTakeoverRecording('runtime-1', {
      startUrl: 'https://example.com/login',
      reuseExistingPage: true,
    })).resolves.toEqual({ sessionId: 'runtime-1' });

    expect(startBrowserSpy).toHaveBeenCalledWith('runtime-1', 'https://example.com/login', {
      codegenBaseUrl: 'http://172.20.0.10:3011',
      reuseBrowser: true,
    });
    expect(workerService.getInternalCodegenUrl).toHaveBeenCalledWith('runtime-1');
    expect(workerService.getWorkerByRuntimeSessionId).not.toHaveBeenCalled();
  });

  it('startTakeoverRecording should fail when runtime worker is missing', async () => {
    const workerService = {
      getInternalCodegenUrl: jest.fn().mockReturnValue(undefined),
      getWorkerByRuntimeSessionId: jest.fn().mockResolvedValue(null),
    };
    const service = createService({ workerService });

    await expect(service.startTakeoverRecording('runtime-missing')).rejects.toThrow(
      'No browser worker found for runtime session runtime-missing',
    );
  });
});
