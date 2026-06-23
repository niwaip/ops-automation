import { createService, resetRecorderDebugTestEnv } from './recorder-debug.test-helper';
import { RecorderObservationService } from '../observe';

describe('RecorderDebugService', () => {
  beforeEach(() => {
    resetRecorderDebugTestEnv();
  });

  it('rewriteCommandWithSnapshotRefs should match button text with filler words removed', () => {
    const service = createService();
    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(
      {
        tool: 'click',
        params: { text: 'RAM登录' },
        description: '点击 RAM 登录',
      },
      {
        nodes: [
          {
            ref: 'e10',
            role: 'button',
            name: '登录',
            line: '- button "登录" [ref=e10]',
          },
          {
            ref: 'e11',
            role: 'button',
            name: 'RAM 用户登录',
            line: '- button "RAM 用户登录" [ref=e11]',
          },
        ],
      }
    );

    expect(rewritten).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          text: 'RAM登录',
          target: 'e11',
        }),
      })
    );
  });

  it('ensureBrowserReady should report error log when browser init fails', async () => {
    const browserSemanticsClient = {
      createErrorLog: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService({
      browserSemanticsClient,
    });
    const session = {
      sessionId: 'recorder-init-fail',
      runtimeSessionId: 'runtime-init-fail',
      backend: 'cli',
      browserInitialized: false,
      currentPageUrl: 'http://localhost:3000/login',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const axios = require('axios');
    jest.spyOn(axios, 'post').mockRejectedValueOnce(new Error('browser worker unavailable'));

    await expect((service as any).ensureBrowserReady(session)).rejects.toThrow(
      'browser worker unavailable'
    );
    expect(browserSemanticsClient.createErrorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        domain_code: 'browser_recorder',
        source: 'recorder_debug',
        error_type: 'BROWSER_INIT_FAILED',
        error_message: 'browser worker unavailable',
        session_id: 'recorder-init-fail',
        task_id: 'runtime-init-fail',
      })
    );
  });

  it('describeObservedElement should preserve ref and row context in prompt-friendly text', () => {
    const observationService = new RecorderObservationService();
    const description = observationService.describeObservedElement({
      ref: 'e88',
      role: 'button',
      region: 'approval-list',
      rowIndex: 0,
      rowKey: 'PRJ-2026-001',
      rowText: 'PRJ-2026-001 AI搭載スマート倉庫 保留中 詳細',
      action: 'detail',
      text: '詳細',
    });

    expect(description).toContain('ref=e88');
    expect(description).toContain('region=approval-list');
    expect(description).toContain('row=1');
    expect(description).toContain('rowKey=PRJ-2026-001');
    expect(description).toContain('action=detail');
    expect(description).toContain('label=詳細');
  });

  it('buildCandidatesAndTrace should emit structured candidates and trace', () => {
    const service = createService();
    const result = (service as any).buildCandidatesAndTrace({
      currentPageUrl: 'http://localhost/#approvals',
      title: 'Mock ERP Portal',
      text: '案件承認管理',
      inputs: [],
      buttons: [
        {
          ref: 'e88',
          role: 'button',
          region: 'approval-list',
          rowIndex: 0,
          action: 'detail',
          text: '詳細',
        },
      ],
      rows: [
        {
          rowIndex: 0,
          rowKey: 'PRJ-2026-001',
          rowText: 'PRJ-2026-001 AI搭載スマート倉庫 25.5%',
          region: 'approval-list',
          rowButtons: [{ action: 'detail', text: '詳細' }],
          rowFields: [{ field: 'grossMargin', text: '25.5%' }],
        },
      ],
      regions: [
        {
          region: 'gross-margin-panel',
          fields: [{ field: 'grossMargin', text: '25.5%' }],
          actions: [{ action: 'approve', text: '承認する (Approve)' }],
        },
      ],
      headings: [],
      links: [],
      suggestedParameters: [],
    });

    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'action' }),
        expect.objectContaining({ kind: 'field' }),
        expect.objectContaining({ kind: 'region' }),
      ])
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasons: ['visible_button'] }),
        expect.objectContaining({ reasons: ['row_field'] }),
        expect.objectContaining({ reasons: ['region_action'] }),
      ])
    );
  });

  it('buildCandidatesAndTrace should preserve data-testid and preferred locator for field candidates', () => {
    const service = createService();
    const result = (service as any).buildCandidatesAndTrace({
      currentPageUrl: 'http://localhost/#approvals',
      title: 'Mock ERP Portal',
      text: '案件承認管理',
      inputs: [],
      buttons: [],
      rows: [],
      regions: [
        {
          region: 'gross-margin-panel',
          fields: [
            {
              field: 'grossMargin',
              text: '25.5%',
              dataTestId: 'gross-margin-value',
              id: 'detail-gross-margin',
            },
          ],
          actions: [],
        },
      ],
      headings: [],
      links: [],
      suggestedParameters: [],
    });

    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'field',
          field: 'grossMargin',
          dataTestId: 'gross-margin-value',
          elementId: 'detail-gross-margin',
          preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          summary: expect.stringContaining('testid=gross-margin-value'),
        }),
      ])
    );
  });

  it('buildCandidatesAndTrace should consume generic page semantics without relying on sample page structure', () => {
    const service = createService();
    const result = (service as any).buildCandidatesAndTrace({
      currentPageUrl: 'http://localhost/list',
      title: 'Approval List',
      text: 'pending approvals',
      inputs: [],
      buttons: [],
      rows: [],
      regions: [],
      pageSemantics: {
        version: '1.0',
        pageType: 'approval_list',
        regions: [
          {
            id: 'pending-items',
            type: 'list',
            label: 'Pending Items',
            items: [
              {
                key: 'approval-1001',
                index: 1,
                entityType: 'approval',
                entityId: 'approval-1001',
                primaryText: 'Request A',
                secondaryText: 'pending',
                fields: {
                  status: 'pending',
                  amount: 1200,
                },
                actions: [
                  {
                    id: 'approve',
                    label: 'Approve',
                    preferredLocator: {
                      type: 'css',
                      value: '[data-row-key="approval-1001"] [data-action="approve"]',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      headings: [],
      links: [],
      suggestedParameters: [],
    });

    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasons: ['semantic_region'] }),
        expect.objectContaining({ reasons: ['semantic_row'] }),
        expect.objectContaining({ reasons: ['semantic_row_field'] }),
        expect.objectContaining({ reasons: ['semantic_row_action'] }),
      ])
    );
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'row',
          source: 'semantic',
          entityType: 'approval',
          entityId: 'approval-1001',
          semanticPath: ['region:pending-items', 'item:approval-1001'],
        }),
        expect.objectContaining({
          kind: 'action',
          source: 'semantic',
          action: 'approve',
          preferredLocator: {
            type: 'css',
            value: '[data-row-key="approval-1001"] [data-action="approve"]',
          },
          summary: expect.stringContaining(
            'semanticPath=region:pending-items/item:approval-1001/action:approve'
          ),
        }),
        expect.objectContaining({
          kind: 'field',
          source: 'semantic',
          field: 'status',
          text: 'pending',
        }),
      ])
    );
  });

  it('rewriteCommandWithSnapshotRefs should keep original target when only generic node matches', () => {
    const service = createService();
    const originalCommand = {
      tool: 'click',
      params: { text: 'RAM登录' },
      description: '点击 RAM 登录',
    };
    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(originalCommand, {
      nodes: [
        {
          ref: 'e10',
          role: 'generic',
          name: '登录',
          line: '- generic "登录" [ref=e10]',
        },
        {
          ref: 'e11',
          role: 'generic',
          name: 'RAM 用户登录',
          line: '- generic "RAM 用户登录" [ref=e11]',
        },
      ],
    });

    expect(rewritten).toEqual(originalCommand);
  });

  it('executeBrowserCommands should not retain failed commands in executedCommands', async () => {
    const service = createService();
    const executionService = (service as any).recorderDebugExecutionService;
    const session = {
      sessionId: 'recorder-debug-failed-command',
      runtimeSessionId: 'runtime-failed-command',
      backend: 'cli',
    };

    jest.spyOn(executionService, 'prepareExecutionQueue').mockReturnValue([
      {
        command: { tool: 'click', params: { text: '保留中' }, description: '点击保留中' },
        synthetic: false,
      },
      {
        command: { tool: 'click', params: { text: '全部' }, description: '点击全部' },
        synthetic: false,
      },
    ]);
    const executeBatchSpy = jest
      .spyOn(executionService, 'executeBrowserCommandBatch')
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'click', status: 'success' }],
        steps: [{ status: 'success', action: 'click', params: { text: '保留中' } }],
      })
      .mockResolvedValueOnce({
        success: false,
        message: 'click failed',
        results: [{ command: 'click', status: 'error', message: 'strict mode violation' }],
        steps: [{ status: 'error', action: 'click', params: { text: '全部' } }],
      });

    const result = await (service as any).executeBrowserCommands(
      session,
      [
        { tool: 'click', params: { text: '保留中' }, description: '点击保留中' },
        { tool: 'click', params: { text: '全部' }, description: '点击全部' },
      ],
      undefined
    );

    expect(executeBatchSpy).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.executedCommands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: { text: '保留中' },
        description: '点击保留中',
      }),
    ]);
    expect(result.message).toBe('click failed');
  });

  it('refreshObservationAfterExecution should preserve newer executed commands from persisted session', async () => {
    const service = createService();
    const persistedSession = {
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://old.example.com',
      lastObservation: {
        currentPageUrl: 'https://old.example.com',
        text: 'old',
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
      history: [],
      executedCommands: [
        { tool: 'navigate', params: { url: 'https://first.example.com' } },
        { tool: 'click', params: { text: 'second-step' } },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const staleSession = {
      ...persistedSession,
      currentPageUrl: 'https://first.example.com',
      executedCommands: [{ tool: 'navigate', params: { url: 'https://first.example.com' } }],
    };
    const refreshedObservation = {
      currentPageUrl: 'https://latest.example.com',
      text: 'latest',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const loadSessionSpy = jest
      .spyOn(service as any, 'loadSession')
      .mockResolvedValue(persistedSession);
    const observePageSafelySpy = jest
      .spyOn(service as any, 'observePageSafely')
      .mockResolvedValue(refreshedObservation);
    const saveSessionSpy = jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);

    await (service as any).refreshObservationAfterExecution(staleSession);

    expect(observePageSafelySpy).toHaveBeenCalledWith(staleSession, staleSession.lastObservation);
    expect(loadSessionSpy).toHaveBeenCalledWith(staleSession.sessionId);
    expect(saveSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: persistedSession.sessionId,
        currentPageUrl: refreshedObservation.currentPageUrl,
        lastObservation: refreshedObservation,
        executedCommands: persistedSession.executedCommands,
      })
    );
  });

  it('parseSnapshotNodes should attach nearby field labels to textbox nodes', () => {
    const service = createService();
    const nodes = (service as any).parseSnapshotNodes(`
- generic [ref=e111]:
  - generic [ref=e113]: "*Password"
  - generic [ref=e114]:
    - generic [ref=e115]:
      - textbox [active] [ref=e116]
    `);

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: 'e116',
          role: 'textbox',
          contextLabel: 'Password',
        }),
      ])
    );
  });

  it('rewriteCommandWithSnapshotRefs should resolve password fill via nearby snapshot label', () => {
    const service = createService();
    const snapshotNodes = (service as any).parseSnapshotNodes(`
- generic [ref=e111]:
  - generic [ref=e113]: "*Password"
  - generic [ref=e114]:
    - generic [ref=e115]:
      - textbox [active] [ref=e116]
    `);

    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(
      {
        tool: 'fill',
        params: { selector: '密码', value: 'secret' },
        description: '填写密码',
      },
      { nodes: snapshotNodes }
    );

    expect(rewritten).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          selector: '密码',
          target: 'e116',
        }),
      })
    );
  });

  it('rewriteCommandWithSnapshotRefs should not map generic textbox selector to unrelated password field', () => {
    const service = createService();
    const snapshotNodes = (service as any).parseSnapshotNodes(`
- generic [ref=e111]:
  - generic [ref=e113]: "*Password"
  - generic [ref=e114]:
    - generic [ref=e115]:
      - textbox [active] [ref=e116]
    `);
    const originalCommand = {
      tool: 'fill',
      params: { selector: 'textbox', value: 'yangye' },
      description: '填写用户名',
    };

    const rewritten = (service as any).rewriteCommandWithSnapshotRefs(originalCommand, {
      nodes: snapshotNodes,
    });

    expect(rewritten).toEqual(originalCommand);
  });
});
