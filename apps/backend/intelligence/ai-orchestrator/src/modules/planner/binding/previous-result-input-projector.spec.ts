import { projectPreviousResultInput } from './previous-result-input-projector';

describe('projectPreviousResultInput', () => {
  it('selects the richest structured collection for array operation inputs', () => {
    const projected = projectPreviousResultInput(
      { type: 'array' },
      {
        previousResultRef: { executionId: 'execution-1' },
        previousResultData: {
          artifacts: [{ name: 'link', url: 'https://example.com' }],
          searchResults: [
            { title: 'A', content: 'A'.repeat(500) },
            { title: 'B', content: 'B'.repeat(400) },
          ],
        },
      },
    );

    expect(projected).toMatchObject({
      sourceExecutionId: 'execution-1',
      value: [
        expect.objectContaining({ title: 'A' }),
        expect.objectContaining({ title: 'B' }),
      ],
    });
  });

  it('uses detailed prior text for string operation inputs', () => {
    expect(
      projectPreviousResultInput(
        { type: 'string' },
        { previousResultText: '# 完整结果\n\n安装步骤' },
      ),
    ).toEqual({ value: '# 完整结果\n\n安装步骤', sourceExecutionId: undefined });
  });

  it('unwraps a structured primary summary before falling back to a JSON detail string', () => {
    expect(
      projectPreviousResultInput(
        { type: 'string' },
        {
          previousResultData: { summary: '# 干净摘要\n\n正文' },
          previousResultText: '{"summary":"# 干净摘要\\n\\n正文"}',
        },
      ),
    ).toEqual({ value: '# 干净摘要\n\n正文', sourceExecutionId: undefined });
  });

  it('unwraps the primary text from a deterministic-plan final output snapshot', () => {
    expect(
      projectPreviousResultInput(
        { type: 'string', 'x-ops-input-role': 'content' },
        {
          previousResultData: {
            finalOutputs: [
              {
                value: '{"summary":"需要翻译的正文"}',
                fromNodeOutput: 'summary',
              },
            ],
          },
        },
        'content',
      ),
    ).toEqual({ value: '需要翻译的正文', sourceExecutionId: undefined });
  });

  it('does not invent an input when no completed result is available', () => {
    expect(projectPreviousResultInput({ type: 'array' }, {})).toBeUndefined();
  });

  it('prefers the trusted task-context reference over legacy previous-result fields', () => {
    expect(
      projectPreviousResultInput(
        { type: 'string', 'x-ops-input-role': 'content' },
        {
          taskContext: {
            schemaVersion: 'task-context/v1',
            references: [
              {
                kind: 'session_result',
                selector: 'latest_compatible',
                executionId: 'execution-2',
                trustLevel: 'verified_execution',
                semanticType: 'webpage_content',
                detailText: '可信的网页正文',
              },
            ],
          },
          previousResultText: '旧字段正文',
        },
        'content',
      ),
    ).toEqual({
      value: '可信的网页正文',
      sourceExecutionId: 'execution-2',
      semanticType: 'webpage_content',
    });
  });

  it('projects prior output only into content-bearing fields', () => {
    const previousResult = { previousResultText: '上一轮正文' };

    expect(
      projectPreviousResultInput(
        { type: 'string', 'x-ops-input-role': 'content' },
        previousResult,
        'content',
      ),
    ).toEqual({ value: '上一轮正文', sourceExecutionId: undefined });
    expect(
      projectPreviousResultInput(
        { type: 'string', 'x-ops-input-role': 'instruction' },
        previousResult,
        'instruction',
      ),
    ).toBeUndefined();
    expect(
      projectPreviousResultInput(
        { type: 'string', 'x-ops-input-role': 'configuration' },
        previousResult,
        'target_language',
      ),
    ).toBeUndefined();
  });

  it('keeps old manifests conservative by recognizing content field names', () => {
    expect(
      projectPreviousResultInput(
        { type: 'string' },
        { previousResultText: '上一轮正文' },
        'content',
      ),
    ).toEqual({ value: '上一轮正文', sourceExecutionId: undefined });
    expect(
      projectPreviousResultInput(
        { type: 'string' },
        { previousResultText: '上一轮正文' },
        'target_language',
      ),
    ).toBeUndefined();
  });
});
