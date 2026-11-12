import axios from 'axios';
import { SandboxKnowledgeProxyController } from './sandbox-knowledge-proxy.controller';
import { parseAndVerifySandboxToken } from '../../common/guards/ai-auth.guard';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../../common/guards/ai-auth.guard', () => ({ parseAndVerifySandboxToken: jest.fn() }));

describe('SandboxKnowledgeProxyController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects invalid sandbox tokens before accessing personal space', async () => {
    (parseAndVerifySandboxToken as jest.Mock).mockReturnValue(null);
    await expect(new SandboxKnowledgeProxyController().search('Bearer invalid', { query: 'AI网关' }))
      .rejects.toMatchObject({ status: 401 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('derives the owner from the verified token and drops supplied identities and scope', async () => {
    (parseAndVerifySandboxToken as jest.Mock).mockReturnValue('owner-1');
    (axios.post as jest.Mock).mockResolvedValue({ data: { source: 'personal_workspace', documents: [] } });
    await new SandboxKnowledgeProxyController().search('Bearer signed', {
      query: 'AI网关', userId: 'victim', workspaceId: 'company', userRole: 'admin',
    });
    expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/workspaces/my/knowledge/search'),
      { query: 'AI网关', browse: false }, expect.objectContaining({
        headers: expect.objectContaining({ 'x-user-id': 'owner-1', 'x-user-role': 'employee' }),
      }));
  });

  it('preserves upstream access denial and never substitutes local data', async () => {
    (parseAndVerifySandboxToken as jest.Mock).mockReturnValue('owner-1');
    (axios.post as jest.Mock).mockRejectedValue({ response: { status: 404, data: { message: 'not found' } } });
    await expect(new SandboxKnowledgeProxyController().read('Bearer signed', { documentId: 'other' }))
      .rejects.toMatchObject({ status: 404 });
  });
});
