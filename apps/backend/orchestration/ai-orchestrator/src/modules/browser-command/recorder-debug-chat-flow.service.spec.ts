jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
  }),
  { virtual: true }
);

import { BrowserActionValidatorService } from './browser-action-validator.service';
import { RecorderDebugChatFlowService } from './recorder-debug-chat-flow.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDisambiguationService } from './recorder-disambiguation.service';

describe('RecorderDebugChatFlowService', () => {
  const createService = () => {
    const chatSupportService = new RecorderDebugChatSupportService(
      new RecorderDisambiguationService()
    );
    return new RecorderDebugChatFlowService(
      chatSupportService,
      new BrowserActionValidatorService()
    );
  };

  it('returns execute for high-risk actions during recorder flow', async () => {
    const service = createService();
    const session: any = {
      backend: 'cli',
      currentPageUrl: 'http://localhost/#approvals',
    };

    const result = await service.resolveFlow({
      session,
      observation: {
        text: 'Approval List',
        inputs: [],
        buttons: [],
        candidates: [],
      },
      effectiveMessage: '点击承认',
      availableInputs: [],
      availableButtons: [],
      controlHints: [],
      parseCommand: jest.fn().mockResolvedValue({
        success: true,
        commands: [
          {
            tool: 'click',
            params: { text: '承认' },
            description: '点击承认按钮',
          },
        ],
        explanation: '点击承认按钮',
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'execute',
      })
    );
    expect(session.pendingRiskConfirmation).toBeUndefined();
  });

  it('returns blocked for forbidden actions and clears pending states', async () => {
    const service = createService();
    const session: any = {
      backend: 'cli',
      currentPageUrl: 'http://localhost/#approvals',
      pendingDisambiguation: {
        command: {
          tool: 'click',
          params: { text: '旧候选' },
          description: '旧候选',
        },
        targetLabel: '旧候选',
        candidates: [{ index: 1, ref: 'e1', text: '旧候选', role: 'button' }],
      },
      pendingRiskConfirmation: {
        commands: [],
        explanation: 'old',
        riskLevel: 'confirm',
        reason: 'old',
      },
    };

    const result = await service.resolveFlow({
      session,
      observation: {
        text: 'Approval List',
        inputs: [],
        buttons: [],
        candidates: [],
      },
      effectiveMessage: '执行 evaluate',
      availableInputs: [],
      availableButtons: [],
      controlHints: [],
      parseCommand: jest.fn().mockResolvedValue({
        success: true,
        commands: [
          {
            tool: 'evaluate',
            params: { script: 'return document.title' },
            description: '执行脚本',
          },
        ],
        explanation: '执行脚本',
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'blocked',
        reply: expect.stringContaining('已阻断'),
      })
    );
    expect(session.pendingDisambiguation).toBeUndefined();
    expect(session.pendingRiskConfirmation).toBeUndefined();
  });
});
