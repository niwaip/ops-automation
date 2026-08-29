import { describe, expect, it } from 'vitest';

import { parseStepOutput } from './StepOutputViewer';

describe('parseStepOutput', () => {
  it('extracts browser content nested in a recorded step output', () => {
    const parsed = parseStepOutput({
      inline: {
        backend: 'cli',
        stepResults: [
          {
            stepId: 'n1-step-1',
            action: 'goto',
            success: true,
            output: {
              text: '这是浏览器从文章页面提取的正文。',
              pageTitle: '测试文章',
              pageUrl: 'https://example.com/article',
            },
          },
        ],
      },
      resultRef: { id: 'result-ref-1' },
    });

    expect(parsed.cleanContents).toEqual([
      expect.objectContaining({
        text: '这是浏览器从文章页面提取的正文。',
        title: '测试文章',
        sourceUrl: 'https://example.com/article',
      }),
    ]);
    expect(parsed.pageTitle).toBe('测试文章');
    expect(parsed.pageUrl).toBe('https://example.com/article');
    expect(parsed.browserSteps).toEqual([
      expect.objectContaining({
        action: 'goto',
        stepId: 'n1-step-1',
        success: true,
      }),
    ]);
  });

  it('extracts browser content from a phase-level single step wrapper', () => {
    const parsed = parseStepOutput({
      action: 'goto',
      status: 'completed',
      stepId: 'n1-step-1',
      output: {
        text: '阶段接口返回的文章正文。',
        pageTitle: '阶段文章',
        pageUrl: 'https://example.com/phase-article',
      },
    });

    expect(parsed.cleanContents).toEqual([
      expect.objectContaining({
        text: '阶段接口返回的文章正文。',
        title: '阶段文章',
        sourceUrl: 'https://example.com/phase-article',
      }),
    ]);
    expect(parsed.pageTitle).toBe('阶段文章');
    expect(parsed.pageUrl).toBe('https://example.com/phase-article');
  });

  it('extracts browser content from a browser template phase envelope', () => {
    const parsed = parseStepOutput({
      action: 'browser_template',
      output: {
        backend: 'cli',
        stepResults: [
          {
            action: 'goto',
            output: {
              text: '模板阶段中的文章正文。',
              pageTitle: '模板文章',
              pageUrl: 'https://example.com/template-article',
            },
          },
        ],
      },
      status: 'completed',
    });

    expect(parsed.cleanContents[0]).toEqual(
      expect.objectContaining({ text: '模板阶段中的文章正文。' })
    );
  });
});
