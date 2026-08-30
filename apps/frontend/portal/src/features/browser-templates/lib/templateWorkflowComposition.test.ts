import { describe, expect, it } from 'vitest';
import type { TemplateStep } from '@/api/template';
import {
  buildTemplateWorkflowComposition,
  updateStepCaptureOptions,
  validateTemplateWorkflowCompositionEditor,
} from './templateWorkflowComposition';

const browserStep: TemplateStep = { step_id: 'step_2', action: 'click_result' };

describe('template workflow composition', () => {
  it('stores deterministic result capture on the selected browser step', () => {
    const step = updateStepCaptureOptions(browserStep, ['screenshot', 'mainContent']);

    expect(step.capture_profile).toEqual(expect.objectContaining({
      profile: 'article',
      capture: {
        screenshot: true,
        html: true,
        snapshot: false,
        mainContent: true,
      },
    }));
  });

  it('builds a source-step-bound custom LLM operation with a literal prompt', () => {
    const step = updateStepCaptureOptions(browserStep, ['html', 'mainContent']);
    const composition = buildTemplateWorkflowComposition([step], {
      processingSteps: [{
        id: 'analyze_result',
        type: 'llm_operation',
        sourceStepId: 'step_2',
        processingMode: 'custom',
        customPrompt: '提取故障、影响和建议',
        targetId: 'transform_text',
        targetVersion: '1',
        runWhen: 'browser_succeeded',
      }],
    });

    expect(composition?.pageAliases[0]).toEqual(expect.objectContaining({
      sourceStepId: 'step_2',
    }));
    expect(composition?.postProcessingSteps[0]).toEqual(expect.objectContaining({
      type: 'llm_operation',
      operationId: 'transform_text',
      sourceStepId: 'step_2',
      inputBindings: expect.objectContaining({
        instruction: { source: 'literal', value: '提取故障、影响和建议' },
      }),
    }));
    expect(composition?.finalNodeId).toBe('analyze_result');
  });

  it('requires deterministic cleaned content on the LLM source step', () => {
    expect(validateTemplateWorkflowCompositionEditor([browserStep], {
      processingSteps: [{
        id: 'summary',
        type: 'llm_operation',
        sourceStepId: 'step_2',
        processingMode: 'summary',
        customPrompt: '',
        targetId: 'summarize_text',
        targetVersion: '1',
        runWhen: 'browser_succeeded',
      }],
    })).toContain('处理步骤 1绑定的“step_2”必须勾选“清理正文”');
  });

  it('builds multi-step source bindings with combined output paths for LLM processing', () => {
    const step1 = updateStepCaptureOptions({ step_id: 'step_1', action: 'open_url' }, ['html', 'mainContent']);
    const step2 = updateStepCaptureOptions({ step_id: 'step_2', action: 'click_tab' }, ['html', 'mainContent']);
    const composition = buildTemplateWorkflowComposition([step1, step2], {
      processingSteps: [{
        id: 'analyze_all',
        type: 'llm_operation',
        sourceStepId: 'step_1',
        sourceStepIds: ['step_1', 'step_2'],
        processingMode: 'custom',
        customPrompt: '对比两个步骤的正文内容并总结',
        targetId: 'transform_text',
        targetVersion: '1',
        runWhen: 'browser_succeeded',
      }],
    });

    expect(composition?.outputDeclarations).toHaveLength(2);
    expect(composition?.postProcessingSteps[0]).toEqual(expect.objectContaining({
      type: 'llm_operation',
      sourceStepId: 'step_1',
      sourceStepIds: ['step_1', 'step_2'],
      inputBindings: expect.objectContaining({
        content: expect.objectContaining({
          path: 'step_1_clean_content,step_2_clean_content',
          paths: ['step_1_clean_content', 'step_2_clean_content'],
          transform: 'resolve_text_content',
        }),
        instruction: { source: 'literal', value: '对比两个步骤的正文内容并总结' },
      }),
    }));
  });

});
