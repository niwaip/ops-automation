import { OperationManifestValidatorService } from '../src/modules/llm-operation/eval/operation-manifest-validator.service';

describe('OperationManifestValidatorService', () => {
  const service = new OperationManifestValidatorService();
  const validManifest = {
    prompt: {
      systemTemplate: 'Return strict JSON with markdown_content.',
      userTemplate: 'Summarize these items: {{items}}',
      variables: ['items'],
    },
    inputSchema: {
      type: 'object',
      required: ['items'],
      properties: { items: { type: 'array' } },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['markdown_content'],
      properties: { markdown_content: { type: 'string' } },
      additionalProperties: false,
    },
    executionPolicy: { tools: 'disabled' },
    maxInputTokens: 4000,
    maxOutputTokens: 2000,
    timeoutMs: 180000,
  };

  it('accepts a closed contract whose Prompt variables match the input schema', () => {
    expect(service.validate(validManifest)).toMatchObject({
      passed: true,
      promptVariables: ['items'],
      inputFields: ['items'],
      outputFields: ['markdown_content'],
    });
  });

  it('rejects a Prompt placeholder not declared by the input contract', () => {
    expect(() =>
      service.validate({
        ...validManifest,
        prompt: {
          ...validManifest.prompt,
          userTemplate: 'Summarize: {{results}}',
          variables: ['results'],
        },
      }),
    ).toThrow(/results.*inputSchema|items.*没有被 userTemplate/);
  });

  it('rejects open output schemas and missing output instructions', () => {
    expect(() =>
      service.validate({
        ...validManifest,
        prompt: { ...validManifest.prompt, systemTemplate: 'Return JSON.' },
        outputSchema: { ...validManifest.outputSchema, additionalProperties: true },
      }),
    ).toThrow(/additionalProperties.*false|markdown_content/);
  });

  it('rejects variables in systemTemplate because the runtime does not render them', () => {
    expect(() =>
      service.validate({
        ...validManifest,
        prompt: {
          ...validManifest.prompt,
          systemTemplate: 'Summarize {{items}} and output markdown_content.',
        },
      }),
    ).toThrow(/systemTemplate 不能包含动态变量/);
  });
});
