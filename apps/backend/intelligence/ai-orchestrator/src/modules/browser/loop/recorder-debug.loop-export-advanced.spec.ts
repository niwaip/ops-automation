import { createService, resetRecorderDebugTestEnv } from '../execute/recorder-debug.test-helper';
import { RecorderLoopService } from './recorder-loop.service';
import { RecorderParameterService } from '../intent/recorder-parameter.service';
import { RecorderTemplateExportService } from '../export';

describe('RecorderDebugService', () => {
  beforeEach(() => {
    resetRecorderDebugTestEnv();
  });

  it('exportArtifacts should retain return-to-list step when conditional token is recorded without a recorded approve click', async () => {
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['#detail-gross-margin'],
        readMethod: 'innerText',
        outputVar: 'profitMarginText',
        conditionFn:
          "(ctx) => Number(String(ctx.profitMarginText || '').replace(/[^0-9.-]+/g, '')) > 20",
        takeoverReason: '毛利率未超过20%，需要人工审查接管',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '判断当前案件毛利率是否大于20%，决定自动承认或人工接管',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '条件满足后点击承认按钮',
      },
      analysisSource: 'llm',
      pageContext: {
        pageUrl: 'http://localhost/#approvals/detail',
        pageTitle: 'Mock ERP Portal',
      },
    });
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-conditional-loop-export',
      runtimeSessionId: 'runtime-conditional-loop-export',
      backend: 'chrome-devtools',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      loopDraft: {
        mode: 'repeat_until',
        target: {
          scope: 'current_list',
          currentPageUrl: 'http://localhost/#approvals',
        },
        eachIteration: {
          capturedFromIndex: 1,
          capturedToIndex: 2,
          stepIds: ['recorded_step_2', 'recorded_step_3'],
          stepCount: 2,
        },
        onNoProgress: 'stop',
        maxIterations: 100,
      },
      lastObservation: {
        currentPageUrl: 'http://localhost/#approvals/detail',
        title: 'Mock ERP Portal',
        text: '案件粗利率（毛利率） 25.5% ※ システム承認自動化基準: 20.0% 以上',
        inputs: [],
        buttons: [{ text: '承認する (Approve)' }],
        headings: ['案件承認管理 / 案件詳細'],
        links: [],
        suggestedParameters: [],
      },
      history: [
        {
          role: 'user',
          content: '[条件分歧] 毛利率大于20%自动承认，否则人工介入',
          timestamp: new Date().toISOString(),
        },
      ],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://localhost/#approvals' },
          description: '打开审批页面',
        },
        {
          tool: 'click',
          params: { target: '2_39' },
          description: '点击第一条保留中案件的详情',
        },
        {
          tool: 'click',
          params: { target: '7_0' },
          description: '点击「一覧に戻る」按钮返回一览页面',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '循环处理未承认数据，毛利率大于20%自动承认，否则人工介入'
    );

    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'read_value', output_var: 'profitMarginText' }),
        expect.objectContaining({ action: 'branch' }),
        expect.objectContaining({
          action: 'click',
          locator: { type: 'role', value: 'button[name="承認する (Approve)"]' },
        }),
        expect.objectContaining({
          action: 'click',
          locator: expect.objectContaining({
            type: 'role',
            value: 'button[name="一覧に戻る"]',
          }),
        }),
      ])
    );
    const exportedBranchStep = artifacts.templateSteps?.find(
      (step: any) => step.action === 'branch'
    );
    expect(exportedBranchStep?.branch?.takeover_reason).toContain('${grossMarginThreshold}');
    expect(exportedBranchStep?.branch?.takeover_reason).not.toContain('20%');
  });

  it('exportArtifacts should target pending rows when loop goal explicitly describes pending approvals', async () => {
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['body'],
        readMethod: 'innerText',
        outputVar: 'pageText',
        conditionFn: "(ctx) => !String(ctx.pageText || '').includes('承認済み')",
        takeoverReason: '案件已是承認済み状态，无需再次承認，请人工确认',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '检查案件是否还未承認，若未承認则继续点击承認按钮',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '条件满足后点击承認按钮',
      },
      analysisSource: 'llm',
      pageContext: {
        pageUrl: 'http://localhost/#approvals',
        pageTitle: 'Mock ERP Portal',
      },
    });
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-pending-loop-export',
      runtimeSessionId: 'runtime-pending-loop-export',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      loopDraft: {
        mode: 'repeat_until',
        target: {
          scope: 'current_list',
          currentPageUrl: 'http://localhost/#approvals',
          match: {
            field: 'status',
            operator: 'equals',
            value: '保留中',
          },
        },
        eachIteration: {
          capturedFromIndex: 2,
          capturedToIndex: 4,
          stepIds: ['recorded_step_3', 'recorded_step_4', 'recorded_step_5'],
          stepCount: 3,
        },
        onNoProgress: 'stop',
        maxIterations: 100,
      },
      lastObservation: {
        currentPageUrl: 'http://localhost/#approvals/detail',
        title: 'Mock ERP Portal',
        text: '保留中 承認する (Approve)',
        inputs: [],
        buttons: [{ text: '承認する (Approve)' }],
        headings: ['案件承認管理 / 案件詳細'],
        links: [],
        suggestedParameters: [],
      },
      history: [
        {
          role: 'user',
          content: '循环处理 approvals 页面全部未承认数据，逐条承认后返回一览，直到没有保留中数据',
          timestamp: new Date().toISOString(),
        },
      ],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://localhost/#approvals' },
          description: '打开审批页面',
        },
        {
          tool: 'click',
          params: { text: '保留中', target: 'e61' },
          locator: {
            strategy: 'role',
            value: 'button',
            role: 'button',
            name: '保留中',
            generatedBy: 'cli',
            confidence: 0.95,
          },
          description: '点击「保留中」筛选未承认案件',
        },
        {
          tool: 'click',
          params: { target: '[data-ai-action="detail"]' },
          locator: { strategy: 'css', value: '[data-ai-action="detail"]', generatedBy: 'system' },
          description: '点击第一条待处理案件详情',
        },
        {
          tool: 'click',
          params: { target: 'e201' },
          locator: {
            strategy: 'testid',
            value: 'btn-approve',
            generatedBy: 'cli',
            confidence: 0.95,
          },
          description: '点击承認する (Approve) 按钮',
        },
        {
          tool: 'click',
          params: { target: 'e168' },
          locator: { strategy: 'ref', value: 'e168', generatedBy: 'system' },
          description: '点击「一覧に戻る」按钮返回一览页面',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '循环处理 approvals 页面全部未承认数据，逐条承认后返回一览，直到没有保留中数据'
    );

    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'click',
          locator: {
            type: 'css',
            value:
              ':nth-match(tr:has([data-ai-action="detail"]):has-text("保留中") [data-ai-action="detail"], 1)',
          },
        }),
        expect.objectContaining({
          action: 'click',
          locator: { type: 'role', value: 'button[name="承認する (Approve)"]' },
        }),
      ])
    );
    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'read_value',
          output_var: 'pageText',
        }),
        expect.objectContaining({
          action: 'branch',
          branch: expect.objectContaining({
            on_mismatch: 'takeover',
          }),
        }),
      ])
    );
    expect(artifacts.loopDraft).toEqual(
      expect.objectContaining({
        eachIteration: {
          capturedFromIndex: 2,
          capturedToIndex: 4,
          stepIds: ['step_3', 'step_4', 'step_5', 'step_6', 'step_7'],
          stepCount: 5,
        },
        stopWhen: {
          read: {
            type: 'text',
            locator: {
              type: 'css',
              value: 'tr:has([data-ai-action="detail"]):has-text("保留中")',
            },
          },
          conditionFn: '!String(value || \'\').includes("保留中")',
          description: '当前列表中已无“保留中”项时结束循环',
        },
      })
    );
  });

  it('exportArtifacts should honor branch readSelectors instead of hard-coded gross-margin selector', async () => {
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['body'],
        readMethod: 'innerText',
        outputVar: 'pageState',
        conditionFn: "(ctx) => String(ctx.pageState || '').includes('承認する')",
        takeoverReason: '页面未找到承认按钮，无法执行数据承认操作，需要人工接管',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '检查页面是否处于可执行承认操作的状态',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '条件满足后点击承認按钮',
      },
      analysisSource: 'llm',
      pageContext: {
        pageUrl: 'http://localhost/#approvals',
        pageTitle: 'Mock ERP Portal',
      },
    });
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-body-read',
      runtimeSessionId: 'runtime-body-read',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      loopDraft: {
        mode: 'repeat_until',
        target: {
          scope: 'current_list',
          currentPageUrl: 'http://localhost/#approvals',
        },
        eachIteration: {
          stepIds: ['recorded_step_2', 'recorded_step_3', 'recorded_step_4'],
          stepCount: 3,
        },
        onNoProgress: 'stop',
        maxIterations: 100,
      },
      lastObservation: {
        currentPageUrl: 'http://localhost/#approvals/detail',
        title: 'Mock ERP Portal',
        text: '承認する (Approve)',
        inputs: [],
        buttons: [{ text: '承認する (Approve)' }],
        headings: ['案件承認管理 / 案件詳細'],
        links: [],
        suggestedParameters: [],
      },
      history: [
        {
          role: 'user',
          content: '如果页面存在承認按钮就继续执行，否则人工介入。',
          timestamp: new Date().toISOString(),
        },
      ],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://localhost/#approvals' },
          description: '打开审批页面',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '循环审批待处理案件'
    );

    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'read_value',
          locator: { type: 'css', value: 'body' },
          params: expect.objectContaining({
            selector: 'body',
            method: 'innerText',
            max_length: 12000,
          }),
          output_var: 'pageState',
        }),
      ])
    );
  });

  it('toPendingLoopStopLocator should preserve row selector when action selector contains nested region selector', () => {
    const loopService = new RecorderLoopService();
    const locator = loopService.toPendingLoopStopLocator(
      ':nth-match(tr:has([data-ai-region="approval-list"] [data-ai-action="detail"]):has-text("保留中") [data-ai-region="approval-list"] [data-ai-action="detail"], 1)'
    );

    expect(locator).toBe(
      'tr:has([data-ai-region="approval-list"] [data-ai-action="detail"]):has-text("保留中")'
    );
  });

  it('isReturnToListCommand should rely on generic navigation cues instead of approval-specific copy', () => {
    const loopService = new RecorderLoopService();

    expect(
      loopService.isReturnToListCommand({
        tool: 'click',
        params: { text: 'Back to list' },
        description: 'Click Back to list',
      })
    ).toBe(true);
    expect(
      loopService.isReturnToListCommand({
        tool: 'click',
        params: { text: 'Open list filter' },
        description: 'Open list filter',
      })
    ).toBe(false);
  });

  it('findLoopIterationEndTemplateStepIndex should stop at generic return-to-list template steps', () => {
    const loopService = new RecorderLoopService();
    const endIndex = loopService.findLoopIterationEndTemplateStepIndex(
      [
        {
          step_id: 'step_1',
          action: 'click',
          locator: { type: 'css', value: ':nth-match([data-ai-action="detail"], ${rowIndex})' },
        },
        {
          step_id: 'step_2',
          action: 'click',
          locator: { type: 'role', value: 'button[name="Approve"]' },
        },
        {
          step_id: 'step_3',
          action: 'click',
          description: 'Click Back to list',
          locator: { type: 'role', value: 'button[name="Back to list"]' },
        },
        {
          step_id: 'step_4',
          action: 'click',
          description: 'This step should not be part of the same iteration',
        },
      ],
      0
    );

    expect(endIndex).toBe(2);
  });

  it('exportArtifacts should avoid false branch intent and derive loop iteration steps from recorded flow', async () => {
    const analyzeBranchCondition = jest.fn();
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-no-branch-loop-export',
      runtimeSessionId: 'runtime-no-branch-loop-export',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      loopDraft: {
        mode: 'repeat_until',
        target: {
          scope: 'current_list',
          currentPageUrl: 'http://localhost/#approvals',
        },
        eachIteration: {
          capturedFromIndex: 2,
          capturedToIndex: 4,
          stepIds: ['recorded_step_3', 'recorded_step_4', 'recorded_step_5'],
          stepCount: 3,
        },
        onNoProgress: 'takeover',
        maxIterations: 100,
      },
      lastObservation: {
        currentPageUrl: 'http://localhost/#approvals',
        title: 'Mock ERP Portal',
        text: '案件承認管理 一覧',
        inputs: [],
        buttons: [{ text: '一覧に戻る' }],
        headings: ['案件承認管理'],
        links: [],
        suggestedParameters: [],
      },
      history: [
        {
          role: 'user',
          content: '打开 http://localhost/#approvals',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'user',
          content: '[循环对象:当前列表] 查看所有的未承认数据',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'user',
          content: '[循环开始] 点击第一条数据，进入详细',
          timestamp: new Date().toISOString(),
        },
        { role: 'user', content: '点击承认', timestamp: new Date().toISOString() },
        { role: 'user', content: '返回未承认一览', timestamp: new Date().toISOString() },
      ],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://localhost/#approvals' },
          description: '打开审批页面',
        },
        {
          tool: 'click',
          params: { target: 'e61' },
          locator: {
            strategy: 'role',
            value: 'button',
            role: 'button',
            name: '保留中',
            generatedBy: 'cli',
            confidence: 0.95,
          },
          description: '点击「保留中」筛选按钮查看未承认数据',
        },
        {
          tool: 'click',
          params: { target: '[data-ai-action="detail"]' },
          locator: {
            strategy: 'css',
            value: '[data-ai-action="detail"]',
            generatedBy: 'system',
            confidence: 0.95,
          },
          description: '点击 第一条数据，进入详细',
        },
        {
          tool: 'click',
          params: { target: 'e201' },
          locator: {
            strategy: 'testid',
            value: 'btn-approve',
            generatedBy: 'cli',
            confidence: 0.95,
          },
          description: '点击承認する (Approve) 按钮',
        },
        {
          tool: 'click',
          params: { target: 'e168' },
          locator: { strategy: 'ref', value: 'e168', generatedBy: 'system' },
          description: '点击「一覧に戻る」返回列表',
        },
        {
          tool: 'click',
          params: { text: '保留中', target: 'e61' },
          locator: {
            strategy: 'role',
            value: 'button',
            role: 'button',
            name: '保留中',
            generatedBy: 'cli',
            confidence: 0.95,
          },
          description: '点击「保留中」筛选未承认案件',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '点击第一条数据，进入详细 / 点击承认 / 返回未承认一览'
    );

    expect(analyzeBranchCondition).not.toHaveBeenCalled();
    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step_id: 'step_1', action: 'navigate' }),
        expect.objectContaining({
          step_id: 'step_2',
          action: 'click',
          locator: expect.objectContaining({
            type: 'role',
            value: 'button[name="保留中"]',
          }),
        }),
        expect.objectContaining({
          step_id: 'step_3',
          action: 'click',
          locator: expect.objectContaining({
            type: 'css',
            value:
              ':nth-match(tr:has([data-ai-action="detail"]):has-text("保留中") [data-ai-action="detail"], 1)',
          }),
        }),
        expect.objectContaining({
          step_id: 'step_4',
          action: 'click',
          locator: expect.objectContaining({
            type: 'role',
            value: 'button[name="承認する (Approve)"]',
          }),
        }),
        expect.objectContaining({
          step_id: 'step_5',
          action: 'click',
          locator: expect.objectContaining({
            type: 'role',
            value: 'button[name="一覧に戻る"]',
          }),
        }),
      ])
    );
    expect(artifacts.templateSteps?.some((step: any) => step.action === 'branch')).toBe(false);
    expect(artifacts.loopDraft).toEqual(
      expect.objectContaining({
        eachIteration: expect.objectContaining({
          stepIds: ['step_3', 'step_4', 'step_5'],
          stepCount: 3,
        }),
        stopWhen: expect.objectContaining({
          read: {
            type: 'text',
            locator: {
              type: 'css',
              value: 'tr:has([data-ai-action="detail"]):has-text("保留中")',
            },
          },
          conditionFn: '!String(value || \'\').includes("保留中")',
          description: '当前列表中已无“保留中”项时结束循环',
        }),
      })
    );
  });

  it('findExportStartUrl should preserve SPA hash routes when no navigate command was recorded', () => {
    const templateExportService = new RecorderTemplateExportService(
      {} as any,
      new RecorderLoopService()
    );
    const session = {
      currentPageUrl: 'http://localhost/#approvals',
      executedCommands: [],
    };

    expect(templateExportService.findExportStartUrl(session as any)).toBe(
      'http://localhost/#approvals'
    );
  });

  it('buildParameterizedRowDetailStep should parameterize text locators into nth-match selectors for loop rows', () => {
    const templateExportService = new RecorderTemplateExportService(
      {} as any,
      new RecorderLoopService()
    );

    expect(
      templateExportService.buildParameterizedRowDetailStep(
        'step_2',
        {
          tool: 'click',
          params: { text: '詳細', target: '2_39' },
          description: '点击第一条保留中案件的详情',
        } as any,
        '保留中'
      )
    ).toEqual(
      expect.objectContaining({
        action: 'click',
        locator: {
          type: 'css',
          value: ':nth-match(text=詳細, ${rowIndex})',
        },
        description: '打开当前待处理项详情',
      })
    );
  });

  it('toTemplateLocator should derive a text locator from quoted button descriptions when runtime locator is ephemeral', () => {
    const templateExportService = new RecorderTemplateExportService(
      {} as any,
      new RecorderLoopService()
    );

    expect(
      templateExportService.toTemplateLocator({
        tool: 'click',
        params: { target: '7_0' },
        locator: { strategy: 'ref', value: '7_0', generatedBy: 'system' },
        description: '点击「一覧に戻る」按钮返回一览页面',
      } as any)
    ).toEqual({
      type: 'role',
      value: 'button[name="一覧に戻る"]',
    });
  });

  it('toTemplateLocator should ignore ephemeral text handles and fall back to description-derived locator', () => {
    const templateExportService = new RecorderTemplateExportService(
      {} as any,
      new RecorderLoopService()
    );

    expect(
      templateExportService.toTemplateLocator({
        tool: 'click',
        params: { text: '7_0' },
        description: '点击「一覧に戻る」按钮返回一览页面',
      } as any)
    ).toEqual({
      type: 'role',
      value: 'button[name="一覧に戻る"]',
    });
  });

  it('findLatestMeaningfulObservation should prefer the observation near conditional intent over the final list observation', () => {
    const templateExportService = new RecorderTemplateExportService(
      {} as any,
      new RecorderLoopService()
    );
    const detailObservation = {
      currentPageUrl: 'http://localhost/#approvals/detail',
      title: 'Approval Detail',
      text: '案件粗利率（毛利率） 25.5%',
      inputs: [],
      buttons: [{ text: '承認する (Approve)' }],
      headings: ['案件承認管理 / 案件詳細'],
      links: [],
    };
    const listObservation = {
      currentPageUrl: 'http://localhost/#approvals',
      title: 'Approval List',
      text: '案件承認管理 一覧',
      inputs: [],
      buttons: [{ text: '詳細' }],
      headings: ['案件承認管理'],
      links: [],
    };
    const session = {
      history: [
        { role: 'assistant', content: '已进入详情页', observation: detailObservation },
        { role: 'user', content: '[条件分歧] 毛利率大于20%自动承认，否则人工介入' },
        { role: 'assistant', content: '已记录条件说明', observation: detailObservation },
        { role: 'user', content: '返回一览页面 [循环结束]' },
        { role: 'assistant', content: '已返回列表', observation: listObservation },
      ],
      lastObservation: listObservation,
    };

    expect(templateExportService.findLatestMeaningfulObservation(session as any, 1)).toEqual(
      detailObservation
    );
  });

  it('inferSkillParameters should suppress fixed startUrl and expose rowIndex when template steps use row placeholders', () => {
    const parameterService = new RecorderParameterService();

    const params = parameterService.inferSkillParameters(
      [
        {
          tool: 'navigate',
          params: { url: 'http://localhost/#approvals' },
          description: '打开审批页面',
        },
      ],
      {
        includeStartUrl: false,
        templateSteps: [
          {
            step_id: 'step_2',
            action: 'click',
            locator: { type: 'css', value: ':nth-match([data-ai-action="detail"], ${rowIndex})' },
          },
        ],
      }
    );

    expect(params).toEqual([
      expect.objectContaining({
        name: 'rowIndex',
        required: true,
        exampleValue: '1',
      }),
    ]);
  });

  it('inferSkillParameters should infer template fill values and branch thresholds as export parameters', () => {
    const parameterService = new RecorderParameterService();

    const params = parameterService.inferSkillParameters([], {
      includeStartUrl: false,
      templateSteps: [
        {
          step_id: 'step_2',
          action: 'fill',
          locator: { type: 'role', value: 'textbox[name="ユーザー名 (Username)"]' },
          params: { value: 'admin' },
          description: '填写用户名',
        },
        {
          step_id: 'step_3',
          action: 'fill',
          locator: { type: 'role', value: 'textbox[name="パスワード (Password)"]' },
          params: { value: 'admin' },
          description: '填写密码',
        },
        {
          step_id: 'step_8',
          action: 'branch',
          branch: {
            condition_fn:
              '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
            description: '当毛利率达到阈值时继续执行，否则人工接管',
            takeover_reason: '毛利率低于20%时需要人工介入',
          },
          description: '根据毛利率阈值判断是否自动承认',
        },
      ],
    });

    expect(params).toEqual([
      expect.objectContaining({
        name: 'username',
        exampleValue: 'admin',
        source: 'template.step_2.params.value',
      }),
      expect.objectContaining({
        name: 'loginCredential',
        exampleValue: 'admin',
        source: 'template.step_3.params.value',
      }),
      expect.objectContaining({
        name: 'grossMarginThreshold',
        exampleValue: '20',
        source: 'template.step_8.branch.condition_fn',
      }),
    ]);
  });

  it('enrichCommandsWithGrounding should preserve outcome.grounding.chosenTarget on exported commands and script', async () => {
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
    });
    const targetCommand = {
      tool: 'click',
      params: { target: 'e42' },
      description: '打开 gross-margin 详情',
      locator: {
        strategy: 'role',
        value: 'button',
        role: 'button',
        name: 'gross-margin',
        generatedBy: 'system',
      },
    };
    const session = {
      sessionId: 'recorder-debug-grounding-enrich',
      runtimeSessionId: 'runtime-grounding-enrich',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      loopDraft: undefined,
      manualInterventions: [],
      history: [
        {
          role: 'assistant',
          content: '已点击 gross-margin 详情',
          commands: [targetCommand],
          outcome: {
            grounding: {
              chosenTarget: {
                ref: 'e42',
                role: 'button',
                name: 'gross-margin',
                contextLabel: 'margin-row-3',
                regionId: 'gross-margin-panel',
                locator: { strategy: 'role', value: 'button' },
                confidence: 0.9,
              },
            },
          },
        },
      ],
      executedCommands: [targetCommand],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '打开 gross-margin 详情'
    );

    expect(artifacts.skillDraft.commands[0].locator).toEqual(
      expect.objectContaining({
        ref: 'e42',
        role: 'button',
        name: 'gross-margin',
        contextLabel: 'margin-row-3',
        regionId: 'gross-margin-panel',
      })
    );
    expect(artifacts.script).toContain(
      '// grounding: ref=e42, role=button, name=gross-margin, context=margin-row-3, region=gross-margin-panel'
    );
  });
});
