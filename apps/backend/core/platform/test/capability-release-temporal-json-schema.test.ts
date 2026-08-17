import { jsonSchemaValidator } from '@ops/backend-runtime-capability-contract';
import { CapabilityReleaseTemporalSchemaService } from '../../../registry-release/release-manager/src/compiler/capability-release-temporal-schema.service';

describe('Temporal capability JSON Schema projection', () => {
  const service = new CapabilityReleaseTemporalSchemaService();

  it('projects integer timestamps and dates to standards-compliant JSON Schema', () => {
    const schema = service.buildTemporalParamsSchema({
      inputParams: {
        time: {
          type: 'integer',
          format: 'unix-milliseconds',
          description: '时光机模式毫秒时间戳',
        },
        signingDate: {
          type: 'date',
          format: 'date',
          description: '签署日期',
        },
      },
    });

    expect((schema.properties as any).time).toEqual(
      expect.objectContaining({
        type: 'integer',
        'x-temporal-format': 'unix-milliseconds',
      })
    );
    expect((schema.properties as any).time).not.toHaveProperty('format');
    expect((schema.properties as any).signingDate).toEqual(
      expect.objectContaining({ type: 'string', format: 'date' })
    );
    expect(
      jsonSchemaValidator.validateInput(
        { time: 1786492800000, signingDate: '2026-08-12' },
        schema
      )
    ).toEqual({ valid: true });
  });

  it('keeps Workflow DSL types authoritative when merging a stale params schema', () => {
    const schema = service.resolveEffectiveTemporalParamsSchema({
      workflowDsl: {
        inputParams: {
          time: {
            type: 'integer',
            format: 'unix-milliseconds',
            description: '毫秒时间戳',
          },
        },
      },
      paramsSchema: {
        properties: {
          time: { type: 'date', description: '旧发布草案中的错误类型' },
          legacyDate: { type: 'date' },
        },
        required: [],
      },
    });

    expect((schema.properties as any).time).toEqual(
      expect.objectContaining({
        type: 'integer',
        'x-temporal-format': 'unix-milliseconds',
        description: '毫秒时间戳',
      })
    );
    expect((schema.properties as any).time).not.toHaveProperty('format');
    expect((schema.properties as any).legacyDate).toEqual(
      expect.objectContaining({ type: 'string', format: 'date' })
    );
    expect(jsonSchemaValidator.validateInput({ time: 1786492800000 }, schema)).toEqual({
      valid: true,
    });
  });

  it('builds smoke input from defaults within one validation scenario only', () => {
    const input = service.buildSmokeTestInput(
      { sourceType: 'temporal_workflow' } as any,
      {
        sourcePayload: {
          workflowDsl: {
            inputParams: {
              type: { type: 'string', defaultValue: 'weibo', exampleValue: 'douyin' },
              time: {
                type: 'integer',
                format: 'unix-milliseconds',
                exampleValue: 1700000000000,
              },
              keyword: { type: 'string', exampleValue: 'AI' },
            },
            validation: {
              scenarios: [
                { id: 'current', parameters: ['type'], requiredParameters: ['type'] },
                { id: 'history', parameters: ['type', 'time'], requiredParameters: ['type', 'time'] },
              ],
            },
          },
        },
      } as any,
      'test'
    );

    expect(input).toEqual({
      type: 'weibo',
      smokeTest: true,
      environment: 'test',
    });
  });
});
