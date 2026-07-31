import { describe, expect, it } from 'vitest';
import { normalizeWorkflowInputParamMap } from './workflowEditHelpers';

describe('normalizeWorkflowInputParamMap', () => {
  it('preserves and normalizes workflow input enum candidates', () => {
    const normalized = normalizeWorkflowInputParamMap({
      topic: {
        description: '搜索类别',
        required: false,
        defaultValue: 'general',
        enum: ['general', ' news ', 'finance', 'general'],
        type: 'string',
        exampleValue: 'news',
      },
    });

    expect(JSON.stringify(normalized.topic?.enum)).toBe(
      JSON.stringify(['general', 'news', 'finance'])
    );
    expect(normalized.topic?.defaultValue).toBe('general');
    expect(normalized.topic?.exampleValue).toBe('news');
  });
});
