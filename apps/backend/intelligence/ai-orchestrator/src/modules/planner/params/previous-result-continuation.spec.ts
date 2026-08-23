import { projectPreviousResultIntoRecognition } from './previous-result-continuation';

describe('projectPreviousResultIntoRecognition', () => {
  const schema = {
    properties: {
      content: {
        type: 'string' as const,
        description: '推送正文',
        required: true,
      },
      title: {
        type: 'string' as const,
        description: '可选标题',
        required: false,
      },
    },
    required: ['content'],
  };

  it('projects the previous primary output into the only unresolved required field', () => {
    const result = projectPreviousResultIntoRecognition(
      { params: {}, confidence: 0.9, uncertain_fields: ['content'] },
      schema,
      {
        mode: 'single_step_continuation',
        previous_result: {
          executionId: 'execution-summary-1',
          structuredData: { summary: '# 安装摘要' },
          detailText: '{"summary":"# 安装摘要"}',
        },
      },
    );

    expect(result.projectedFields).toEqual(['content']);
    expect(result.sourceExecutionId).toBe('execution-summary-1');
    expect(result.recognized.params).toEqual({ content: '# 安装摘要' });
    expect(result.recognized.field_confidences?.content).toBe(1);
    expect(result.recognized.uncertain_fields).toEqual([]);
  });

  it('does not overwrite content explicitly recognized from the current request', () => {
    const result = projectPreviousResultIntoRecognition(
      { params: { content: '当前请求明确提供的正文' }, confidence: 0.95 },
      schema,
      {
        mode: 'single_step_continuation',
        previous_result: { structuredData: { summary: '上一结果' } },
      },
    );

    expect(result.projectedFields).toEqual([]);
    expect(result.recognized.params.content).toBe('当前请求明确提供的正文');
  });

  it('stays conservative when multiple required fields cannot be mapped exactly', () => {
    const result = projectPreviousResultIntoRecognition(
      { params: {}, confidence: 0.9 },
      {
        properties: {
          content: schema.properties.content,
          recipient: {
            type: 'string',
            description: '接收人',
            required: true,
          },
        },
        required: ['content', 'recipient'],
      },
      {
        mode: 'single_step_continuation',
        previous_result: { structuredData: { summary: '上一结果' } },
      },
    );

    expect(result.projectedFields).toEqual([]);
  });

  it('does not use prior content as a transformation instruction', () => {
    const result = projectPreviousResultIntoRecognition(
      { params: {}, confidence: 0.9 },
      {
        properties: {
          instruction: {
            type: 'string',
            description: '本轮转换要求',
            required: true,
          },
        },
        required: ['instruction'],
      },
      {
        mode: 'single_step_continuation',
        previous_result: { structuredData: { summary: '上一轮正文' } },
      },
    );

    expect(result.projectedFields).toEqual([]);
    expect(result.recognized.params).toEqual({});
  });
});
