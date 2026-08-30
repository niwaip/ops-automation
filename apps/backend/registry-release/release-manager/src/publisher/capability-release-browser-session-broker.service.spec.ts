import axios from 'axios';
import { CapabilityReleaseBrowserSessionBrokerService } from './capability-release-browser-session-broker.service';

jest.mock('axios');

describe('CapabilityReleaseBrowserSessionBrokerService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allocates direct browser-template calls through session-broker', async () => {
    jest.mocked(axios.post).mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        runtimeType: 'browser',
        state: 'ready',
      },
    } as any);
    const service = new CapabilityReleaseBrowserSessionBrokerService();

    await expect(
      service.acquire({
        userId: 'user-1',
        executionId: '22222222-2222-4222-8222-222222222222',
      })
    ).resolves.toEqual({
      runtimeSessionId: '11111111-1111-4111-8111-111111111111',
      ownedByRuntime: true,
    });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/runtime-sessions'),
      {
        userId: 'user-1',
        runtimeType: 'browser',
        executionId: '22222222-2222-4222-8222-222222222222',
      },
      { timeout: 60000 }
    );
  });

  it('validates and reuses a caller-provided standard session', async () => {
    jest.mocked(axios.get).mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        runtimeType: 'browser',
        state: 'ready',
      },
    } as any);
    const service = new CapabilityReleaseBrowserSessionBrokerService();

    const lease = await service.acquire({
      runtimeSessionId: '11111111-1111-4111-8111-111111111111',
    });
    expect(lease).toEqual({
      runtimeSessionId: '11111111-1111-4111-8111-111111111111',
      ownedByRuntime: false,
    });
    await service.closeOwnedQuietly(lease, 'browser_node_completed_before_llm');

    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects a frozen caller-provided session until human takeover is resumed', async () => {
    jest.mocked(axios.get).mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        runtimeType: 'browser',
        state: 'frozen',
      },
    } as any);
    const service = new CapabilityReleaseBrowserSessionBrokerService();

    await expect(
      service.acquire({ runtimeSessionId: '11111111-1111-4111-8111-111111111111' })
    ).rejects.toThrow(/not active \(state=frozen\)/);
  });
});
