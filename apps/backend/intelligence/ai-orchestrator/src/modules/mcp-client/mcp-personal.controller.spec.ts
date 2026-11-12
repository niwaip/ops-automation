import axios from 'axios';
import { McpPersonalController } from './mcp-personal.controller';

describe('personal MCP error boundary', () => {
  const originalSecret = process.env.INTERNAL_API_SHARED_SECRET;
  beforeEach(() => { process.env.INTERNAL_API_SHARED_SECRET = 'test-only'; });
  afterEach(() => {
    jest.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.INTERNAL_API_SHARED_SECRET;
    else process.env.INTERNAL_API_SHARED_SECRET = originalSecret;
  });

  it.each([400, 401, 403, 404, 409, 422, 429])('preserves safe upstream status %s without leaking its body', async status => {
    jest.spyOn(axios, 'request').mockRejectedValue({ response: { status, data: 'private upstream detail' },
      config: { headers: { 'x-internal-auth': 'private credential' } } });
    try {
      await new McpPersonalController().tools({ user: { id: 'user' } }, 'mcp-selected');
      throw new Error('Expected gateway rejection');
    } catch (error: any) {
      expect(error.getStatus()).toBe(status);
      expect(JSON.stringify(error.getResponse())).not.toContain('private');
    }
  });

  it('maps transport failure to 502 and keeps authentication required', async () => {
    const network = jest.spyOn(axios, 'request').mockRejectedValue(new Error('private socket detail'));
    const controller = new McpPersonalController();
    await expect(controller.tools({ user: { id: 'user' } })).rejects.toMatchObject({ status: 502 });
    await expect(controller.tools({})).rejects.toMatchObject({ status: 401 });
    expect(network).toHaveBeenCalledTimes(1);
  });
});
