import axios from 'axios';
import { ExecutionRuntimeSessionService } from '../src/modules/execution/adapters/execution-runtime-session.service';

jest.mock('axios');

describe('runtime session takeover transitions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects recovery when the browser session cannot resume', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('session is not frozen'));
    await expect(new ExecutionRuntimeSessionService().resumeQuietly('session-1', 'execution-1', 'step_7'))
      .rejects.toThrow('浏览器会话恢复失败');
  });

  it('rejects takeover when the browser session cannot freeze', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce(new Error('broker unavailable'));
    await expect(new ExecutionRuntimeSessionService().freezeQuietly('session-1', 'execution-1', 'approval required'))
      .rejects.toThrow('浏览器会话冻结失败');
  });
});
