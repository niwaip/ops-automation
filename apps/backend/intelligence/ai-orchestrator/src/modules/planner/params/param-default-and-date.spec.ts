import { ParamBilingualService } from './param-bilingual.service';
import { ParamContextMergeService } from './param-context-merge.service';
import { ParamPolicyService } from './param-policy.service';
import { ParamRecognizerService } from './param-recognizer.service';
import { ParamRequiredInputPresentationService } from './param-required-input-presentation.service';
import { ParamSchemaService } from './param-schema.service';
import { ParamValueService } from './param-value.service';
import { inferFieldValueFromExplicitPatterns } from '../../recognizer/recognizer-pattern-matcher';

describe('param-default-and-date specifications', () => {
  function buildParamRecognizerService(): ParamRecognizerService {
    return new ParamRecognizerService(
      new ParamSchemaService(),
      new ParamContextMergeService(),
      new ParamBilingualService({ callModel: jest.fn() } as any),
      new ParamPolicyService(),
      new ParamValueService(),
      new ParamRequiredInputPresentationService()
    );
  }

  describe('default value resolution for required parameters', () => {
    it('applies workflow policy defaultValue even when parameter is required (e.g. confidentiality.durationYears)', () => {
      const service = buildParamRecognizerService();
      const matchedSkill = {
        paramsSchema: {
          properties: {
            'confidentiality.durationYears': {
              type: 'number',
              description: '保密期限的具体年数',
              required: true,
            },
          },
          required: ['confidentiality.durationYears'],
        },
        apiEndpoints: {
          runtimeMetadata: {
            workflowInputPolicy: {
              params: {
                'confidentiality.durationYears': {
                  defaultValue: 3,
                  requiredMode: 'always',
                },
              },
            },
          },
        },
      } as any;

      const [input] = service.buildRequiredInputs(matchedSkill, {
        params: {},
        confidence: 0.9,
      });

      expect(input).toBeDefined();
      expect(input.name).toBe('confidentiality.durationYears');
      expect(input.value).toBe(3);
      expect(input.source).toBe('workflow_default');
      expect(input.missing).toBe(false);
    });

    it('applies workflow policy defaultValue for pre-set party (e.g. partyB.name)', () => {
      const service = buildParamRecognizerService();
      const matchedSkill = {
        paramsSchema: {
          properties: {
            'partyB.name': {
              type: 'string',
              description: '乙方公司全称',
              required: true,
            },
          },
          required: ['partyB.name'],
        },
        apiEndpoints: {
          runtimeMetadata: {
            workflowInputPolicy: {
              params: {
                'partyB.name': {
                  defaultValue: '富士通 ( 中国 ) 信息系統有限公司',
                  requiredMode: 'always',
                },
              },
            },
          },
        },
      } as any;

      const [input] = service.buildRequiredInputs(matchedSkill, {
        params: {},
        confidence: 0.9,
      });

      expect(input).toBeDefined();
      expect(input.name).toBe('partyB.name');
      expect(input.value).toBe('富士通 ( 中国 ) 信息系統有限公司');
      expect(input.source).toBe('workflow_default');
      expect(input.missing).toBe(false);
    });

    it('filters out dummy 0 for date component fields so dummy default does not suppress missing status', () => {
      const service = buildParamRecognizerService();
      const matchedSkill = {
        paramsSchema: {
          properties: {
            'agreement.signDate.year': {
              type: 'number',
              description: '协议签订年份',
              required: true,
            },
          },
          required: ['agreement.signDate.year'],
        },
        apiEndpoints: {
          runtimeMetadata: {
            workflowInputPolicy: {
              params: {
                'agreement.signDate.year': {
                  defaultValue: 0,
                  requiredMode: 'always',
                },
              },
            },
          },
        },
      } as any;

      const [input] = service.buildRequiredInputs(matchedSkill, {
        params: {},
        confidence: 0.9,
      });

      expect(input).toBeDefined();
      expect(input.name).toBe('agreement.signDate.year');
      expect(input.value).toBeUndefined();
      expect(input.missing).toBe(true);
    });
  });

  describe('explicit pattern matching for relative dates (今天) and party roles', () => {
    const userInput =
      '生成保密协议 我们是乙方，需要和 北京大街100号 的 豆包公司 ，关于 ai模型开发项目签订保密协议， 签订日是今天';

    it('extracts current date components (year, month, day) when user input mentions 签订日是今天', () => {
      const now = new Date();
      const year = inferFieldValueFromExplicitPatterns(
        'agreement.signDate.year',
        { type: 'number', description: '协议签订年份' },
        userInput
      );
      const month = inferFieldValueFromExplicitPatterns(
        'agreement.signDate.month',
        { type: 'number', description: '协议签订月份' },
        userInput
      );
      const day = inferFieldValueFromExplicitPatterns(
        'agreement.signDate.day',
        { type: 'number', description: '协议签订日（日号）' },
        userInput
      );

      expect(year).toBe(now.getFullYear());
      expect(month).toBe(now.getMonth() + 1);
      expect(day).toBe(now.getDate());
    });

    it('extracts partyA name and address when user specifies 我们是乙方', () => {
      const partyAName = inferFieldValueFromExplicitPatterns(
        'partyA.name',
        { type: 'string', displayName: '甲方公司法定全称', description: '协议首部甲方法律主体名称' },
        userInput
      );
      const partyAAddress = inferFieldValueFromExplicitPatterns(
        'partyA.address',
        { type: 'string', displayName: '甲方注册或经营地址', description: '协议首部甲方注册或联系地址' },
        userInput
      );

      expect(partyAName).toBe('豆包公司');
      expect(partyAAddress).toBe('北京大街100号');
    });
  });
});
