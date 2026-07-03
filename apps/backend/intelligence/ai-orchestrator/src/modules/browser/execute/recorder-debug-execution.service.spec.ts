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

import { BrowserActionValidatorService } from '../intent';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDebugExecutionService } from './recorder-debug-execution.service';
import { RecorderDisambiguationService } from '../intent';
import {
  RecorderObservationService,
  RecorderSnapshotService,
  RecorderSnapshotReuseService,
  RecorderTargetResolutionReuseService,
  RecorderStructureProbeService,
} from '../observe';

describe('RecorderDebugExecutionService', () => {
  const createService = () =>
    new RecorderDebugExecutionService(
      new BrowserActionValidatorService(),
      new RecorderDebugChatSupportService(new RecorderDisambiguationService()),
      new RecorderObservationService(),
      new RecorderSnapshotService(),
      new RecorderSnapshotReuseService(),
      new RecorderTargetResolutionReuseService(),
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

  it('enrichObservationState should reuse stable previous candidates when current observation is degraded', () => {
    const service = createService();
    const observation = {
      currentPageUrl: 'https://example.com/list',
      title: '列表页',
      text: '当前页面',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
      candidates: [],
      candidateTrace: [],
    };

    const enriched = (service as any).enrichObservationState(
      {
        runtimeSessionId: 'runtime-1',
        currentPageUrl: 'https://example.com/list',
        lastObservation: {
          currentPageUrl: 'https://example.com/list',
          title: '列表页',
          text: '上一轮页面',
          inputs: [],
          buttons: [],
          headings: [],
          links: [],
          suggestedParameters: [],
          snapshotContentHash: 'same-hash',
          candidates: [
            {
              candidateId: 'action_1',
              kind: 'action',
              label: '详情',
              summary: 'candidateId=action_1 | kind=action | action=detail',
              source: 'region',
              action: 'detail',
              row: { index: 2, key: 'row-2', text: '第二条记录' },
              preferredLocator: { type: 'css', value: ':nth-match([data-ai-action="detail"], 2)' },
            },
          ],
          candidateTrace: [],
        },
      },
      observation,
      {
        nodes: [
          {
            ref: 'e1',
            role: 'button',
            name: '详情',
            line: '- button "详情" [ref=e1]',
            indent: 0,
          },
        ],
      }
    );

    expect(enriched.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: 'action_1',
          preferredLocator: { type: 'css', value: ':nth-match([data-ai-action="detail"], 2)' },
        }),
      ])
    );
    expect(enriched.candidateTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: 'action_1',
          source: 'reuse',
          reasons: ['stable_target_reuse'],
        }),
      ])
    );
  });
});
