jest.mock('dockerode', () => jest.fn(), { virtual: true });
jest.mock('../../config/service-endpoints', () => ({
  getPublicHost: jest.fn(() => '127.0.0.1'),
  getSessionBrokerUrl: jest.fn(() => 'http://session-broker:3002'),
}));

import { WorkerService } from './worker.service';
import Docker from 'dockerode';

describe('WorkerService', () => {
  const DockerMock = Docker as unknown as jest.Mock;

  const createService = () => {
    const createContainer = jest.fn();
    const dockerInstance = {
      createContainer,
      getContainer: jest.fn(),
      listContainers: jest.fn().mockResolvedValue([]),
    };

    DockerMock.mockImplementation(() => dockerInstance);
    const service = new WorkerService();
    jest.spyOn(service as any, 'waitForHttpReady').mockResolvedValue(undefined);
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });

    return {
      service,
      createContainer,
    };
  };

  const createInspect = (ports: Record<string, Array<{ HostPort: string }> | null>) => ({
    NetworkSettings: {
      Ports: ports,
      Networks: {
        'ops-network': {
          IPAddress: '172.18.0.20',
        },
      },
    },
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('publishes dynamic novnc and cdp endpoints for session workers', async () => {
    const { service, createContainer } = createService();

    const inspect = createInspect({
      '8080/tcp': [{ HostPort: '55034' }],
      '9222/tcp': [{ HostPort: '55033' }],
    });
    const container = {
      start: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn().mockResolvedValue(inspect),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    createContainer.mockResolvedValue(container);

    const result = await service.createWorker({
      user_id: 'runtime-smoke-check',
    });

    expect(createContainer).toHaveBeenCalledWith(
      expect.not.objectContaining({
        ExposedPorts: undefined,
      })
    );
    expect(createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        ExposedPorts: {
          '8080/tcp': {},
          '9222/tcp': {},
        },
        HostConfig: expect.objectContaining({
          PortBindings: {
            '8080/tcp': [{ HostPort: '39000' }],
            '9222/tcp': [{ HostPort: '40000' }],
          },
        }),
      })
    );
    expect(result).toEqual({
      worker_id: expect.any(String),
      endpoints: {
        cdp: 'ws://127.0.0.1:55033',
        novnc: 'http://127.0.0.1:55034/vnc.html',
      },
    });
  });

  it('retries worker creation when docker reports host port conflict', async () => {
    const { service, createContainer } = createService();

    const container = {
      start: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn().mockResolvedValue(
        createInspect({
          '8080/tcp': [{ HostPort: '55054' }],
          '9222/tcp': [{ HostPort: '55053' }],
        })
      ),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    createContainer
      .mockRejectedValueOnce(
        new Error('failed to bind host port 0.0.0.0:55049/tcp: address already in use')
      )
      .mockResolvedValueOnce(container);

    const result = await service.createWorker({
      user_id: 'interactive-user',
    });

    expect(createContainer).toHaveBeenCalledTimes(2);
    expect(createContainer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          PortBindings: {
            '8080/tcp': [{ HostPort: '39000' }],
            '9222/tcp': [{ HostPort: '40000' }],
          },
        }),
      })
    );
    expect(createContainer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        HostConfig: expect.objectContaining({
          PortBindings: {
            '8080/tcp': [{ HostPort: '39001' }],
            '9222/tcp': [{ HostPort: '40001' }],
          },
        }),
      })
    );
    expect(result).toEqual({
      worker_id: expect.any(String),
      endpoints: {
        cdp: 'ws://127.0.0.1:55053',
        novnc: 'http://127.0.0.1:55054/vnc.html',
      },
    });
  });

  describe('requiresWorkerRecreation', () => {
    it('preserves running interactive GUI worker when mode is agent or headless is true', () => {
      const { service } = createService();
      const runningGuiWorker = {
        worker_id: 'w1',
        mode: 'interactive',
        headless: false,
        enable_codegen: false,
        status: 'running',
      } as any;

      // Requesting agent mode should NOT trigger recreation
      expect(
        (service as any).requiresWorkerRecreation(runningGuiWorker, { mode: 'agent' })
      ).toBe(false);

      // Requesting headless should NOT trigger recreation for running GUI worker
      expect(
        (service as any).requiresWorkerRecreation(runningGuiWorker, { headless: true })
      ).toBe(false);

      // Requesting both agent mode and headless should NOT trigger recreation
      expect(
        (service as any).requiresWorkerRecreation(runningGuiWorker, {
          mode: 'agent',
          headless: true,
        })
      ).toBe(false);

      // But requesting codegen when not enabled SHOULD trigger recreation
      expect(
        (service as any).requiresWorkerRecreation(runningGuiWorker, { enableCodegen: true })
      ).toBe(true);
    });

    it('triggers recreation if a headless worker is asked for interactive or codegen', () => {
      const { service } = createService();
      const headlessWorker = {
        worker_id: 'w2',
        mode: 'agent',
        headless: true,
        enable_codegen: false,
        status: 'running',
      } as any;

      // Asking for headless: false on a headless worker SHOULD recreate to provide GUI
      expect(
        (service as any).requiresWorkerRecreation(headlessWorker, { headless: false })
      ).toBe(true);

      // Asking for interactive mode on a headless agent worker SHOULD recreate
      expect(
        (service as any).requiresWorkerRecreation(headlessWorker, { mode: 'interactive' })
      ).toBe(true);
    });
  });
});
