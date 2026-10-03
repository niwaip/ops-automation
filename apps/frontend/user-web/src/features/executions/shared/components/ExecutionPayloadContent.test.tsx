import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExecutionPayloadContent from './ExecutionPayloadContent';

describe('ExecutionPayloadContent deep content extraction policy', () => {
  it('does NOT promote intermediate interactive step text (e.g. click, loop_stop_read) as phase output', () => {
    const payload = {
      stepResults: [
        {
          stepId: 'step_1',
          action: 'navigate',
          output: { text: '页面导航成功' },
        },
        {
          stepId: 'loop_stop_read:after:3',
          action: 'read_value',
          output: {
            text: '自動承認の判定基準を満たしていません。',
          },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ExecutionPayloadContent value={payload} emptyText="暂无阶段输出" />
    );

    // Should NOT display the intermediate Japanese text from loop_stop_read
    expect(html).not.toContain('自動承認の判定基準を満たしていません。');
  });

  it('promotes text from explicit output steps (e.g. action === extract or isOutput: true)', () => {
    const payload = {
      stepResults: [
        {
          stepId: 'step_1',
          action: 'navigate',
        },
        {
          stepId: 'step_extract',
          action: 'extract',
          isOutput: true,
          output: {
            text: '这是明确提取的最终正文内容。',
          },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ExecutionPayloadContent value={payload} emptyText="暂无阶段输出" />
    );

    expect(html).toContain('这是明确提取的最终正文内容。');
  });

  it('renders top-level text / markdown directly', () => {
    const payload = {
      text: '这是阶段的总结报告。',
    };

    const html = renderToStaticMarkup(
      <ExecutionPayloadContent value={payload} emptyText="暂无阶段输出" />
    );

    expect(html).toContain('这是阶段的总结报告。');
  });
});
