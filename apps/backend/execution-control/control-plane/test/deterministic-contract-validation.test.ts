import { projectLlmOperationInput, validateInputContract } from '../src/modules/execution/plan-runtime/deterministic-contract-validation';

describe('LLM operation input projection', () => {
  it('sends only declared inputs to a closed operation schema', () => {
    const step = {
      inputSchemaJson: {
        type: 'object',
        additionalProperties: false,
        required: ['content', 'instruction'],
        properties: { content: { type: 'string' }, instruction: { type: 'string' } },
      },
    };
    const projected = projectLlmOperationInput(step, {
      content: 'Source text',
      instruction: 'Summarize it',
      taskContext: { references: [] },
      fileBase64: 'image bytes',
    });
    expect(projected).toEqual({ content: 'Source text', instruction: 'Summarize it' });
    expect(() => validateInputContract(step, projected, 'execution-1')).not.toThrow();
  });

  it('preserves extension fields when the operation schema allows them', () => {
    const input = { content: 'Source text', extra: 'allowed' };
    expect(projectLlmOperationInput({ inputSchemaJson: { additionalProperties: true } }, input)).toEqual(input);
  });
});
