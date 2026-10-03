import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TaskProgressCard from '@chat-web/components/TaskProgressCard';

describe('TaskProgressCard - Single Running Indicator', () => {
  it('renders exactly one "执行中" running indicator in the header', () => {
    const html = renderToStaticMarkup(
      <TaskProgressCard
        currentProgressLog={{
          stage: 'thought',
          text: '已识别到技能: 登录并且调用ai，正在识别参数...',
        }}
        isRunning={true}
      />
    );

    // Header has 执行中 and 当前步骤
    expect(html).toContain('当前步骤');
    expect(html).toContain('已识别到技能: 登录并且调用ai，正在识别参数...');

    // Matches of "执行中" in the rendered markup should be exactly 1
    const occurrences = (html.match(/执行中/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('renders "执行异常" when progress indicates error, and does not duplicate', () => {
    const html = renderToStaticMarkup(
      <TaskProgressCard
        currentProgressLog={{
          stage: 'action',
          text: '调用接口失败，状态码 500',
        }}
        isRunning={true}
      />
    );

    expect(html).toContain('执行异常');
    expect(html).not.toContain('执行中');
  });

  it('returns null when isRunning is false', () => {
    const html = renderToStaticMarkup(
      <TaskProgressCard
        currentProgressLog={{
          stage: 'thought',
          text: '已识别到技能',
        }}
        isRunning={false}
      />
    );

    expect(html).toBe('');
  });
});
