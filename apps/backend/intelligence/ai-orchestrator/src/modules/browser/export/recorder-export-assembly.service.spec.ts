import { RecorderExportAssemblyService } from './recorder-export-assembly.service';
import { RecorderParameterService } from '../intent/recorder-parameter.service';
import { RecorderTemplateExportService } from './recorder-template-export.service';

describe('RecorderExportAssemblyService & Parameter Binding', () => {
  let assemblyService: RecorderExportAssemblyService;
  let parameterService: RecorderParameterService;
  let templateExportService: RecorderTemplateExportService;

  beforeEach(() => {
    parameterService = new RecorderParameterService();
    templateExportService = new RecorderTemplateExportService({} as any, {
      deriveLoopPendingKeyword: jest.fn(),
      splitRecordedCommandsForExport: jest.fn().mockReturnValue({ preLoopCommands: [], iterationCommands: [] }),
    } as any);

    assemblyService = new RecorderExportAssemblyService(
      {
        getPreferredDefaultModel: jest.fn().mockReturnValue(null),
        callModel: jest.fn(),
      } as any,
      {} as any,
      new (jest.requireActual('./recorder-export.service').RecorderExportService)(),
      parameterService,
      {} as any,
      templateExportService,
      {} as any
    );
  });

  describe('applyParameterPlaceholdersToTemplateSteps', () => {
    it('applies searchQuery, resultIndex, and startUrl placeholders to template steps', () => {
      const templateSteps = [
        {
          step_id: 'step_1',
          action: 'navigate',
          params: { url: 'https://www.baidu.com' },
          description: '打开百度',
        },
        {
          step_id: 'step_2',
          action: 'smart_search',
          params: { query: 'mcp' },
          description: '搜索 mcp',
        },
        {
          step_id: 'step_3',
          action: 'click_result',
          params: { index: 3 },
          description: '点击第3个结果',
        },
      ];

      const parameters = [
        {
          name: 'startUrl',
          description: '起始页面地址',
          required: false,
          exampleValue: 'https://www.baidu.com',
          source: 'template.step_1.params.url',
        },
        {
          name: 'searchQuery',
          description: '搜索关键词',
          required: true,
          exampleValue: 'mcp',
          source: 'template.step_2.params.query',
        },
        {
          name: 'resultIndex',
          description: '搜索结果序号',
          required: false,
          exampleValue: '3',
          source: 'template.step_3.params.index',
        },
      ];

      const result = (assemblyService as any).applyParameterPlaceholdersToTemplateSteps(
        templateSteps,
        parameters
      );

      expect(result[0].params.url).toBe('${startUrl}');
      expect(result[1].params.query).toBe('${searchQuery}');
      expect(result[2].params.index).toBe('${resultIndex}');
    });

    it('falls back to command.<index>.<field> mapping when template source is missing', () => {
      const templateSteps = [
        {
          step_id: 'step_1',
          action: 'navigate',
          params: { url: 'https://www.baidu.com' },
        },
        {
          step_id: 'step_2',
          action: 'smart_search',
          params: { query: 'mcp' },
        },
        {
          step_id: 'step_3',
          action: 'click_result',
          params: { index: 3 },
        },
        {
          step_id: 'step_4',
          action: 'type_text',
          params: { text: 'my text' },
        },
      ];

      const parameters = [
        {
          name: 'searchQuery',
          description: '搜索关键词',
          required: true,
          exampleValue: 'mcp',
          source: 'command.1.query',
        },
        {
          name: 'resultIndex',
          description: '搜索结果序号',
          required: false,
          exampleValue: '3',
          source: 'command.2.index',
        },
        {
          name: 'typedText4',
          description: '键盘输入文本',
          required: true,
          exampleValue: 'my text',
          source: 'command.3.text',
        },
      ];

      const result = (assemblyService as any).applyParameterPlaceholdersToTemplateSteps(
        templateSteps,
        parameters
      );

      expect(result[1].params.query).toBe('${searchQuery}');
      expect(result[2].params.index).toBe('${resultIndex}');
      expect(result[3].params.text).toBe('${typedText4}');
    });

    it('promotes click step with locator to click_result and removes locator when parameterized with resultIndex', () => {
      const templateSteps = [
        {
          step_id: 'step_1',
          action: 'navigate',
          params: { url: 'https://juejin.cn' },
        },
        {
          step_id: 'step_2',
          action: 'click',
          description: '点击第2条文章',
          locator: {
            type: 'role',
            value: 'link[name="Hardcoded Title"]',
          },
        },
      ];

      const parameters = [
        {
          name: 'resultIndex',
          description: '文章序号',
          required: false,
          exampleValue: '2',
          source: 'template.step_2.params.index',
        },
      ];

      const result = (assemblyService as any).applyParameterPlaceholdersToTemplateSteps(
        templateSteps,
        parameters
      );

      expect(result[1].action).toBe('click_result');
      expect(result[1].params.index).toBe('${resultIndex}');
      expect(result[1].locator).toBeUndefined();
      expect(result[1].description).toBe('打开详细页');
    });
  });

  describe('inferSkillParameters with templateSteps', () => {
    it('infers search, click_result, and type_text parameters from template steps', () => {
      const commands = [
        { tool: 'navigate', params: { url: 'https://www.baidu.com' } },
        { tool: 'smart_search', params: { query: 'mcp' } },
        { tool: 'click_result', params: { index: 3 } },
      ] as any[];

      const templateSteps = [
        { step_id: 'step_1', action: 'navigate', params: { url: 'https://www.baidu.com' } },
        { step_id: 'step_2', action: 'smart_search', params: { query: 'mcp' } },
        { step_id: 'step_3', action: 'click_result', params: { index: 3 } },
      ];

      const parameters = parameterService.inferSkillParameters(commands, {
        includeStartUrl: true,
        templateSteps: templateSteps as any,
      });

      expect(parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'startUrl',
            source: 'template.step_1.params.url',
          }),
          expect.objectContaining({
            name: 'searchQuery',
            source: 'template.step_2.params.query',
          }),
          expect.objectContaining({
            name: 'resultIndex',
            source: 'template.step_3.params.index',
          }),
        ])
      );
    });
  });

  describe('buildTemplateStepFromRecordedCommand', () => {
    it('preserves params.text for type_text commands', () => {
      const command = {
        tool: 'type_text',
        params: { text: 'hello world' },
        description: '输入文本',
      } as any;

      const step = templateExportService.buildTemplateStepFromRecordedCommand(command, 'step_1');
      expect(step?.action).toBe('type_text');
      expect(step?.params?.text).toBe('hello world');
    });
  });

  describe('extractOrdinalIndexFromText (multilingual support)', () => {
    it('extracts ordinal indices from Chinese texts', () => {
      expect(parameterService.extractOrdinalIndexFromText('打开第二条记录')).toBe('2');
      expect(parameterService.extractOrdinalIndexFromText('点击第一个搜索结果')).toBe('1');
      expect(parameterService.extractOrdinalIndexFromText('选择第3条文章')).toBe('3');
      expect(parameterService.extractOrdinalIndexFromText('点击第十个搜索项')).toBe('10');
      expect(parameterService.extractOrdinalIndexFromText('打开普通链接')).toBeUndefined();
    });

    it('extracts ordinal indices from English texts', () => {
      expect(parameterService.extractOrdinalIndexFromText('open the 2nd record')).toBe('2');
      expect(parameterService.extractOrdinalIndexFromText('click the third article')).toBe('3');
      expect(parameterService.extractOrdinalIndexFromText('select 1st result')).toBe('1');
      expect(parameterService.extractOrdinalIndexFromText('the 4th item')).toBe('4');
      expect(parameterService.extractOrdinalIndexFromText('click the fifth link')).toBe('5');
      expect(parameterService.extractOrdinalIndexFromText('open a new tab')).toBeUndefined();
    });

    it('extracts ordinal indices from Japanese texts', () => {
      expect(parameterService.extractOrdinalIndexFromText('2番目の記事を開く')).toBe('2');
      expect(parameterService.extractOrdinalIndexFromText('3つ目の検索結果をクリック')).toBe('3');
      expect(parameterService.extractOrdinalIndexFromText('1番目のレコード')).toBe('1');
      expect(parameterService.extractOrdinalIndexFromText('ホームを開く')).toBeUndefined();
    });
  });

  describe('LLM-powered parameter synthesis in buildExportArtifacts', () => {
    let mockModelService: {
      getPreferredDefaultModel: jest.Mock;
      callModel: jest.Mock;
    };
    let testAssemblyService: RecorderExportAssemblyService;

    beforeEach(() => {
      mockModelService = {
        getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'test-llm' }),
        callModel: jest.fn(),
      };

      testAssemblyService = new RecorderExportAssemblyService(
        mockModelService as any,
        {
          deriveLoopPendingKeyword: jest.fn(),
          optimizeTemplateStepsForLoopExport: (steps: any) => steps,
          buildExportLoopDraft: jest.fn(),
        } as any,
        new (jest.requireActual('./recorder-export.service').RecorderExportService)(),
        parameterService,
        new (jest.requireActual('./recorder-script-export.service').RecorderScriptExportService)(),
        {
          sanitizeRecordedCommandsForExport: (cmds: any) => cmds,
          buildTemplateStepsForExport: jest.fn(),
        } as any,
        {
          resolve: jest.fn().mockImplementation((cmd) => cmd.locator || {}),
        } as any
      );
    });

    it('synthesizes resultIndex from Chinese multi-turn intent and adapts step action', async () => {
      const session = {
        runtimeSessionId: 'sess-zh-1',
        backend: 'chrome-devtools',
        currentPageUrl: 'https://juejin.cn',
        history: [
          { role: 'user', content: '打开掘金' },
          { role: 'assistant', content: '已打开掘金' },
          { role: 'user', content: '打开第二条记录' },
        ],
        executedCommands: [
          { tool: 'navigate', params: { url: 'https://juejin.cn' }, description: '打开掘金' },
          {
            tool: 'click',
            params: {},
            locator: { type: 'role', value: 'link[name="文章标题"]' },
            description: '打开第二条记录：文章标题',
          },
        ],
      } as any;

      (testAssemblyService as any).recorderTemplateExportService.buildTemplateStepsForExport =
        jest.fn().mockResolvedValue([
          { step_id: 'step_1', action: 'navigate', params: { url: 'https://juejin.cn' } },
          {
            step_id: 'step_2',
            action: 'click',
            locator: { type: 'role', value: 'link[name="文章标题"]' },
            description: '打开第二条记录：文章标题',
          },
        ]);

      mockModelService.callModel.mockResolvedValueOnce({
        content: JSON.stringify({
          name: '浏览掘金推荐文章',
          description: '自动访问掘金首页并打开指定序号的推荐文章详情页',
          parameters: [
            {
              name: 'resultIndex',
              description: '文章在列表中的序号，从 1 开始',
              required: false,
              exampleValue: '2',
              targetStepId: 'step_2',
              source: 'template.step_2.params.index',
            },
          ],
        }),
      });

      const artifacts = await testAssemblyService.buildExportArtifacts(session, '打开掘金并打开第二条');

      // 1. startUrl is fixed and not parameterized
      expect(artifacts.skillDraft.parameters.some((p) => p.name === 'startUrl')).toBe(false);

      // 2. resultIndex is synthesized and present
      const resultIndexParam = artifacts.skillDraft.parameters.find((p) => p.name === 'resultIndex');
      expect(resultIndexParam).toBeDefined();
      expect(resultIndexParam?.exampleValue).toBe('2');

      // 3. Step 2 is bound to resultIndex placeholder
      const step2 = artifacts.templateSteps?.find((s) => s.step_id === 'step_2');
      expect(step2?.params?.index).toBe('${resultIndex}');

      // 4. Metadata is clean and meaningful
      expect(artifacts.skillDraft.name).toBe('浏览掘金推荐文章');
      expect(artifacts.skillDraft.description).toBe(
        '自动访问掘金首页并打开指定序号的推荐文章详情页'
      );
    });

    it('synthesizes parameters from English user intent ("open the 2nd record")', async () => {
      const session = {
        runtimeSessionId: 'sess-en-1',
        backend: 'cli',
        currentPageUrl: 'https://example.com',
        history: [
          { role: 'user', content: 'navigate to example.com' },
          { role: 'user', content: 'open the 2nd record' },
        ],
        executedCommands: [
          { tool: 'navigate', params: { url: 'https://example.com' } },
          { tool: 'click', params: {}, description: 'click item 2' },
        ],
      } as any;

      (testAssemblyService as any).recorderTemplateExportService.buildTemplateStepsForExport =
        jest.fn().mockResolvedValue([
          { step_id: 'step_1', action: 'navigate', params: { url: 'https://example.com' } },
          { step_id: 'step_2', action: 'click', description: 'click item 2' },
        ]);

      mockModelService.callModel.mockResolvedValueOnce({
        content: JSON.stringify({
          name: 'Example Record Viewer',
          description: 'Opens example.com and selects the specified item by ordinal index',
          parameters: [
            {
              name: 'resultIndex',
              description: 'Index of the record to view',
              required: false,
              exampleValue: '2',
              targetStepId: 'step_2',
            },
          ],
        }),
      });

      const artifacts = await testAssemblyService.buildExportArtifacts(session, 'View record');

      const resultIndexParam = artifacts.skillDraft.parameters.find((p) => p.name === 'resultIndex');
      expect(resultIndexParam).toBeDefined();
      expect(resultIndexParam?.exampleValue).toBe('2');

      const step2 = artifacts.templateSteps?.find((s) => s.step_id === 'step_2');
      expect(step2?.params?.index).toBe('${resultIndex}');
    });

    it('synthesizes parameters from Japanese user intent ("2番目の記事を開く")', async () => {
      const session = {
        runtimeSessionId: 'sess-ja-1',
        backend: 'cli',
        currentPageUrl: 'https://example.com',
        history: [
          { role: 'user', content: '2番目の記事を開く' },
        ],
        executedCommands: [
          { tool: 'navigate', params: { url: 'https://example.com' } },
          { tool: 'click', params: {}, description: '2番目の記事' },
        ],
      } as any;

      (testAssemblyService as any).recorderTemplateExportService.buildTemplateStepsForExport =
        jest.fn().mockResolvedValue([
          { step_id: 'step_1', action: 'navigate', params: { url: 'https://example.com' } },
          { step_id: 'step_2', action: 'click', description: '2番目の記事' },
        ]);

      mockModelService.callModel.mockResolvedValueOnce({
        content: JSON.stringify({
          name: '記事詳細閲覧',
          description: '指定したインデックスの記事を開く',
          parameters: [
            {
              name: 'resultIndex',
              description: '記事インデックス',
              required: false,
              exampleValue: '2',
              targetStepId: 'step_2',
            },
          ],
        }),
      });

      const artifacts = await testAssemblyService.buildExportArtifacts(session, '記事閲覧');

      const resultIndexParam = artifacts.skillDraft.parameters.find((p) => p.name === 'resultIndex');
      expect(resultIndexParam).toBeDefined();
      expect(resultIndexParam?.exampleValue).toBe('2');

      const step2 = artifacts.templateSteps?.find((s) => s.step_id === 'step_2');
      expect(step2?.params?.index).toBe('${resultIndex}');
    });

    it('falls back gracefully to rule parameters and fallback metadata when LLM fails', async () => {
      const session = {
        runtimeSessionId: 'sess-fail-1',
        backend: 'cli',
        currentPageUrl: 'https://example.com',
        history: [
          { role: 'user', content: '打开第二条记录' },
        ],
        executedCommands: [
          { tool: 'navigate', params: { url: 'https://example.com' } },
          { tool: 'click', params: {}, description: '打开第二条记录' },
        ],
      } as any;

      (testAssemblyService as any).recorderTemplateExportService.buildTemplateStepsForExport =
        jest.fn().mockResolvedValue([
          { step_id: 'step_1', action: 'navigate', params: { url: 'https://example.com' } },
          { step_id: 'step_2', action: 'click', description: '打开第二条记录' },
        ]);

      mockModelService.callModel.mockRejectedValueOnce(new Error('LLM rate limited'));

      const artifacts = await testAssemblyService.buildExportArtifacts(session, '打开第二条');

      // Rule baseline still caught resultIndex via extractOrdinalIndexFromText
      const resultIndexParam = artifacts.skillDraft.parameters.find((p) => p.name === 'resultIndex');
      expect(resultIndexParam).toBeDefined();
      expect(resultIndexParam?.exampleValue).toBe('2');

      // Template step was still properly parameterized
      const step2 = artifacts.templateSteps?.find((s) => s.step_id === 'step_2');
      expect(step2?.params?.index).toBe('${resultIndex}');
    });
  });
});

