import { TemplateValidator } from '../src/validators/template.validator';
import { LocatorValidator } from '../src/validators/locator.validator';
import type { TemplateJSON } from '../src/types/template.types';

const createTemplate = (executionPolicy?: string): TemplateJSON => ({
  id: 'tpl-1',
  name: 'step-policy-template',
  version: '1.0.0',
  status: 'DRAFT',
  params_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  steps: [
    {
      step_id: 'step_1',
      action: 'click',
      locator: { type: 'css', value: '#approve' },
      execution_policy: executionPolicy as any,
      description: '点击承认',
    },
  ],
  guards: [],
  config: {},
  created_by: 'tester',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: {
    created_by: 'tester',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
});

describe('TemplateValidator execution_policy', () => {
  let validator: TemplateValidator;

  beforeEach(() => {
    validator = new TemplateValidator(new LocatorValidator());
  });

  it('accepts supported step execution policies', () => {
    const result = validator.validate(createTemplate('require_takeover'));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects unsupported step execution policies', () => {
    const result = validator.validate(createTemplate('ask_ai_again'));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Step "step_1" has invalid execution_policy "ask_ai_again"'
    );
  });
});
