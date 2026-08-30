import { TemplateValidator } from '../validators/template.validator';
import { LocatorValidator } from '../validators/locator.validator';
import type { TemplateJSON } from '../types/template.types';

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

describe('TemplateValidator workflow composition', () => {
  const validator = new TemplateValidator(new LocatorValidator());

  it('accepts template-owned browser to LLM composition', () => {
    const template = createTemplate();
    template.config.workflowComposition = {
      schemaVersion: 'browser-template-workflow-composition/v1',
      pageAliases: [{
        alias: 'result',
        match: {},
        captureProfile: {
          schemaVersion: 'capture-profile/v1',
          profile: 'article',
          capture: { screenshot: true, html: true, mainContent: true },
        },
      }],
      outputDeclarations: [
        { name: 'page_content', sourcePageAlias: 'result', kind: 'content', required: true },
      ],
      postProcessingSteps: [
        {
          id: 'analyze',
          type: 'llm_operation',
          operationId: 'summarize_text',
          operationVersion: 'v1',
          inputBindings: {
            text: {
              source: 'node_output',
              path: 'page_content',
              transform: 'resolve_text_content',
            },
          },
          runWhen: 'browser_succeeded',
        },
      ],
    };

    expect(validator.validate(template).errors).toEqual([]);
  });

  it('rejects post-processing that references an unknown page alias', () => {
    const template = createTemplate();
    template.config.workflowComposition = {
      schemaVersion: 'browser-template-workflow-composition/v1',
      pageAliases: [{
        alias: 'result',
        match: {},
        captureProfile: {
          schemaVersion: 'capture-profile/v1',
          profile: 'article',
          capture: { screenshot: true, html: true, mainContent: true },
        },
      }],
      outputDeclarations: [
        { name: 'page_content', sourcePageAlias: 'missing', kind: 'content', required: true },
      ],
      postProcessingSteps: [],
    };

    expect(validator.validate(template).errors).toContain(
      'config.workflowComposition output references an unknown page alias'
    );
  });

  it('accepts per-step deterministic capture and a source-bound custom LLM step', () => {
    const template = createTemplate();
    const step0 = template.steps[0]!;
    step0.capture_profile = {
      schemaVersion: 'capture-profile/v1', profile: 'article',
      capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
      limits: { htmlBytes: 1_000_000, contentChars: 30_000, tableCells: 500 },
    };
    template.config.workflowComposition = {
      schemaVersion: 'browser-template-workflow-composition/v1',
      pageAliases: [{
        alias: 'page_step_1', sourceStepId: 'step_1', match: {},
        captureProfile: step0.capture_profile,
      }],
      outputDeclarations: [{
        name: 'step_1_clean_content', sourcePageAlias: 'page_step_1',
        sourceStepId: 'step_1', kind: 'content', required: true,
      }],
      postProcessingSteps: [{
        id: 'analyze', type: 'llm_operation', operationId: 'transform_text', operationVersion: '1',
        sourceStepId: 'step_1', processingMode: 'custom', promptTemplate: '提取风险',
        inputBindings: {
          content: { source: 'node_output', path: 'step_1_clean_content', transform: 'resolve_text_content' },
          instruction: { source: 'literal', value: '提取风险' },
        },
        runWhen: 'browser_succeeded',
      }],
    };

    expect(validator.validate(template).errors).toEqual([]);
  });

  it('accepts an explicit post-processing DAG with a declared final sink', () => {
    const template = createTemplate();
    const step0 = template.steps[0]!;
    step0.capture_profile = {
      schemaVersion: 'capture-profile/v1', profile: 'article',
      capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
      limits: { htmlBytes: 1_000_000, contentChars: 30_000, tableCells: 500 },
    };
    template.config.workflowComposition = {
      schemaVersion: 'browser-template-workflow-composition/v1',
      pageAliases: [{
        alias: 'page_step_1', sourceStepId: 'step_1', match: {}, captureProfile: step0.capture_profile,
      }],
      outputDeclarations: [{
        name: 'page_content', sourcePageAlias: 'page_step_1', sourceStepId: 'step_1',
        kind: 'content', required: true,
      }],
      finalNodeId: 'summarize',
      postProcessingSteps: [
        {
          id: 'extract', type: 'llm_operation', operationId: 'transform_text', operationVersion: '1',
          inputBindings: {
            content: { source: 'node_output', path: 'page_content', transform: 'resolve_text_content' },
          },
          runWhen: 'browser_succeeded',
        },
        {
          id: 'summarize', type: 'llm_operation', operationId: 'summarize_text', operationVersion: '1',
          dependsOn: ['extract'],
          inputBindings: {
            text: { source: 'node_output', nodeId: 'extract', path: 'result' },
          },
          runWhen: 'browser_succeeded',
        },
      ],
    };

    expect(validator.validate(template).errors).toEqual([]);
  });
});
