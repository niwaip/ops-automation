import { DeterministicParamResolverService } from './deterministic-param-resolver.service';

describe('DeterministicParamResolverService', () => {
  it('resolves a contract alias to its canonical enum value', () => {
    const result = new DeterministicParamResolverService().resolve('请处理华东区', {
      properties: {
        region: {
          type: 'string',
          description: '区域',
          required: true,
          enum: ['east', 'north'],
          'x-enum-aliases': { east: ['华东区'], north: ['华北区'] },
        },
      },
      required: ['region'],
    });

    expect(result.params).toEqual({ region: 'east' });
    expect(result.field_confidences).toEqual({ region: 1 });
  });
});
