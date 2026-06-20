jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    Logger: class {
      log() {}
      error() {}
      warn() {}
      debug() {}
    },
  }),
  { virtual: true }
);

import { BrowserActionValidatorService } from './browser-action-validator.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDebugExecutionService } from './recorder-debug-execution.service';
import { RecorderDisambiguationService } from './recorder-disambiguation.service';
import { RecorderObservationService } from './recorder-observation.service';
import { RecorderSnapshotService } from './recorder-snapshot.service';
import { RecorderStructureProbeService } from './recorder-structure-probe.service';

describe('RecorderDebugExecutionService', () => {
  const createService = () =>
    new RecorderDebugExecutionService(
      new BrowserActionValidatorService(),
      new RecorderDebugChatSupportService(new RecorderDisambiguationService()),
      new RecorderObservationService(),
      new RecorderSnapshotService(),
      new RecorderStructureProbeService()
    );

  it('allows confirm-level actions during recorder execution', async () => {
    const service = createService();
    const prepareSpy = jest.spyOn(service as any, 'prepareExecutionQueue').mockReturnValue([
      {
        command: { tool: 'click', params: { text: '承认' }, description: '点击承认按钮' },
        synthetic: false,
      },
    ]);
    const executeSpy = jest.spyOn(service as any, 'executeBrowserCommandBatch').mockResolvedValue({
      success: true,
      results: [{ command: 'click', status: 'success' }],
      steps: [{ status: 'success', action: 'click', params: { text: '承认' } }],
      executedCommands: [{ tool: 'click', params: { text: '承认' }, description: '点击承认按钮' }],
    });

    const result = await service.executeBrowserCommands(
      { backend: 'cli', runtimeSessionId: 'runtime-1', currentPageUrl: 'http://localhost/#approvals' },
      [{ tool: 'click', params: { text: '承认' }, description: '点击承认按钮' }]
    );

    expect(prepareSpy).toHaveBeenCalled();
    expect(executeSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('still blocks forbidden actions during recorder execution', async () => {
    const service = createService();
    const executeSpy = jest.spyOn(service as any, 'executeBrowserCommandBatch');

    const result = await service.executeBrowserCommands(
      { backend: 'cli', runtimeSessionId: 'runtime-2', currentPageUrl: 'http://localhost/#approvals' },
      [{ tool: 'evaluate', params: { script: 'return 1' }, description: '执行脚本' }]
    );

    expect(executeSpy).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toContain('禁止');
  });
});
