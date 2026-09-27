import axios from 'axios';
import { SandboxSearchProxyController } from './sandbox-search-proxy.controller';
import { parseAndVerifySandboxToken } from '../../common/guards/ai-auth.guard';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../../common/guards/ai-auth.guard', () => ({
  parseAndVerifySandboxToken: jest.fn(),
}));

describe('SandboxSearchProxyController', () => {
  const originalEnv = { ...process.env };
  const mockedPost = axios.post as jest.Mock;
  const mockedVerify = parseAndVerifySandboxToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, INTERNAL_API_SHARED_SECRET: 'internal-test-secret' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects an invalid sandbox token before calling the control plane', async () => {
    mockedVerify.mockReturnValue(null);
    await expect(
      new SandboxSearchProxyController().search('Bearer invalid', { query: 'test' })
    ).rejects.toMatchObject({ status: 401 });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('forwards only through the authenticated internal control-plane route', async () => {
    mockedVerify.mockReturnValue('user-1');
    mockedPost.mockResolvedValue({ data: { success: true, output: { results: [] } } });

    const result = await new SandboxSearchProxyController().search('Bearer signed', {
      query: 'DeepSeek',
      queries: ['DeepSeek GitHub releases'],
    });

    expect(result).toEqual({ success: true, output: { results: [] } });
    expect(mockedPost).toHaveBeenCalledWith(
      expect.stringContaining('/api/internal/search/web'),
      expect.objectContaining({ query: 'DeepSeek' }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-internal-auth': 'internal-test-secret',
          'x-user-id': 'user-1',
        }),
      })
    );
  });
});
