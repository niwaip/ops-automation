jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    Optional: () => () => undefined,
  }),
  { virtual: true }
);

import { BrowserActionValidatorService } from '../intent';
import { RecorderDebugChatFlowService } from './recorder-debug-chat-flow.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDisambiguationService } from '../intent';

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

  it('uses cached intent resolution without calling parseCommand when available', async () => {
    const chatSupportService = new RecorderDebugChatSupportService(
      new RecorderDisambiguationService()
    );
    const mockReuseService = {
      tryResolveFromIntentCache: jest.fn().mockReturnValue({
        success: true,
        commands: [{ tool: 'click', params: { target: '#login-btn' }, description: '点击登录' }],
        explanation: '[快速意图复用] 点击登录',
        parserMetadata: { parserSource: 'intent-cache' },
      }),
    };

    const service = new RecorderDebugChatFlowService(
      chatSupportService,
      new BrowserActionValidatorService(),
      mockReuseService as any
    );

    const parseCommandSpy = jest.fn();
    const session: any = {
      backend: 'cli',
      currentPageUrl: 'http://localhost/#login',
    };

    const result = await service.resolveFlow({
      session,
      observation: {
        text: 'Login Page',
        inputs: [],
        buttons: [],
        candidates: [],
      },
      effectiveMessage: '点击登录',
      availableInputs: [],
      availableButtons: [],
      controlHints: [],
      parseCommand: parseCommandSpy,
    });

    expect(result.kind).toBe('execute');
    expect(result.parsed.commands).toEqual([
      { tool: 'click', params: { target: '#login-btn' }, description: '点击登录' },
    ]);
    expect(parseCommandSpy).not.toHaveBeenCalled();
    expect(mockReuseService.tryResolveFromIntentCache).toHaveBeenCalledWith(
      expect.objectContaining({ message: '点击登录' })
    );
  });
});
