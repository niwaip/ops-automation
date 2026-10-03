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
});
