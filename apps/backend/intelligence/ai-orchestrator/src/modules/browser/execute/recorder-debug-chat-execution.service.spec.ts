jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { BrowserExecutionControllerService } from './browser-execution-controller.service';
import { RecorderDebugChatExecutionService } from './recorder-debug-chat-execution.service';

describe('RecorderDebugChatExecutionService', () => {
  it('delegates executeAndResolve to BrowserExecutionControllerService', async () => {
    const expected = {
      kind: 'completed',
      reply: 'ok',
      execution: { success: true },
      nextObservation: { currentPageUrl: 'https://example.com' },
    } as any;
    const browserExecutionControllerService = {
      executeAndResolve: jest.fn().mockResolvedValue(expected),
    } as unknown as BrowserExecutionControllerService;
    const service = new RecorderDebugChatExecutionService(browserExecutionControllerService);
    const input: any = {
      session: { executedCommands: [] },
      effectiveMessage: '点击登录',
      parsed: { success: true, commands: [], explanation: '点击登录' },
      observation: { currentPageUrl: 'https://example.com' },
      controlTokenState: {
        cleanedMessage: '点击登录',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn(),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    };

    const result = await service.executeAndResolve(input);

    expect(browserExecutionControllerService.executeAndResolve).toHaveBeenCalledWith(input);
    expect(result).toBe(expected);
  });
});
