import { compileDraftValidationContract } from '../src/modules/temporal-workflow/temporal-workflow-draft-validation.compiler';

describe('compileDraftValidationContract', () => {
  it('anchors legacy envelope assertions below the only declared business field', () => {
    const result = compileDraftValidationContract(
      {
        assertions: [
          {
            path: '$.result.result.businessData.list',
            operator: 'minItems',
            value: 1,
          },
        ],
      },
      {
        fields: {
          result: { source: { step: 'step_1', path: '$.result' } },
        },
      }
    );

    expect(result.issues).toEqual([]);
    expect(result.validation?.assertions).toEqual([
      {
        field: 'result',
        fieldPath: '$.list',
        path: undefined,
        operator: 'minItems',
        value: 1,
      },
    ]);
  });

  it('keeps logical field assertions independent from the runtime envelope', () => {
    const result = compileDraftValidationContract(
      {
        assertions: [{ field: 'items', fieldPath: '$', operator: 'minItems', value: 1 }],
      },
      {
        fields: {
          items: { type: 'array', source: { step: 'step_1', path: '$.list' } },
        },
      }
    );

    expect(result).toEqual({
      issues: [],
      validation: {
        assertions: [
          {
            field: 'items',
            fieldPath: '$',
            path: undefined,
            operator: 'minItems',
            value: 1,
          },
        ],
      },
    });
  });

  it('rejects assertions that reference undeclared business fields', () => {
    const result = compileDraftValidationContract(
      {
        assertions: [{ field: 'missing', operator: 'nonEmpty' }],
      },
      { fields: { items: { source: { step: 'step_1', path: '$.list' } } } }
    );

    expect(result.issues).toEqual(['验证断言引用了未声明的业务输出字段: missing']);
  });

  it('normalizes common AI operator aliases against typed output fields', () => {
    const result = compileDraftValidationContract(
      {
        assertions: [
          { field: 'total_items', operator: 'min', value: 1 },
          { field: 'updated_at', operator: 'required' as never, value: true },
          { field: 'market', operator: 'required' as never, value: true },
        ],
      },
      {
        fields: {
          total_items: { type: 'integer', source: { step: 'step_1', path: '$.total_items' } },
          updated_at: { type: 'integer', source: { step: 'step_1', path: '$.updated_at' } },
          market: { type: 'object', source: { step: 'step_1', path: '$.market' } },
        },
      }
    );

    expect(result.issues).toEqual([]);
    expect(result.validation?.assertions).toEqual([
      { field: 'total_items', fieldPath: '$', path: undefined, operator: 'min', value: 1 },
      {
        field: 'updated_at',
        fieldPath: '$',
        path: undefined,
        operator: 'exists',
        value: undefined,
      },
      { field: 'market', fieldPath: '$', path: undefined, operator: 'exists', value: undefined },
    ]);
  });

  it('rejects unknown and type-incompatible operators before runtime validation', () => {
    const result = compileDraftValidationContract(
      {
        assertions: [
          { field: 'items', operator: 'contains' as never, value: 'x' },
          { field: 'items', operator: 'min', value: 1 },
        ],
      },
      { fields: { items: { type: 'array', source: { step: 'step_1', path: '$.items' } } } }
    );

    expect(result.issues).toEqual([
      '验证断言使用了不支持的操作符: contains',
      '验证断言 min 只能用于 integer/number 字段: items',
    ]);
  });
});
