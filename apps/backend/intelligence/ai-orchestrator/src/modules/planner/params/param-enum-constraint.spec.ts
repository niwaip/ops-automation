import { isParamEnumValueAllowed, resolveParamEnumValues } from './param-enum-constraint';
import { ParamBilingualService } from './param-bilingual.service';
import { ParamContextMergeService } from './param-context-merge.service';
import { ParamPolicyService } from './param-policy.service';
import { ParamRecognizerService } from './param-recognizer.service';
import { ParamRequiredInputPresentationService } from './param-required-input-presentation.service';
import { ParamSchemaService } from './param-schema.service';
import { ParamValueService } from './param-value.service';

describe('param enum constraints', () => {
  it('prefers an explicit JSON Schema enum', () => {
    expect(
      resolveParamEnumValues({
        enum: ['general', 'news', 'finance'],
        description: '仅允许枚举值 ignored、values',
      })
    ).toEqual(['general', 'news', 'finance']);
  });

  it('infers enum values from a legacy Chinese description', () => {
    expect(
      resolveParamEnumValues({
        description: '搜索类别，仅允许枚举值 general、news、finance',
      })
    ).toEqual(['general', 'news', 'finance']);
  });

  it('stops legacy enum extraction before the default-value suffix', () => {
    expect(
      resolveParamEnumValues({
        extractionPrompt: '搜索类别，可选枚举值 general、news 或 finance 默认值: general',
      })
    ).toEqual(['general', 'news', 'finance']);
  });

  it('does not infer an enum from ordinary descriptive prose', () => {
    expect(
      resolveParamEnumValues({
        description: '搜索最新的 AI 新闻并返回摘要',
      })
    ).toBeUndefined();
  });

  it('rejects a natural-language query that is not an allowed enum value', () => {
    const allowed = ['general', 'news', 'finance'];
    expect(isParamEnumValueAllowed('最新的AI新闻', allowed)).toBe(false);
    expect(isParamEnumValueAllowed('news', allowed)).toBe(true);
  });

  it('adds inferred enum values to the recognizer schema', () => {
    const service = new ParamSchemaService();
    const properties = service.buildRecognizerParamsSchemaProperties({
      topic: {
        type: 'string',
        description: '搜索类别，仅允许枚举值 general、news、finance',
        required: false,
        default: 'general',
      },
    });

    expect(properties.topic).toMatchObject({
      type: 'string',
      enum: ['general', 'news', 'finance'],
    });
    expect(properties.topic?.default).toBeUndefined();
  });

  it('falls back to a valid default when a legacy enum receives an invalid value', () => {
    const service = buildParamRecognizerService();
    const [topic] = service.buildRequiredInputs(
      {
        paramsSchema: {
          properties: {
            topic: {
              type: 'string',
              description: '搜索类别，仅允许枚举值 general、news、finance',
              required: false,
              default: 'general',
            },
          },
          required: [],
        },
      } as any,
      {
        params: { topic: '最新的AI新闻' },
        confidence: 0.92,
        field_confidences: { topic: 0.88 },
      }
    );

    expect(topic).toMatchObject({
      name: 'topic',
      enum: ['general', 'news', 'finance'],
      value: 'general',
      source: 'default',
      missing: false,
    });
  });

  it('does not apply a default that violates the inferred enum', () => {
    const service = buildParamRecognizerService();
    const [topic] = service.buildRequiredInputs(
      {
        paramsSchema: {
          properties: {
            topic: {
              type: 'string',
              description: '搜索类别，仅允许枚举值 general、news、finance',
              required: false,
              default: 'invalid-default',
            },
          },
          required: [],
        },
      } as any,
      {
        params: { topic: '最新的AI新闻' },
        confidence: 0.92,
      }
    );

    expect(topic).toMatchObject({
      value: undefined,
      source: 'unresolved',
      missing: false,
    });
  });
});

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
